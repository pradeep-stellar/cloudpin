import { describe, it, expect, vi } from 'vitest';
import { exportNetscape, type ExportBookmark } from '../../src/domain/netscape';
import { normalizeUrl } from '../../src/domain/url-normalize';
import { normalizeTagName } from '../../src/domain/tags';
import { readPostgresDb, type LinkdingDb } from '../../tools/migrate-linkding';

type Queryable = {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
};

function toExportBookmarks(
  sourceBookmarks: Array<{
    url: string;
    title: string;
    description: string;
    notes: string;
    is_archived: boolean;
    unread: boolean;
    shared: boolean;
    date_added: string;
    tag_names: string[];
  }>
): { bookmarks: ExportBookmark[]; skipped: number } {
  const out: ExportBookmark[] = [];
  let skipped = 0;
  for (const b of sourceBookmarks) {
    let norm: string;
    try {
      norm = normalizeUrl(b.url);
    } catch {
      skipped++;
      continue;
    }
    if (!norm) {
      skipped++;
      continue;
    }
    out.push({
      url: b.url,
      title: b.title,
      description: b.description,
      notes: b.notes,
      tags: b.tag_names.map((t) => normalizeTagName(t)).filter(Boolean),
      archived: b.is_archived,
      unread: b.unread,
      shared: b.shared,
      dateAdded: b.date_added
    });
  }
  return { bookmarks: out, skipped };
}

describe('migrate-linkding export shape', () => {
  it('skips invalid URLs', () => {
    const r = toExportBookmarks([
      {
        url: 'not a url',
        title: 'Bad',
        description: '',
        notes: '',
        is_archived: false,
        unread: false,
        shared: false,
        date_added: '2024-01-01T00:00:00Z',
        tag_names: []
      }
    ]);
    expect(r.skipped).toBe(1);
    expect(r.bookmarks).toHaveLength(0);
  });

  it('normalizes tag names', () => {
    const r = toExportBookmarks([
      {
        url: 'https://example.com',
        title: 'x',
        description: '',
        notes: '',
        is_archived: false,
        unread: false,
        shared: false,
        date_added: '2024-01-01T00:00:00Z',
        tag_names: ['JS', 'Type Script', '']
      }
    ]);
    expect(r.bookmarks[0]!.tags).toEqual(['js', 'type-script']);
  });

  it('produces importable Netscape HTML', () => {
    const r = toExportBookmarks([
      {
        url: 'https://example.com',
        title: 'Example',
        description: '',
        notes: '',
        is_archived: false,
        unread: true,
        shared: false,
        date_added: '2024-01-01T00:00:00Z',
        tag_names: ['web']
      }
    ]);
    const html = exportNetscape(r.bookmarks);
    expect(html).toContain('HREF="https://example.com"');
    expect(html).toContain('TAGS="web"');
    expect(html).toContain('TOREAD="1"');
  });

  it('preserves archived flag', () => {
    const r = toExportBookmarks([
      {
        url: 'https://example.com',
        title: 'x',
        description: '',
        notes: '',
        is_archived: true,
        unread: false,
        shared: false,
        date_added: '2024-01-01T00:00:00Z',
        tag_names: []
      }
    ]);
    expect(r.bookmarks[0]!.archived).toBe(true);
  });
});

/**
 * Build a Queryable that records every SQL string handed to it and returns
 * canned rows for each query. The rows are pre-canned per-table so we can
 * verify the reader pulls the right shape from the right table.
 */
function makeFakeQueryable(tables: {
  users?: Record<string, unknown>[];
  tags?: Record<string, unknown>[];
  bookmarks?: Record<string, unknown>[];
  bookmarkTagJoin?: Record<string, unknown>[];
  bundles?: Record<string, unknown>[];
  assets?: Record<string, unknown>[];
}): {
  queries: string[];
  client: Queryable;
} {
  const queries: string[] = [];
  const client: Queryable = {
    query: vi.fn(async (sql: string) => {
      queries.push(sql);
      if (/FROM\s+auth_user/i.test(sql)) return { rows: tables.users ?? [] };
      if (/FROM\s+tag\b/i.test(sql)) return { rows: tables.tags ?? [] };
      if (/FROM\s+bookmark_tag/i.test(sql)) return { rows: tables.bookmarkTagJoin ?? [] };
      if (/FROM\s+bookmark\b/i.test(sql)) return { rows: tables.bookmarks ?? [] };
      if (/FROM\s+bundle\b/i.test(sql)) return { rows: tables.bundles ?? [] };
      if (/FROM\s+bookmark_asset/i.test(sql)) return { rows: tables.assets ?? [] };
      throw new Error(`Unexpected query: ${sql}`);
    })
  };
  return { queries, client };
}

describe('readPostgresDb', () => {
  it('issues the expected SQL in a stable order against the Linkding tables', async () => {
    const fake = makeFakeQueryable({});
    await readPostgresDb(fake.client);
    // Each SQL fragment must show up at least once. Order isn't strict because
    // Postgres is non-deterministic about parallel plans, but the four core
    // tables must all be touched in some order.
    const allSql = fake.queries.join('\n');
    expect(allSql).toMatch(/SELECT\s+id, email, username, is_admin\s+FROM\s+auth_user/i);
    expect(allSql).toMatch(/SELECT\s+id, name, date_added\s+FROM\s+tag\b/i);
    expect(allSql).toMatch(
      /SELECT\s+id, url, title, description, notes, web_archive_snapshot_url/i
    );
    expect(allSql).toMatch(/FROM\s+bookmark\b/i);
    expect(allSql).toMatch(/FROM\s+bookmark_tag/i);
    expect(allSql).toMatch(/FROM\s+bundle\b/i);
    expect(allSql).toMatch(/FROM\s+bookmark_asset/i);
  });

  it('normalises Postgres real booleans to JS booleans', async () => {
    const fake = makeFakeQueryable({
      users: [
        { id: 1, email: 'a@example.com', username: 'a', is_admin: true },
        { id: 2, email: 'b@example.com', username: 'b', is_admin: false }
      ],
      tags: [],
      bookmarks: [
        {
          id: 10,
          url: 'https://example.com',
          title: 'Example',
          description: '',
          notes: '',
          web_archive_snapshot_url: '',
          is_archived: true,
          unread: false,
          shared: true,
          date_added: new Date('2024-01-02T03:04:05Z'),
          date_modified: new Date('2024-02-02T03:04:05Z')
        }
      ],
      bundles: [],
      assets: []
    });

    const db = await readPostgresDb(fake.client);
    expect(db.users[0]!.is_admin).toBe(true);
    expect(db.users[1]!.is_admin).toBe(false);
    expect(db.bookmarks[0]!.is_archived).toBe(true);
    expect(db.bookmarks[0]!.shared).toBe(true);
    expect(db.bookmarks[0]!.unread).toBe(false);
  });

  it('converts Postgres Date timestamps to ISO strings (matches SQLite shape)', async () => {
    const fake = makeFakeQueryable({
      bookmarks: [
        {
          id: 1,
          url: 'https://example.com',
          title: 'x',
          description: '',
          notes: '',
          web_archive_snapshot_url: '',
          is_archived: false,
          unread: false,
          shared: false,
          date_added: new Date('2024-06-01T12:00:00.000Z'),
          date_modified: new Date('2024-06-02T12:00:00.000Z')
        }
      ]
    });
    const db = await readPostgresDb(fake.client);
    expect(db.bookmarks[0]!.date_added).toBe('2024-06-01T12:00:00.000Z');
    expect(db.bookmarks[0]!.date_modified).toBe('2024-06-02T12:00:00.000Z');
  });

  it('passes string timestamps through unchanged (driver-config opt-out case)', async () => {
    const fake = makeFakeQueryable({
      bookmarks: [
        {
          id: 1,
          url: 'https://example.com',
          title: 'x',
          description: '',
          notes: '',
          web_archive_snapshot_url: '',
          is_archived: false,
          unread: false,
          shared: false,
          date_added: '2024-06-01 12:00:00+00',
          date_modified: '2024-06-02 12:00:00+00'
        }
      ]
    });
    const db = await readPostgresDb(fake.client);
    expect(db.bookmarks[0]!.date_added).toBe('2024-06-01 12:00:00+00');
    expect(db.bookmarks[0]!.date_modified).toBe('2024-06-02 12:00:00+00');
  });

  it('joins bookmark_tag rows onto bookmarks in the right order', async () => {
    const fake = makeFakeQueryable({
      bookmarks: [
        {
          id: 1,
          url: 'https://a',
          title: '',
          description: '',
          notes: '',
          web_archive_snapshot_url: '',
          is_archived: false,
          unread: false,
          shared: false,
          date_added: '',
          date_modified: ''
        },
        {
          id: 2,
          url: 'https://b',
          title: '',
          description: '',
          notes: '',
          web_archive_snapshot_url: '',
          is_archived: false,
          unread: false,
          shared: false,
          date_added: '',
          date_modified: ''
        }
      ],
      bookmarkTagJoin: [
        { bookmark_id: 1, name: 'rust' },
        { bookmark_id: 2, name: 'wasm' },
        { bookmark_id: 1, name: 'web' }
      ]
    });
    const db = await readPostgresDb(fake.client);
    expect(db.bookmarks[0]!.tag_names).toEqual(['rust', 'web']);
    expect(db.bookmarks[1]!.tag_names).toEqual(['wasm']);
  });

  it('maps bundle sort_order and timestamps', async () => {
    const fake = makeFakeQueryable({
      bundles: [
        {
          id: 7,
          name: 'Reading',
          search: '',
          any_tags: '',
          all_tags: '',
          excluded_tags: '',
          filter_unread: 'off',
          filter_shared: 'off',
          sort_order: 3,
          date_created: new Date('2024-03-01T00:00:00.000Z'),
          date_modified: new Date('2024-04-01T00:00:00.000Z')
        }
      ]
    });
    const db = await readPostgresDb(fake.client);
    expect(db.bundles[0]!.id).toBe(7);
    expect(db.bundles[0]!.sort_order).toBe(3);
    expect(db.bundles[0]!.date_created).toBe('2024-03-01T00:00:00.000Z');
  });

  it('preserves null file_size on assets', async () => {
    const fake = makeFakeQueryable({
      assets: [
        { id: 1, bookmark_id: 10, display_name: 'shot.png', file_size: null, status: 'complete' }
      ]
    });
    const db: LinkdingDb = await readPostgresDb(fake.client);
    expect(db.assets[0]!.file_size).toBeNull();
    expect(db.assets[0]!.status).toBe('complete');
  });

  it('accepts stringy numeric ids (driver returns BIGINT as string)', async () => {
    const fake = makeFakeQueryable({
      users: [{ id: '42', email: 'x', username: 'x', is_admin: true }],
      tags: [],
      bookmarks: [],
      assets: []
    });
    const db = await readPostgresDb(fake.client);
    expect(db.users[0]!.id).toBe(42);
  });
});

import { describe, it, expect } from 'vitest';
import { honoApp } from '../../src/lib/server/hono';
import { generateApiToken } from '../../src/lib/server/auth/api-token';

// Regression tests for audit finding 4: literal routes shadowed by /:id
// and sub-router re-dispatch returning 404.

type Row = Record<string, unknown>;

class FakeD1 {
  private handlers: Array<{ match: RegExp; rows: () => Row[] }> = [];
  onQuery(match: RegExp, rows: () => Row[]): this {
    this.handlers.push({ match, rows });
    return this;
  }
  prepare(sql: string) {
    const h = this.handlers.find((x) => x.match.test(sql));
    if (!h) throw new Error(`FakeD1: no handler for ${sql.slice(0, 80)}`);
    const rows = h.rows();
    return {
      bind: () => ({
        first: async () => rows[0] ?? null,
        all: async () => ({ results: rows }),
        run: async () => ({ success: true, meta: { changes: rows.length } }),
        raw: async () => rows.map((r) => Object.values(r))
      })
    };
  }
}

// Column order must match the drizzle schema: D1 rows come back via raw().
const tokenRow = (tokenHash: string): Row => ({
  id: 1,
  user_id: 1,
  token_hash: tokenHash,
  revoked_at: null,
  email: 'test@cloudpin.local',
  username: 'tester',
  display_name: 'Tester',
  is_admin: 0
});

const bookmarkRow: Row = {
  id: 5,
  owner_id: 1,
  url: 'https://example.com',
  url_normalized: 'https://example.com',
  title: 'Example',
  description: '',
  notes: '',
  web_archive_snapshot_url: '',
  favicon_key: '',
  preview_image_key: '',
  latest_snapshot_asset_id: null,
  unread: 0,
  is_archived: 1,
  shared: 0,
  date_added: '2026-01-01T00:00:00.000Z',
  date_modified: '2026-01-01T00:00:00.000Z',
  date_accessed: null
};

const assetRow: Row = {
  id: 7,
  bookmark_id: 5,
  date_created: '2026-01-01T00:00:00.000Z',
  r2_key: 'assets/1/5/7/file.html',
  file_size: 3,
  asset_type: 'upload',
  content_type: 'text/html; charset=utf-8',
  display_name: 'file.html',
  status: 'complete',
  gzip: 1
};

async function env(tokenHash: string) {
  const d1 = new FakeD1()
    .onQuery(/from\s+"api_tokens"/i, () => [tokenRow(tokenHash)])
    .onQuery(/from\s+"bookmark_assets"/i, () => [assetRow])
    .onQuery(/from\s+"bookmark_tags"/i, () => [])
    .onQuery(/update\s+"bookmarks"/i, () => [])
    .onQuery(/from\s+"bookmarks"/i, () => [bookmarkRow]);
  const bucket = {
    async get() {
      return { body: new Response('abc').body, size: 3, httpMetadata: {} };
    }
  } as unknown as R2Bucket;
  return { DB: d1 as unknown as D1Database, ASSETS_BUCKET: bucket, APP_SECRET: 's' };
}

async function call(path: string, init: RequestInit = {}) {
  const { rawToken, tokenHash } = await generateApiToken();
  const headers = { authorization: `Token ${rawToken}`, ...(init.headers as object) };
  return honoApp.fetch(
    new Request(`http://test.local${path}`, { ...init, headers }),
    await env(tokenHash)
  );
}

describe('API literal routes are not shadowed by /:id', () => {
  it('GET /api/bookmarks/archived returns the archived list, not a 400 from /:id', async () => {
    const res = await call('/api/bookmarks/archived');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: unknown[] };
    expect(Array.isArray(body.results)).toBe(true);
  });

  it('GET /api/bookmarks/shared returns 200', async () => {
    const res = await call('/api/bookmarks/shared');
    expect(res.status).toBe(200);
  });
});

describe('API handlers that used to re-dispatch through a sub-router', () => {
  it('PATCH /api/bookmarks/5 updates and returns the bookmark', async () => {
    const res = await call('/api/bookmarks/5', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'New' })
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: number };
    expect(body.id).toBe(5);
  });

  it('GET /api/bookmarks/5/assets/7/download serves the file as an attachment with gzip encoding', async () => {
    const res = await call('/api/bookmarks/5/assets/7/download');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toMatch(/^attachment/);
    expect(res.headers.get('content-encoding')).toBe('gzip');
  });
});

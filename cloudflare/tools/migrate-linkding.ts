#!/usr/bin/env node
/**
 * cloudpin migration tool
 *
 * Reads an existing Linkding database (SQLite or PostgreSQL) and produces
 * an export that can be imported into cloudpin via either the Netscape HTML
 * import route or a structured JSON import workflow.
 *
 * Usage:
 *   pnpm tsx tools/migrate-linkding.ts --sqlite /path/to/db.sqlite3 --out bookmarks.html
 *   pnpm tsx tools/migrate-linkding.ts --postgres-url postgres://user:pass@host/db --out bookmarks.html
 *   pnpm tsx tools/migrate-linkding.ts --sqlite /path/to/db.sqlite3 --out data.json --json
 *   pnpm tsx tools/migrate-linkding.ts --sqlite /path/to/db.sqlite3 --default-user-email me@x.com --dry-run
 *
 * The dry-run mode prints counts for users, bookmarks, tags, bundles, and
 * assets, and does not write any output.
 *
 * --sqlite and --postgres-url are mutually exclusive.
 */
import { exportNetscape, type ExportBookmark } from '../src/domain/netscape';
import { normalizeUrl } from '../src/domain/url-normalize';
import { normalizeTagName } from '../src/domain/tags';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type LinkdingBookmark = {
  id: number;
  url: string;
  title: string;
  description: string;
  notes: string;
  web_archive_snapshot_url: string;
  is_archived: boolean;
  unread: boolean;
  shared: boolean;
  date_added: string;
  date_modified: string;
  tag_names: string[];
};

type LinkdingTag = { id: number; name: string; date_added: string };

type LinkdingBundle = {
  id: number;
  name: string;
  search: string;
  any_tags: string;
  all_tags: string;
  excluded_tags: string;
  filter_unread: string;
  filter_shared: string;
  sort_order: number;
  date_created: string;
  date_modified: string;
};

type LinkdingUser = {
  id: number;
  email: string;
  username: string;
  is_admin: boolean;
};

export type LinkdingDb = {
  users: LinkdingUser[];
  bookmarks: LinkdingBookmark[];
  tags: LinkdingTag[];
  bundles: LinkdingBundle[];
  assets: {
    id: number;
    bookmark_id: number;
    display_name: string;
    file_size: number | null;
    status: string;
  }[];
};

type Queryable = {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
};

type CliArgs = {
  sqlite?: string;
  postgresUrl?: string;
  out?: string;
  json?: boolean;
  dryRun?: boolean;
  defaultUserEmail?: string;
  help?: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sqlite') args.sqlite = argv[++i];
    else if (a === '--postgres-url') args.postgresUrl = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--default-user-email') args.defaultUserEmail = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function printHelp(): void {
  console.log(`cloudpin migration tool

Reads an existing Linkding database and produces an export for cloudpin.

Usage:
  migrate-linkding [options]

Source (pick one):
  --sqlite <path>           Path to a Linkding SQLite database file
  --postgres-url <url>      PostgreSQL connection URL
                            (postgres://user:pass@host:port/dbname)

Output:
  --out <path>              Output file path (required unless --dry-run)
  --json                    Emit structured JSON instead of Netscape HTML
  --dry-run                 Print source counts and exit without writing

Filtering:
  --default-user-email <e>  Pick a single source user when the database has many
                            (defaults to the only user when the source has one)

  -h, --help                Show this help
`);
}

function readSqlite(path: string): LinkdingDb {
  let Database: unknown;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Database = require('better-sqlite3');
  } catch {
    throw new Error('better-sqlite3 is required. Install with: npm i -D better-sqlite3');
  }
  const db = new (Database as new (p: string) => {
    prepare: (q: string) => { all: () => unknown[] };
  })(resolve(path));

  const users = (
    db
      .prepare('SELECT id, email, username, is_admin FROM auth_user ORDER BY id ASC')
      .all() as Array<{ id: number; email: string; username: string; is_admin: number }>
  ).map((u) => ({
    id: u.id,
    email: u.email,
    username: u.username,
    is_admin: !!u.is_admin
  }));

  const tagRows = db
    .prepare('SELECT id, name, date_added FROM tag ORDER BY id ASC')
    .all() as Array<{ id: number; name: string; date_added: string }>;
  const tags: LinkdingTag[] = tagRows.map((t) => ({
    id: t.id,
    name: t.name,
    date_added: t.date_added
  }));

  const bmRows = db
    .prepare(
      `SELECT id, url, title, description, notes, web_archive_snapshot_url,
              is_archived, unread, shared, date_added, date_modified
       FROM bookmark ORDER BY id ASC`
    )
    .all() as Array<{
    id: number;
    url: string;
    title: string;
    description: string;
    notes: string;
    web_archive_snapshot_url: string;
    is_archived: number;
    unread: number;
    shared: number;
    date_added: string;
    date_modified: string;
  }>;

  const tagJoin = db
    .prepare(
      `SELECT bt.bookmark_id, t.name
       FROM bookmark_tag bt INNER JOIN tag t ON t.id = bt.tag_id`
    )
    .all() as Array<{ bookmark_id: number; name: string }>;
  const tagMap = new Map<number, string[]>();
  for (const row of tagJoin) {
    const arr = tagMap.get(row.bookmark_id) ?? [];
    arr.push(row.name);
    tagMap.set(row.bookmark_id, arr);
  }

  const bookmarks: LinkdingBookmark[] = bmRows.map((b) => ({
    id: b.id,
    url: b.url,
    title: b.title ?? '',
    description: b.description ?? '',
    notes: b.notes ?? '',
    web_archive_snapshot_url: b.web_archive_snapshot_url ?? '',
    is_archived: !!b.is_archived,
    unread: !!b.unread,
    shared: !!b.shared,
    date_added: b.date_added,
    date_modified: b.date_modified,
    tag_names: tagMap.get(b.id) ?? []
  }));

  const bundles = (
    db
      .prepare(
        `SELECT id, name, search, any_tags, all_tags, excluded_tags,
                filter_unread, filter_shared, sort_order,
                date_created, date_modified
         FROM bundle ORDER BY sort_order ASC, id ASC`
      )
      .all() as Array<{
      id: number;
      name: string;
      search: string;
      any_tags: string;
      all_tags: string;
      excluded_tags: string;
      filter_unread: string;
      filter_shared: string;
      sort_order: number;
      date_created: string;
      date_modified: string;
    }>
  ).map((b) => ({ ...b }));

  const assets = (
    db
      .prepare(
        'SELECT id, bookmark_id, display_name, file_size, status FROM bookmark_asset ORDER BY id ASC'
      )
      .all() as Array<{
      id: number;
      bookmark_id: number;
      display_name: string;
      file_size: number;
      status: string;
    }>
  ).map((a) => ({ ...a, file_size: a.file_size ?? null }));

  return { users, bookmarks, tags, bundles, assets };
}

function toIsoString(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return v as string;
}

function asInt(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseInt(v, 10);
  throw new Error(`expected integer, got ${typeof v}: ${String(v)}`);
}

function asIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  return asInt(v);
}

/**
 * Read all Linkding tables from a Postgres-shaped queryable.
 *
 * Exported for unit testing. The wrapping `readPostgres` opens a real
 * `pg.Client`, awaits connect/end, and delegates here.
 *
 * SQL is intentionally the same as the SQLite branch (Linkding's table and
 * column names are stable across the two backends) modulo the result
 * coercion at the row level. Booleans are normalised to JS booleans
 * (Postgres returns real booleans; SQLite returns 0/1, and the SQLite
 * branch also normalises). Timestamps may come back as Date from the pg
 * driver; `toIsoString` keeps the export shape identical to the SQLite
 * branch.
 */
export async function readPostgresDb(q: Queryable): Promise<LinkdingDb> {
  const usersResult = await q.query(
    'SELECT id, email, username, is_admin FROM auth_user ORDER BY id ASC'
  );
  const users: LinkdingUser[] = usersResult.rows.map((u) => ({
    id: asInt(u.id),
    email: String(u.email),
    username: String(u.username),
    is_admin: !!u.is_admin
  }));

  const tagResult = await q.query('SELECT id, name, date_added FROM tag ORDER BY id ASC');
  const tags: LinkdingTag[] = tagResult.rows.map((t) => ({
    id: asInt(t.id),
    name: String(t.name),
    date_added: toIsoString(t.date_added)
  }));

  const bmResult = await q.query(
    `SELECT id, url, title, description, notes, web_archive_snapshot_url,
            is_archived, unread, shared, date_added, date_modified
     FROM bookmark ORDER BY id ASC`
  );
  const tagJoinResult = await q.query(
    `SELECT bt.bookmark_id, t.name
     FROM bookmark_tag bt INNER JOIN tag t ON t.id = bt.tag_id`
  );
  const tagMap = new Map<number, string[]>();
  for (const row of tagJoinResult.rows) {
    const bookmarkId = asInt(row.bookmark_id);
    const arr = tagMap.get(bookmarkId) ?? [];
    arr.push(String(row.name));
    tagMap.set(bookmarkId, arr);
  }
  const bookmarks: LinkdingBookmark[] = bmResult.rows.map((b) => ({
    id: asInt(b.id),
    url: String(b.url),
    title: (b.title as string | null) ?? '',
    description: (b.description as string | null) ?? '',
    notes: (b.notes as string | null) ?? '',
    web_archive_snapshot_url: (b.web_archive_snapshot_url as string | null) ?? '',
    is_archived: !!b.is_archived,
    unread: !!b.unread,
    shared: !!b.shared,
    date_added: toIsoString(b.date_added),
    date_modified: toIsoString(b.date_modified),
    tag_names: tagMap.get(asInt(b.id)) ?? []
  }));

  const bundleResult = await q.query(
    `SELECT id, name, search, any_tags, all_tags, excluded_tags,
            filter_unread, filter_shared, sort_order,
            date_created, date_modified
     FROM bundle ORDER BY sort_order ASC, id ASC`
  );
  const bundles: LinkdingBundle[] = bundleResult.rows.map((b) => ({
    id: asInt(b.id),
    name: String(b.name),
    search: String(b.search ?? ''),
    any_tags: String(b.any_tags ?? ''),
    all_tags: String(b.all_tags ?? ''),
    excluded_tags: String(b.excluded_tags ?? ''),
    filter_unread: String(b.filter_unread ?? ''),
    filter_shared: String(b.filter_shared ?? ''),
    sort_order: asInt(b.sort_order),
    date_created: toIsoString(b.date_created),
    date_modified: toIsoString(b.date_modified)
  }));

  const assetResult = await q.query(
    'SELECT id, bookmark_id, display_name, file_size, status FROM bookmark_asset ORDER BY id ASC'
  );
  const assets: LinkdingDb['assets'] = assetResult.rows.map((a) => ({
    id: asInt(a.id),
    bookmark_id: asInt(a.bookmark_id),
    display_name: String(a.display_name ?? ''),
    file_size: asIntOrNull(a.file_size),
    status: String(a.status)
  }));

  return { users, bookmarks, tags, bundles, assets };
}

async function readPostgres(url: string): Promise<LinkdingDb> {
  type PgClientCtor = new (u: string) => PgClient;
  let Client: PgClientCtor;
  try {
    const mod = await import('pg');
    // The real pg.Client.connect() returns Promise<Client> (self-referential);
    // we narrow to the minimal shape we need so readPostgresDb can accept
    // both the real client and the test fake without further casts.
    Client = mod.Client as unknown as PgClientCtor;
  } catch {
    throw new Error('pg is required to use --postgres-url. Install with: npm i -D pg');
  }
  const client = new Client(url);
  await client.connect();
  try {
    return await readPostgresDb(client);
  } finally {
    await client.end();
  }
}

type PgClient = {
  connect(): Promise<void>;
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
};

function summarize(db: LinkdingDb): string {
  return [
    `users:    ${db.users.length}`,
    `bookmarks:${db.bookmarks.length}`,
    `tags:     ${db.tags.length}`,
    `bundles:  ${db.bundles.length}`,
    `assets:   ${db.assets.length}`
  ].join('\n');
}

function toExportBookmarks(
  db: LinkdingDb,
  defaultUserEmail?: string
): { bookmarks: ExportBookmark[]; skipped: number; userEmail: string | null } {
  const targetEmail = defaultUserEmail?.toLowerCase();
  let userEmail: string | null = null;
  if (targetEmail) {
    const u = db.users.find((x) => x.email.toLowerCase() === targetEmail);
    if (!u) {
      throw new Error(`User with email ${targetEmail} not found in source database`);
    }
    userEmail = u.email;
  } else if (db.users.length === 1) {
    userEmail = db.users[0]!.email;
  } else {
    throw new Error(`Multiple users in source; please pass --default-user-email to choose one`);
  }
  void db.users.find((u) => u.email === userEmail);
  const owned = db.bookmarks;
  const out: ExportBookmark[] = [];
  let skipped = 0;
  for (const b of owned) {
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
  return { bookmarks: out, skipped, userEmail };
}

async function loadDb(args: CliArgs): Promise<LinkdingDb> {
  if (args.sqlite) {
    console.log('Source: SQLite');
    return readSqlite(args.sqlite);
  }
  if (args.postgresUrl) {
    console.log('Source: PostgreSQL');
    return await readPostgres(args.postgresUrl);
  }
  throw new Error('No source database specified');
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  if (args.sqlite && args.postgresUrl) {
    console.error('Error: --sqlite and --postgres-url are mutually exclusive');
    process.exit(2);
  }
  if (!args.sqlite && !args.postgresUrl) {
    printHelp();
    process.exit(2);
  }

  const db = await loadDb(args);
  console.log('Source database:');
  console.log(summarize(db));

  if (args.dryRun) {
    console.log('\nDry run: no files written.');
    if (args.defaultUserEmail) {
      try {
        const { bookmarks, skipped } = toExportBookmarks(db, args.defaultUserEmail);
        console.log(`Exportable bookmarks: ${bookmarks.length} (skipped ${skipped} invalid URLs)`);
      } catch (e) {
        console.log(`User filter: ${(e as Error).message}`);
      }
    }
    return;
  }

  if (!args.out) {
    console.error('--out <path> is required unless --dry-run is set');
    process.exit(2);
  }

  const { bookmarks, skipped, userEmail } = toExportBookmarks(db, args.defaultUserEmail);
  console.log(
    `\nSelected user: ${userEmail}\nExportable bookmarks: ${bookmarks.length} (skipped ${skipped})`
  );

  if (args.json) {
    const json = {
      schemaVersion: 1,
      source: 'linkding',
      user: { email: userEmail },
      bookmarks,
      bundles: db.bundles
    };
    writeFileSync(resolve(args.out), JSON.stringify(json, null, 2), 'utf8');
    console.log(`Wrote JSON export to ${args.out}`);
  } else {
    const html = exportNetscape(bookmarks);
    writeFileSync(resolve(args.out), html, 'utf8');
    console.log(`Wrote Netscape HTML export to ${args.out}`);
  }
}

void importNetscape;
function importNetscape(): never {
  throw new Error('Use the in-app import route, not this tool, to load Netscape files');
}

// Only invoke main() when this file is the entry point, so that unit tests
// can import `readPostgresDb` without triggering process.exit().
const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === new URL(`file://${process.argv[1]}`).href;
  } catch {
    return false;
  }
})();
if (isMain) {
  void main();
}

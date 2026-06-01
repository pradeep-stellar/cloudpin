#!/usr/bin/env node
/**
 * cloudpin migration tool
 *
 * Reads an existing Linkding SQLite database and produces an export that can
 * be imported into cloudpin via either the Netscape HTML import route or a
 * structured JSON import workflow.
 *
 * Usage:
 *   pnpm tsx tools/migrate-linkding.ts --sqlite /path/to/db.sqlite3 --out bookmarks.html
 *   pnpm tsx tools/migrate-linkding.ts --sqlite /path/to/db.sqlite3 --out data.json --json
 *   pnpm tsx tools/migrate-linkding.ts --sqlite /path/to/db.sqlite3 --default-user-email me@x.com --dry-run
 *
 * The dry-run mode prints counts for users, bookmarks, tags, bundles, and
 * assets, and does not write any output.
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

type LinkdingDb = {
  users: LinkdingUser[];
  bookmarks: LinkdingBookmark[];
  tags: LinkdingTag[];
  bundles: LinkdingBundle[];
  assets: {
    id: number;
    bookmark_id: number;
    display_name: string;
    file_size: number;
    status: string;
  }[];
};

function parseArgs(argv: string[]): {
  sqlite?: string;
  out?: string;
  json?: boolean;
  dryRun?: boolean;
  defaultUserEmail?: string;
} {
  const args: ReturnType<typeof parseArgs> = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sqlite') args.sqlite = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--default-user-email') args.defaultUserEmail = argv[++i];
  }
  return args;
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
  ).map((a) => ({ ...a }));

  return { users, bookmarks, tags, bundles, assets };
}

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

async function main() {
  const args = parseArgs(process.argv);
  if (!args.sqlite) {
    console.error('Usage: migrate-linkding --sqlite <path> [--out <path>] [--json] [--dry-run]');
    process.exit(2);
  }
  const db = readSqlite(args.sqlite);
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

void main();

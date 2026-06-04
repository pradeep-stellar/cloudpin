/**
 * Local SQLite benchmark for LIKE vs FTS5 bookmark search.
 * Run: npx tsx tools/bench-search.ts
 * Requires Node 22+ (node:sqlite).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(ROOT, 'migrations');

const LIKE_SQL = `SELECT id FROM bookmarks
  WHERE owner_id = 1 AND is_archived = 0
    AND (
      title LIKE '%guide%' ESCAPE '\\' OR
      description LIKE '%guide%' ESCAPE '\\' OR
      notes LIKE '%guide%' ESCAPE '\\' OR
      url LIKE '%guide%' ESCAPE '\\'
    )
  ORDER BY date_added DESC LIMIT 30`;

const FTS_SQL = `SELECT id FROM bookmarks
  WHERE owner_id = 1 AND is_archived = 0
    AND id IN (SELECT rowid FROM bookmarks_fts WHERE bookmarks_fts MATCH '"guide"')
  ORDER BY date_added DESC LIMIT 30`;

function applyMigrations(db: DatabaseSync): void {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const stmt of sql.split(/--> statement-breakpoint/)) {
      const trimmed = stmt.trim();
      if (trimmed) db.exec(trimmed);
    }
  }
}

function seed(db: DatabaseSync, count: number): void {
  db.exec('DELETE FROM bookmark_tags; DELETE FROM bookmarks; DELETE FROM users;');
  db.exec(
    `INSERT INTO users (id, email, username, is_admin, created_at)
     VALUES (1, 'bench@cloudpin.local', 'bench', 0, datetime('now'));`
  );
  const insert = db.prepare(
    `INSERT INTO bookmarks (
      owner_id, url, url_normalized, title, description, notes,
      unread, is_archived, shared, date_added, date_modified
    ) VALUES (1, ?, ?, ?, ?, ?, 0, 0, 0, datetime('now'), datetime('now'))`
  );
  for (let i = 0; i < count; i++) {
    const url = `https://example.com/page-${i}`;
    insert.run(
      url,
      url,
      `Page ${i}`,
      i % 17 === 0 ? 'A practical guide to bookmarks' : `Description ${i}`,
      i % 23 === 0 ? 'Notes about the guide workflow' : ''
    );
  }
  db.exec(`INSERT INTO bookmarks_fts(bookmarks_fts) VALUES ('rebuild');`);
}

function bench(db: DatabaseSync, sql: string, iterations: number): { p50: number; p95: number } {
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    db.prepare(sql).all();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return {
    p50: times[Math.floor(times.length * 0.5)]!,
    p95: times[Math.floor(times.length * 0.95)]!
  };
}

function runAt(count: number): {
  like: { p50: number; p95: number };
  fts: { p50: number; p95: number };
} {
  const db = new DatabaseSync(':memory:');
  applyMigrations(db);
  seed(db, count);
  return {
    like: bench(db, LIKE_SQL, 40),
    fts: bench(db, FTS_SQL, 40)
  };
}

const sizes = [5_000, 20_000, 100_000];
const results: Record<string, ReturnType<typeof runAt>> = {};

for (const n of sizes) {
  results[String(n)] = runAt(n);
  console.log(`Seeded ${n} bookmarks`);
}

console.log(JSON.stringify(results, null, 2));

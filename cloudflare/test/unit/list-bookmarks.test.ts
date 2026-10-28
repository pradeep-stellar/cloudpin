import { describe, it, expect } from 'vitest';
import { listBookmarks, parseSearchLenient } from '../../src/db/repositories/bookmarks.repo';

// Records every SQL statement and returns no rows, so we can assert on
// the WHERE clause listBookmarks builds without a real D1.
class RecordingD1 {
  sql: string[] = [];
  prepare(sql: string) {
    this.sql.push(sql);
    return {
      bind: () => ({
        first: async () => null,
        all: async () => ({ results: [] }),
        run: async () => ({ success: true, meta: {} }),
        raw: async () => []
      })
    };
  }
  asD1(): D1Database {
    return this as unknown as D1Database;
  }
}

describe('listBookmarks archived filter', () => {
  it("'all' does not filter on is_archived (export and feeds need every bookmark)", async () => {
    const d1 = new RecordingD1();
    await listBookmarks(d1.asD1(), { ownerId: 1, archivedFilter: 'all', limit: 10, offset: 0 });
    expect(d1.sql.length).toBeGreaterThan(0);
    for (const s of d1.sql) expect(s).not.toMatch(/"is_archived" = \?/);
  });

  it("default and 'false' filter to unarchived only", async () => {
    const d1 = new RecordingD1();
    await listBookmarks(d1.asD1(), { ownerId: 1, limit: 10, offset: 0 });
    expect(d1.sql[0]).toMatch(/"is_archived" = \?/);
  });
});

describe('listBookmarks search errors', () => {
  it('an unbalanced query is searched as plain text instead of throwing', async () => {
    const d1 = new RecordingD1();
    await expect(
      listBookmarks(d1.asD1(), { ownerId: 1, searchQuery: '(', limit: 10, offset: 0 })
    ).resolves.toEqual({ items: [], total: 0 });
    expect(d1.sql[0]).toMatch(/bookmarks_fts MATCH/);
  });

  it('parseSearchLenient falls back to a single term', () => {
    expect(parseSearchLenient('foo)')).toEqual({ type: 'term', value: 'foo)' });
    expect(parseSearchLenient('#rust')).toEqual({ type: 'tag', value: 'rust' });
  });
});

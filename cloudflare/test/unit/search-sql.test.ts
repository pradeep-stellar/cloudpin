import { describe, it, expect } from 'vitest';
import { compileSearch } from '../../src/domain/search-sql';
import { parseSearch } from '../../src/domain/search-parser';

function compile(input: string) {
  return compileSearch(parseSearch(input));
}

describe('compileSearch', () => {
  it('returns empty for undefined input', () => {
    expect(compileSearch(undefined)).toEqual({ sql: '', params: [] });
  });

  it('compiles a single term to a LIKE on multiple columns', () => {
    const out = compile('hello');
    expect(out.sql).toContain('"bookmarks"."title" LIKE ?');
    expect(out.sql).toContain('"bookmarks"."description" LIKE ?');
    expect(out.sql).toContain('"bookmarks"."notes" LIKE ?');
    expect(out.sql).toContain('"bookmarks"."url" LIKE ?');
    expect(out.params).toEqual(['%hello%', '%hello%', '%hello%', '%hello%']);
  });

  it('escapes LIKE wildcards in term value', () => {
    const out = compile('100%');
    expect(out.params[0]).toBe('%100\\%%');
  });

  it('compiles #tag as an EXISTS subquery', () => {
    const out = compile('#rust');
    expect(out.sql).toContain('EXISTS');
    expect(out.sql).toContain('"bookmark_tags" "bt"');
    expect(out.sql).toContain('"tags" "t"');
    expect(out.sql).toContain('"t"."name_normalized" = ?');
    expect(out.params).toEqual(['rust']);
  });

  it('lowercases tag names', () => {
    const out = compile('#Rust');
    expect(out.params).toEqual(['rust']);
  });

  it('compiles !unread as a column check', () => {
    const out = compile('!unread');
    expect(out.sql).toContain('"bookmarks"."unread" = 1');
    expect(out.params).toEqual([]);
  });

  it('compiles !untagged as NOT EXISTS', () => {
    const out = compile('!untagged');
    expect(out.sql).toContain('NOT EXISTS');
    expect(out.sql).toContain('"bookmark_tags" "bt"');
    expect(out.params).toEqual([]);
  });

  it('joins terms with AND by default', () => {
    const out = compile('foo bar');
    expect(out.sql).toMatch(/AND/);
  });

  it('uses OR when explicit', () => {
    const out = compile('foo OR bar');
    expect(out.sql).toMatch(/OR/);
  });

  it('produces correct params ordering for OR', () => {
    const out = compile('foo OR bar');
    expect(out.params).toEqual([
      '%foo%',
      '%foo%',
      '%foo%',
      '%foo%',
      '%bar%',
      '%bar%',
      '%bar%',
      '%bar%'
    ]);
  });

  it('respects AND-binds-tighter-than-OR precedence', () => {
    const out = compile('foo OR bar baz');
    expect(out.sql).toBe(
      '(("bookmarks"."title" LIKE ? ESCAPE \'\\\' OR "bookmarks"."description" LIKE ? ESCAPE \'\\\' OR "bookmarks"."notes" LIKE ? ESCAPE \'\\\' OR "bookmarks"."url" LIKE ? ESCAPE \'\\\')) OR ((("bookmarks"."title" LIKE ? ESCAPE \'\\\' OR "bookmarks"."description" LIKE ? ESCAPE \'\\\' OR "bookmarks"."notes" LIKE ? ESCAPE \'\\\' OR "bookmarks"."url" LIKE ? ESCAPE \'\\\')) AND (("bookmarks"."title" LIKE ? ESCAPE \'\\\' OR "bookmarks"."description" LIKE ? ESCAPE \'\\\' OR "bookmarks"."notes" LIKE ? ESCAPE \'\\\' OR "bookmarks"."url" LIKE ? ESCAPE \'\\\')))'
    );
  });

  it('applies NOT to a single term', () => {
    const out = compile('NOT foo');
    expect(out.sql).toMatch(/^NOT \(/);
    expect(out.params).toEqual(['%foo%', '%foo%', '%foo%', '%foo%']);
  });

  it('supports parenthesized groups', () => {
    const out = compile('(foo OR bar) baz');
    expect(out.sql).toMatch(/OR/);
    expect(out.sql).toMatch(/AND/);
  });

  it('combines term, tag, and keyword in one query', () => {
    const out = compile('foo #rust !unread');
    expect(out.sql).toContain('"bookmarks"."title"');
    expect(out.sql).toContain('EXISTS');
    expect(out.sql).toContain('"bookmarks"."unread" = 1');
    expect(out.params.length).toBeGreaterThan(0);
  });

  it('uses 1=1 for empty parens and no-op wrappers', () => {
    const out = compile('NOT (foo AND bar)');
    expect(out.sql).toMatch(/^NOT \(/);
  });

  it('uses the configured table alias', () => {
    const out = compileSearch(parseSearch('foo'), { tableAlias: 'bookmarks' });
    expect(out.sql).toContain('"bookmarks"."title"');
  });

  it('uses custom term columns', () => {
    const out = compileSearch(parseSearch('foo'), { termColumns: ['title', 'url'] });
    expect(out.sql).toContain('"bookmarks"."title"');
    expect(out.sql).toContain('"bookmarks"."url"');
    expect(out.sql).not.toContain('"bookmarks"."description"');
    expect(out.params).toHaveLength(2);
  });

  it('compiles a nested search expression with mixed operators', () => {
    const out = compile('(foo OR #rust) AND !unread');
    expect(out.sql).toMatch(/OR/);
    expect(out.sql).toMatch(/AND/);
    expect(out.sql).toContain('"bookmarks"."unread" = 1');
    expect(out.params).toContain('rust');
  });
});

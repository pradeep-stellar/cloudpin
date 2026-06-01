import { describe, it, expect } from 'vitest';
import {
  parseSearch,
  termsOf,
  tagsOf,
  hasKeyword,
  SearchParseError
} from '../../src/domain/search-parser';

describe('parseSearch', () => {
  it('returns undefined for empty input', () => {
    expect(parseSearch('')).toBeUndefined();
    expect(parseSearch('   ')).toBeUndefined();
  });

  it('parses a single word as a term', () => {
    expect(parseSearch('hello')).toEqual({ type: 'term', value: 'hello' });
  });

  it('parses a quoted phrase as a single term', () => {
    expect(parseSearch('"hello world"')).toEqual({ type: 'term', value: 'hello world' });
  });

  it('parses #tag', () => {
    expect(parseSearch('#rust')).toEqual({ type: 'tag', value: 'rust' });
    expect(parseSearch('#web-dev')).toEqual({ type: 'tag', value: 'web-dev' });
  });

  it('parses !unread and !untagged keywords', () => {
    expect(parseSearch('!unread')).toEqual({ type: 'keyword', value: 'unread' });
    expect(parseSearch('!untagged')).toEqual({ type: 'keyword', value: 'untagged' });
  });

  it('parses AND', () => {
    expect(parseSearch('foo AND bar')).toEqual({
      type: 'binary',
      op: 'AND',
      left: { type: 'term', value: 'foo' },
      right: { type: 'term', value: 'bar' }
    });
  });

  it('parses OR', () => {
    expect(parseSearch('foo OR bar')).toEqual({
      type: 'binary',
      op: 'OR',
      left: { type: 'term', value: 'foo' },
      right: { type: 'term', value: 'bar' }
    });
  });

  it('implicit AND between adjacent terms', () => {
    expect(parseSearch('foo bar')).toEqual({
      type: 'binary',
      op: 'AND',
      left: { type: 'term', value: 'foo' },
      right: { type: 'term', value: 'bar' }
    });
  });

  it('AND binds tighter than OR', () => {
    const ast = parseSearch('foo OR bar baz');
    expect(ast).toEqual({
      type: 'binary',
      op: 'OR',
      left: { type: 'term', value: 'foo' },
      right: {
        type: 'binary',
        op: 'AND',
        left: { type: 'term', value: 'bar' },
        right: { type: 'term', value: 'baz' }
      }
    });
  });

  it('parses NOT', () => {
    expect(parseSearch('NOT foo')).toEqual({
      type: 'unary',
      op: 'NOT',
      child: { type: 'term', value: 'foo' }
    });
  });

  it('parses parenthesized groups', () => {
    expect(parseSearch('(foo OR bar) baz')).toEqual({
      type: 'binary',
      op: 'AND',
      left: {
        type: 'group',
        child: {
          type: 'binary',
          op: 'OR',
          left: { type: 'term', value: 'foo' },
          right: { type: 'term', value: 'bar' }
        }
      },
      right: { type: 'term', value: 'baz' }
    });
  });

  it('parses !unread with other terms', () => {
    expect(parseSearch('foo !unread')).toEqual({
      type: 'binary',
      op: 'AND',
      left: { type: 'term', value: 'foo' },
      right: { type: 'keyword', value: 'unread' }
    });
  });

  it('parses #tag with terms', () => {
    expect(parseSearch('foo #rust')).toEqual({
      type: 'binary',
      op: 'AND',
      left: { type: 'term', value: 'foo' },
      right: { type: 'tag', value: 'rust' }
    });
  });

  it('supports && and || as AND/OR', () => {
    expect(parseSearch('foo && bar')).toEqual({
      type: 'binary',
      op: 'AND',
      left: { type: 'term', value: 'foo' },
      right: { type: 'term', value: 'bar' }
    });
    expect(parseSearch('foo || bar')).toEqual({
      type: 'binary',
      op: 'OR',
      left: { type: 'term', value: 'foo' },
      right: { type: 'term', value: 'bar' }
    });
  });

  it('passes through strict and lax mode without changing AST', () => {
    expect(parseSearch('foo', { mode: 'strict' })).toEqual(parseSearch('foo', { mode: 'lax' }));
  });

  it('throws on unbalanced parens', () => {
    expect(() => parseSearch('(foo')).toThrow(SearchParseError);
    expect(() => parseSearch('foo)')).toThrow(SearchParseError);
  });
});

describe('termsOf', () => {
  it('collects terms from nested AST', () => {
    const ast = parseSearch('(foo OR bar) baz #rust !unread');
    expect(termsOf(ast)).toEqual(['foo', 'bar', 'baz']);
  });
});

describe('tagsOf', () => {
  it('collects tags from nested AST', () => {
    const ast = parseSearch('foo #rust bar #web-dev');
    expect(tagsOf(ast)).toEqual(['rust', 'web-dev']);
  });
});

describe('hasKeyword', () => {
  it('finds keywords nested in the AST', () => {
    expect(hasKeyword(parseSearch('foo !unread'), 'unread')).toBe(true);
    expect(hasKeyword(parseSearch('foo !unread'), 'untagged')).toBe(false);
    expect(hasKeyword(parseSearch('!untagged OR bar'), 'untagged')).toBe(true);
  });

  it('does not match across a NOT', () => {
    expect(hasKeyword(parseSearch('NOT !unread'), 'unread')).toBe(false);
  });
});

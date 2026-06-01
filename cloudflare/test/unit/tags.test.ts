import { describe, it, expect } from 'vitest';
import {
  normalizeTagName,
  splitTags,
  parseTagString,
  buildTagSearchFragment,
  compareTagNames,
  tagSearchTokens,
  tagIsHashPrefixed
} from '../../src/domain/tags';

describe('normalizeTagName', () => {
  it('lowercases', () => {
    expect(normalizeTagName('Hello')).toBe('hello');
  });

  it('replaces spaces and underscores with hyphens', () => {
    expect(normalizeTagName('hello world')).toBe('hello-world');
    expect(normalizeTagName('hello_world')).toBe('hello-world');
    expect(normalizeTagName('hello   world')).toBe('hello-world');
  });

  it('collapses multiple hyphens', () => {
    expect(normalizeTagName('hello---world')).toBe('hello-world');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeTagName('  hello  ')).toBe('hello');
  });

  it('removes leading # and trailing hyphens', () => {
    expect(normalizeTagName('#hello')).toBe('hello');
    expect(normalizeTagName('hello-')).toBe('hello');
  });

  it('returns empty string for empty or whitespace input', () => {
    expect(normalizeTagName('')).toBe('');
    expect(normalizeTagName('   ')).toBe('');
  });
});

describe('splitTags', () => {
  it('splits on spaces and commas', () => {
    expect(splitTags('a b c')).toEqual(['a', 'b', 'c']);
    expect(splitTags('a,b,c')).toEqual(['a', 'b', 'c']);
    expect(splitTags('a, b c')).toEqual(['a', 'b', 'c']);
  });

  it('strips leading # from tags', () => {
    expect(splitTags('#a #b')).toEqual(['a', 'b']);
  });

  it('deduplicates after normalization', () => {
    expect(splitTags('Hello hello HELLO')).toEqual(['Hello']);
  });

  it('ignores empty tokens', () => {
    expect(splitTags(' a  b   c ')).toEqual(['a', 'b', 'c']);
  });

  it('returns empty array on empty input', () => {
    expect(splitTags('')).toEqual([]);
    expect(splitTags('   ')).toEqual([]);
  });
});

describe('parseTagString', () => {
  it('is an alias for splitTags', () => {
    expect(parseTagString('a b')).toEqual(splitTags('a b'));
  });
});

describe('buildTagSearchFragment', () => {
  it('produces #-prefixed lowercased tokens', () => {
    expect(buildTagSearchFragment(['Rust', 'Web Dev'])).toBe('#rust #webdev');
  });

  it('returns empty for empty input', () => {
    expect(buildTagSearchFragment([])).toBe('');
  });
});

describe('compareTagNames', () => {
  it('compares case- and separator-insensitively', () => {
    expect(compareTagNames('Rust', 'rust')).toBe(true);
    expect(compareTagNames('Web Dev', 'web-dev')).toBe(true);
    expect(compareTagNames('Rust', 'Go')).toBe(false);
  });

  it('rejects empty on either side', () => {
    expect(compareTagNames('', 'rust')).toBe(false);
    expect(compareTagNames('rust', '')).toBe(false);
  });
});

describe('tagSearchTokens', () => {
  it('returns normalized tokens', () => {
    expect(tagSearchTokens('Rust web-dev')).toEqual(['rust', 'web-dev']);
  });
});

describe('tagIsHashPrefixed', () => {
  it('detects # prefix', () => {
    expect(tagIsHashPrefixed('#rust')).toBe(true);
    expect(tagIsHashPrefixed('rust')).toBe(false);
  });
});

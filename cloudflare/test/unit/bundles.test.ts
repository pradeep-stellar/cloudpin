import { describe, it, expect } from 'vitest';
import { buildBundleSearch } from '../../src/domain/bundles';

describe('buildBundleSearch', () => {
  it('returns empty string when no filters set', () => {
    expect(
      buildBundleSearch({
        search: '',
        anyTags: '',
        allTags: '',
        excludedTags: '',
        filterUnread: 'off',
        filterShared: 'off'
      })
    ).toBe('');
  });

  it('includes plain search term', () => {
    expect(
      buildBundleSearch({
        search: 'foo',
        anyTags: '',
        allTags: '',
        excludedTags: '',
        filterUnread: 'off',
        filterShared: 'off'
      })
    ).toBe('foo');
  });

  it('expands any tags to OR', () => {
    expect(
      buildBundleSearch({
        search: '',
        anyTags: 'js, typescript',
        allTags: '',
        excludedTags: '',
        filterUnread: 'off',
        filterShared: 'off'
      })
    ).toBe('#js #typescript');
  });

  it('expands all tags to AND', () => {
    expect(
      buildBundleSearch({
        search: '',
        anyTags: '',
        allTags: 'rust, async',
        excludedTags: '',
        filterUnread: 'off',
        filterShared: 'off'
      })
    ).toBe('#rust #async');
  });

  it('expands excluded tags with minus prefix', () => {
    expect(
      buildBundleSearch({
        search: '',
        anyTags: '',
        allTags: '',
        excludedTags: 'spam, draft',
        filterUnread: 'off',
        filterShared: 'off'
      })
    ).toBe('-#spam -#draft');
  });

  it('adds !unread keyword when filter is yes', () => {
    expect(
      buildBundleSearch({
        search: '',
        anyTags: '',
        allTags: '',
        excludedTags: '',
        filterUnread: 'yes',
        filterShared: 'off'
      })
    ).toBe('!unread');
  });

  it('does not add keyword when filter is off or no', () => {
    expect(
      buildBundleSearch({
        search: '',
        anyTags: '',
        allTags: '',
        excludedTags: '',
        filterUnread: 'no',
        filterShared: 'no'
      })
    ).toBe('');
  });

  it('combines search + any/all/excluded/unread', () => {
    expect(
      buildBundleSearch({
        search: 'rust guide',
        anyTags: 'js, ts',
        allTags: 'programming',
        excludedTags: 'spam',
        filterUnread: 'yes',
        filterShared: 'off'
      })
    ).toBe('rust guide #js #ts #programming -#spam !unread');
  });

  it('trims whitespace from search term', () => {
    expect(
      buildBundleSearch({
        search: '  hello  ',
        anyTags: '',
        allTags: '',
        excludedTags: '',
        filterUnread: 'off',
        filterShared: 'off'
      })
    ).toBe('hello');
  });
});

import { describe, it, expect } from 'vitest';
import {
  buildUpsertPatch,
  shouldUpsertCreateRequest
} from '../../src/db/repositories/bookmarks.repo';

describe('buildUpsertPatch', () => {
  it('omits fields the caller did not provide', () => {
    const patch = buildUpsertPatch({ ownerId: 1, url: 'https://example.com' });
    expect(patch).toEqual({});
  });

  it('passes through text fields when set', () => {
    const patch = buildUpsertPatch({
      ownerId: 1,
      url: 'https://example.com',
      title: 'Example',
      description: 'desc',
      notes: 'n'
    });
    expect(patch).toEqual({ title: 'Example', description: 'desc', notes: 'n' });
  });

  it('passes through flag fields when set', () => {
    const patch = buildUpsertPatch({
      ownerId: 1,
      url: 'https://example.com',
      isArchived: true,
      unread: true,
      shared: false
    });
    expect(patch).toEqual({ isArchived: true, unread: true, shared: false });
  });

  it('preserves explicit empty strings as an overwrite signal', () => {
    const patch = buildUpsertPatch({
      ownerId: 1,
      url: 'https://example.com',
      title: '',
      description: '',
      notes: ''
    });
    expect(patch).toEqual({ title: '', description: '', notes: '' });
  });

  it('does not leak through fields that are not part of the patch contract', () => {
    const patch = buildUpsertPatch({
      ownerId: 1,
      url: 'https://example.com',
      dateAdded: '2024-01-01T00:00:00.000Z',
      tagNames: ['a', 'b']
    });
    expect(patch).toEqual({});
  });
});

describe('shouldUpsertCreateRequest', () => {
  it('returns false when body is missing or not an object', () => {
    expect(shouldUpsertCreateRequest(null)).toBe(false);
    expect(shouldUpsertCreateRequest(undefined)).toBe(false);
    expect(shouldUpsertCreateRequest('not-an-object')).toBe(false);
    expect(shouldUpsertCreateRequest([])).toBe(false);
    expect(shouldUpsertCreateRequest(42)).toBe(false);
  });

  it('returns false when only url is present', () => {
    expect(shouldUpsertCreateRequest({ url: 'https://example.com' })).toBe(false);
  });

  it('returns true when any other field is present', () => {
    expect(shouldUpsertCreateRequest({ url: 'x', title: 'T' })).toBe(true);
    expect(shouldUpsertCreateRequest({ url: 'x', description: 'D' })).toBe(true);
    expect(shouldUpsertCreateRequest({ url: 'x', notes: 'N' })).toBe(true);
    expect(shouldUpsertCreateRequest({ url: 'x', is_archived: true })).toBe(true);
    expect(shouldUpsertCreateRequest({ url: 'x', unread: true })).toBe(true);
    expect(shouldUpsertCreateRequest({ url: 'x', shared: false })).toBe(true);
  });

  it('returns true when tag_names is present even as an empty array', () => {
    expect(shouldUpsertCreateRequest({ url: 'x', tag_names: [] })).toBe(true);
    expect(shouldUpsertCreateRequest({ url: 'x', tag_names: ['a'] })).toBe(true);
  });

  it('ignores unknown fields beyond url', () => {
    expect(shouldUpsertCreateRequest({ url: 'x', something_else: 'y' })).toBe(true);
  });
});

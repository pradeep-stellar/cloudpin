import { describe, it, expect } from 'vitest';
import { mapUpdateError } from '../../src/lib/server/edit-bookmark';
import { DuplicateUrlError } from '../../src/db/repositories/bookmarks.repo';

describe('mapUpdateError', () => {
  it('maps a DuplicateUrlError to a 409 with error: "duplicate_url"', () => {
    const out = mapUpdateError(new DuplicateUrlError());
    expect(out).toEqual({ status: 409, body: { error: 'duplicate_url' } });
  });

  it('returns null for unrelated Errors so they can propagate', () => {
    expect(
      mapUpdateError(new Error('Another bookmark with the same URL already exists'))
    ).toBeNull();
    expect(mapUpdateError(new Error('database is on fire'))).toBeNull();
  });

  it('returns null for non-Error values', () => {
    expect(mapUpdateError('another bookmark')).toBeNull();
    expect(mapUpdateError(null)).toBeNull();
    expect(mapUpdateError(undefined)).toBeNull();
    expect(mapUpdateError(42)).toBeNull();
  });
});

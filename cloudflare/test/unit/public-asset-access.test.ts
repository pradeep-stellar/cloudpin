import { describe, it, expect } from 'vitest';
import { decidePublicAssetAccess } from '../../src/domain/public-asset-access';

describe('decidePublicAssetAccess', () => {
  it('returns 404 when the asset does not exist', () => {
    const decision = decidePublicAssetAccess({
      asset: null,
      bookmark: null,
      profile: { enablePublicSharing: true }
    });
    expect(decision).toEqual({ allowed: false, status: 404, reason: 'not_found' });
  });

  it('returns 404 when the asset exists but the bookmark is missing', () => {
    const decision = decidePublicAssetAccess({
      asset: { status: 'complete', r2Key: 'k' },
      bookmark: null,
      profile: { enablePublicSharing: true }
    });
    expect(decision).toEqual({ allowed: false, status: 404, reason: 'not_found' });
  });

  it('returns 409 when the asset is not yet complete', () => {
    const decision = decidePublicAssetAccess({
      asset: { status: 'pending', r2Key: 'k' },
      bookmark: { shared: true },
      profile: { enablePublicSharing: true }
    });
    expect(decision).toEqual({ allowed: false, status: 409, reason: 'not_ready' });
  });

  it('returns 409 when the asset is complete but has no r2_key', () => {
    const decision = decidePublicAssetAccess({
      asset: { status: 'complete', r2Key: '' },
      bookmark: { shared: true },
      profile: { enablePublicSharing: true }
    });
    expect(decision).toEqual({ allowed: false, status: 409, reason: 'not_ready' });
  });

  it('returns 403 when the bookmark is not shared', () => {
    const decision = decidePublicAssetAccess({
      asset: { status: 'complete', r2Key: 'k' },
      bookmark: { shared: false },
      profile: { enablePublicSharing: true }
    });
    expect(decision).toEqual({ allowed: false, status: 403, reason: 'not_shared' });
  });

  it('returns 403 when the profile is missing', () => {
    const decision = decidePublicAssetAccess({
      asset: { status: 'complete', r2Key: 'k' },
      bookmark: { shared: true },
      profile: null
    });
    expect(decision).toEqual({
      allowed: false,
      status: 403,
      reason: 'public_sharing_disabled'
    });
  });

  it('returns 403 when the profile has public sharing disabled', () => {
    const decision = decidePublicAssetAccess({
      asset: { status: 'complete', r2Key: 'k' },
      bookmark: { shared: true },
      profile: { enablePublicSharing: false }
    });
    expect(decision).toEqual({
      allowed: false,
      status: 403,
      reason: 'public_sharing_disabled'
    });
  });

  it('returns allowed when bookmark is shared and public sharing is on', () => {
    const decision = decidePublicAssetAccess({
      asset: { status: 'complete', r2Key: 'k' },
      bookmark: { shared: true },
      profile: { enablePublicSharing: true }
    });
    expect(decision).toEqual({ allowed: true });
  });

  it('returns 403 (not 404) for shared-but-not-public assets', () => {
    // This is the acceptance test: the difference from the owner-facing
    // /assets/{id} route is that we never silently 404 — we explicitly
    // tell the caller "this is not public".
    const decision = decidePublicAssetAccess({
      asset: { status: 'complete', r2Key: 'k' },
      bookmark: { shared: false },
      profile: { enablePublicSharing: true }
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.status).toBe(403);
    }
  });
});

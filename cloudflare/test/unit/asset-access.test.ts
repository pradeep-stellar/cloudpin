import { describe, it, expect } from 'vitest';
import { decideAssetAccess, type AssetAccessInput } from '../../src/domain/asset-access';

const baseAsset = {
  status: 'complete' as const,
  r2Key: 'assets/1/2/3/file.png',
  contentType: 'image/png',
  displayName: 'file.png',
  fileSize: 1024
};

const baseBookmark = { ownerId: 7, shared: false };

function input(overrides: Partial<AssetAccessInput> = {}): AssetAccessInput {
  return {
    subject: { kind: 'anonymous' },
    asset: { ...baseAsset },
    bookmark: { ...baseBookmark },
    profile: { enableSharing: false, enablePublicSharing: false },
    ...overrides
  };
}

describe('decideAssetAccess', () => {
  it('allows the owner regardless of sharing flags', () => {
    const decision = decideAssetAccess(
      input({
        subject: { kind: 'authenticated', userId: 7 },
        bookmark: { ownerId: 7, shared: false },
        profile: { enableSharing: false, enablePublicSharing: false }
      })
    );
    expect(decision.allowed).toBe(true);
    if (decision.allowed) expect(decision.reason).toBe('owner');
  });

  it('denies another authenticated user when bookmark is not shared', () => {
    const decision = decideAssetAccess(
      input({
        subject: { kind: 'authenticated', userId: 99 },
        bookmark: { ownerId: 7, shared: false },
        profile: { enableSharing: true, enablePublicSharing: true }
      })
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.status).toBe(404);
      expect(decision.reason).toBe('forbidden');
    }
  });

  it('allows another authenticated user when shared and enableSharing is true', () => {
    const decision = decideAssetAccess(
      input({
        subject: { kind: 'authenticated', userId: 99 },
        bookmark: { ownerId: 7, shared: true },
        profile: { enableSharing: true, enablePublicSharing: false }
      })
    );
    expect(decision.allowed).toBe(true);
    if (decision.allowed) expect(decision.reason).toBe('shared_authenticated');
  });

  it('allows another authenticated user when shared and only enablePublicSharing is true', () => {
    const decision = decideAssetAccess(
      input({
        subject: { kind: 'authenticated', userId: 99 },
        bookmark: { ownerId: 7, shared: true },
        profile: { enableSharing: false, enablePublicSharing: true }
      })
    );
    expect(decision.allowed).toBe(true);
    if (decision.allowed) expect(decision.reason).toBe('shared_authenticated');
  });

  it('denies an authenticated user when shared but both sharing flags are off', () => {
    const decision = decideAssetAccess(
      input({
        subject: { kind: 'authenticated', userId: 99 },
        bookmark: { ownerId: 7, shared: true },
        profile: { enableSharing: false, enablePublicSharing: false }
      })
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe('forbidden');
  });

  it('allows an anonymous user when shared and public sharing is enabled', () => {
    const decision = decideAssetAccess(
      input({
        subject: { kind: 'anonymous' },
        bookmark: { ownerId: 7, shared: true },
        profile: { enableSharing: true, enablePublicSharing: true }
      })
    );
    expect(decision.allowed).toBe(true);
    if (decision.allowed) expect(decision.reason).toBe('public_shared');
  });

  it('denies an anonymous user when only authenticated sharing is enabled', () => {
    const decision = decideAssetAccess(
      input({
        subject: { kind: 'anonymous' },
        bookmark: { ownerId: 7, shared: true },
        profile: { enableSharing: true, enablePublicSharing: false }
      })
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe('forbidden');
  });

  it('denies an anonymous user when not shared at all', () => {
    const decision = decideAssetAccess(
      input({
        subject: { kind: 'anonymous' },
        bookmark: { ownerId: 7, shared: false },
        profile: { enableSharing: true, enablePublicSharing: true }
      })
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe('forbidden');
  });

  it('returns not_ready with 409 for pending assets', () => {
    const decision = decideAssetAccess(
      input({
        subject: { kind: 'authenticated', userId: 7 },
        asset: { ...baseAsset, status: 'pending' }
      })
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.status).toBe(409);
      expect(decision.reason).toBe('not_ready');
    }
  });

  it('returns not_ready with 409 for failed assets', () => {
    const decision = decideAssetAccess(
      input({
        subject: { kind: 'authenticated', userId: 7 },
        asset: { ...baseAsset, status: 'failure' }
      })
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.status).toBe(409);
      expect(decision.reason).toBe('not_ready');
    }
  });

  it('returns not_found when r2Key is empty', () => {
    const decision = decideAssetAccess(
      input({
        subject: { kind: 'authenticated', userId: 7 },
        asset: { ...baseAsset, r2Key: '' }
      })
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.status).toBe(404);
      expect(decision.reason).toBe('not_found');
    }
  });

  it('treats a missing profile as if sharing is disabled', () => {
    const decision = decideAssetAccess(
      input({
        subject: { kind: 'authenticated', userId: 99 },
        bookmark: { ownerId: 7, shared: true },
        profile: null
      })
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe('forbidden');
  });
});

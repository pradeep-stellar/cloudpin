import type { AssetStatus } from '../db/repositories/assets.repo';

export type AssetAccessSubject = { kind: 'anonymous' } | { kind: 'authenticated'; userId: number };

export type AssetAccessInput = {
  subject: AssetAccessSubject;
  asset: {
    status: AssetStatus;
    r2Key: string;
    contentType: string;
    displayName: string;
    fileSize: number | null;
  };
  bookmark: {
    ownerId: number;
    shared: boolean;
  };
  profile: {
    enableSharing: boolean;
    enablePublicSharing: boolean;
  } | null;
};

export type AssetAccessDecision =
  | {
      allowed: true;
      reason: 'owner' | 'shared_authenticated' | 'public_shared';
    }
  | {
      allowed: false;
      status: 404 | 409;
      reason: 'not_found' | 'not_ready' | 'forbidden' | 'object_missing';
    };

const NOT_READY: AssetAccessDecision = {
  allowed: false,
  status: 409,
  reason: 'not_ready'
};
const NOT_FOUND: AssetAccessDecision = { allowed: false, status: 404, reason: 'not_found' };

export function decideAssetAccess(input: AssetAccessInput): AssetAccessDecision {
  const { subject, asset, bookmark, profile } = input;

  if (asset.status !== 'complete') return NOT_READY;
  if (!asset.r2Key) return NOT_FOUND;

  if (subject.kind === 'authenticated' && subject.userId === bookmark.ownerId) {
    return { allowed: true, reason: 'owner' };
  }

  if (!bookmark.shared) {
    return { allowed: false, status: 404, reason: 'forbidden' };
  }

  if (subject.kind === 'anonymous') {
    if (profile?.enablePublicSharing) {
      return { allowed: true, reason: 'public_shared' };
    }
    return { allowed: false, status: 404, reason: 'forbidden' };
  }

  if (profile?.enableSharing || profile?.enablePublicSharing) {
    return { allowed: true, reason: 'shared_authenticated' };
  }

  return { allowed: false, status: 404, reason: 'forbidden' };
}

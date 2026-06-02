// Public asset access decision for the /public/assets/{id} route.
// This is intentionally stricter than the owner-facing decideAssetAccess
// in src/domain/asset-access.ts: the public route is reachable without
// any authentication, so the only way in is the (asset.bookmark.shared
// AND profile.enablePublicSharing) combination. Owner-only and
// shared-authenticated access do not apply; use /assets/{id} for
// those.
import type { AssetStatus } from '../db/repositories/assets.repo';

export type PublicAssetAccessInput = {
  asset: {
    status: AssetStatus;
    r2Key: string;
  } | null;
  bookmark: {
    shared: boolean;
  } | null;
  profile: {
    enablePublicSharing: boolean;
  } | null;
};

export type PublicAssetAccessDecision =
  | { allowed: true }
  | { allowed: false; status: 403 | 404 | 409; reason: string };

export function decidePublicAssetAccess(input: PublicAssetAccessInput): PublicAssetAccessDecision {
  if (!input.asset) {
    return { allowed: false, status: 404, reason: 'not_found' };
  }
  if (!input.bookmark) {
    return { allowed: false, status: 404, reason: 'not_found' };
  }
  if (input.asset.status !== 'complete' || !input.asset.r2Key) {
    return { allowed: false, status: 409, reason: 'not_ready' };
  }
  if (!input.bookmark.shared) {
    return { allowed: false, status: 403, reason: 'not_shared' };
  }
  if (!input.profile?.enablePublicSharing) {
    return { allowed: false, status: 403, reason: 'public_sharing_disabled' };
  }
  return { allowed: true };
}

import { error, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { getAssetById } from '$db/repositories/assets.repo';
import { getUserProfile } from '$db/repositories/profiles.repo';
import { decidePublicAssetAccess } from '$domain/public-asset-access';
import { getObjectStream } from '$storage/r2';
import {
  cspForContentType,
  contentDispositionHeader,
  dispositionFor
} from '$storage/content-security';

const ParamSchema = z.object({
  assetId: z.coerce.number().int().positive()
});

function httpError(status: number, message: string): never {
  throw error(status, message);
}

function publicCacheControl(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.startsWith('image/') || ct === 'image/svg+xml') {
    return 'public, max-age=3600';
  }
  return 'public, max-age=300';
}

export const GET: RequestHandler = async ({ params, url, platform }) => {
  const parsed = ParamSchema.safeParse({ assetId: params.assetId });
  if (!parsed.success) httpError(404, 'not_found');

  const db = platform?.env?.DB as D1Database | undefined;
  const bucket = platform?.env?.ASSETS_BUCKET as R2Bucket | undefined;
  if (!db || !bucket) httpError(404, 'not_found');

  const asset = await getAssetById(db, parsed.data.assetId);
  if (!asset) httpError(404, 'not_found');

  const profile = await getUserProfile(db, asset.bookmarkOwnerId);

  const decision = decidePublicAssetAccess({
    asset: {
      status: asset.status as 'pending' | 'complete' | 'failure',
      r2Key: asset.r2Key
    },
    bookmark: { shared: asset.bookmarkShared },
    profile: profile ? { enablePublicSharing: profile.enablePublicSharing } : null
  });

  if (!decision.allowed) {
    if (decision.status === 409) httpError(409, 'not_ready');
    if (decision.status === 404) httpError(404, 'not_found');
    httpError(403, decision.reason);
  }

  const obj = await getObjectStream(bucket, asset.r2Key);
  if (!obj) httpError(404, 'object_missing');

  const download = url.searchParams.get('download') === '1';
  const disposition = dispositionFor(download);

  return new Response(obj.body, {
    status: 200,
    headers: {
      'Content-Type': asset.contentType,
      'Content-Length': String(obj.size),
      'Content-Disposition': contentDispositionHeader(disposition, asset.displayName || 'asset'),
      'Content-Security-Policy': cspForContentType(asset.contentType),
      'Cache-Control': publicCacheControl(asset.contentType),
      'X-Content-Type-Options': 'nosniff'
    }
  });
};

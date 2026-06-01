import { error, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { getAssetById } from '$db/repositories/assets.repo';
import { getUserProfile } from '$db/repositories/profiles.repo';
import { decideAssetAccess, type AssetAccessSubject } from '$domain/asset-access';
import { getObjectStream } from '$storage/r2';
import {
  cspForContentType,
  contentDispositionHeader,
  dispositionFor
} from '$storage/content-security';

const ParamSchema = z.object({
  assetId: z.coerce.number().int().positive()
});

function subjectFromAuth(auth: App.Locals['auth']): AssetAccessSubject {
  if (auth.state.kind === 'api_token' || auth.state.kind === 'browser_session') {
    return { kind: 'authenticated', userId: auth.state.user.id };
  }
  return { kind: 'anonymous' };
}

function notFound(): never {
  throw error(404, 'not_found');
}

function cacheControlForContentType(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.startsWith('image/') || ct === 'image/svg+xml') {
    return 'public, max-age=3600';
  }
  return 'private, max-age=300';
}

export const GET: RequestHandler = async ({ params, url, locals, platform }) => {
  const parsed = ParamSchema.safeParse({ assetId: params.assetId });
  if (!parsed.success) notFound();

  const db = platform?.env?.DB as D1Database | undefined;
  const bucket = platform?.env?.ASSETS_BUCKET as R2Bucket | undefined;
  if (!db || !bucket) notFound();

  const asset = await getAssetById(db, parsed.data.assetId);
  if (!asset) notFound();

  const profile = await getUserProfile(db, asset.bookmarkOwnerId);

  const decision = decideAssetAccess({
    subject: subjectFromAuth(locals.auth),
    asset: {
      status: asset.status as 'pending' | 'complete' | 'failure',
      r2Key: asset.r2Key,
      contentType: asset.contentType,
      displayName: asset.displayName,
      fileSize: asset.fileSize
    },
    bookmark: { ownerId: asset.bookmarkOwnerId, shared: asset.bookmarkShared },
    profile: profile
      ? {
          enableSharing: profile.enableSharing,
          enablePublicSharing: profile.enablePublicSharing
        }
      : null
  });

  if (!decision.allowed) {
    if (decision.status === 409) {
      throw error(409, 'not_ready');
    }
    notFound();
  }

  const obj = await getObjectStream(bucket, asset.r2Key);
  if (!obj) notFound();

  const download = url.searchParams.get('download') === '1';
  const disposition = dispositionFor(download);

  return new Response(obj.body, {
    status: 200,
    headers: {
      'Content-Type': asset.contentType,
      'Content-Length': String(obj.size),
      'Content-Disposition': contentDispositionHeader(disposition, asset.displayName || 'asset'),
      'Content-Security-Policy': cspForContentType(asset.contentType),
      'Cache-Control': cacheControlForContentType(asset.contentType),
      'X-Content-Type-Options': 'nosniff'
    }
  });
};

import type { JobMessage } from './messages';
import { fetchSiteMeta } from './handlers/metadata';
import { fetchFavicon, isImageContentType } from './handlers/favicon';
import { fetchPreviewImage } from './handlers/preview';
import { completeAsset, createAsset, failAsset } from '../db/repositories/assets.repo';
import { getBookmarkById, updateBookmark } from '../db/repositories/bookmarks.repo';
import { r2Keys } from '../storage/asset-keys';
import { putObject } from '../storage/r2';

export type QueueEnv = {
  DB: D1Database;
  ASSETS_BUCKET: R2Bucket;
  FAVICON_PROVIDER?: string;
};

export type JobContext = {
  env: QueueEnv;
  message: JobMessage;
};

export async function runJob(ctx: JobContext): Promise<{ ok: boolean; reason?: string }> {
  const { env, message } = ctx;
  switch (message.type) {
    case 'metadata.refresh':
      return runMetadata(env, message);
    case 'favicon.load':
      return runFavicon(env, message);
    case 'preview.load':
      return runPreview(env, message);
    case 'wayback.create':
    case 'snapshot.create':
    case 'import.process':
    case 'backfill.favicons':
    case 'backfill.previews':
      return { ok: false, reason: 'not_implemented' };
    default:
      return { ok: false, reason: 'unknown_type' };
  }
}

async function runMetadata(
  env: QueueEnv,
  m: JobMessage
): Promise<{ ok: boolean; reason?: string }> {
  if (!m.bookmarkId) return { ok: false, reason: 'no_bookmark' };
  const b = await getBookmarkById(env.DB, m.userId, m.bookmarkId);
  if (!b) return { ok: false, reason: 'bookmark_not_found' };
  const meta = await fetchSiteMeta(b.url);
  if (!meta) return { ok: false, reason: 'meta_fetch_failed' };
  const patch: { title?: string; description?: string } = {};
  if (!b.title && meta.title) patch.title = meta.title;
  if (!b.description && meta.description) patch.description = meta.description;
  if (Object.keys(patch).length > 0) {
    await updateBookmark(env.DB, { ownerId: m.userId, id: m.bookmarkId, patch });
  }
  return { ok: true };
}

async function runFavicon(env: QueueEnv, m: JobMessage): Promise<{ ok: boolean; reason?: string }> {
  if (!m.bookmarkId) return { ok: false, reason: 'no_bookmark' };
  const b = await getBookmarkById(env.DB, m.userId, m.bookmarkId);
  if (!b) return { ok: false, reason: 'bookmark_not_found' };
  const assetId = await createAsset(env.DB, {
    bookmarkId: m.bookmarkId,
    assetType: 'favicon',
    contentType: 'image/x-icon',
    displayName: 'favicon',
    status: 'pending'
  });
  const fav = await fetchFavicon(b.url, { FAVICON_PROVIDER: env.FAVICON_PROVIDER });
  if (!fav || !isImageContentType(fav.contentType)) {
    await failAsset(env.DB, assetId);
    return { ok: false, reason: 'favicon_fetch_failed' };
  }
  const ext = fav.contentType.includes('png')
    ? 'png'
    : fav.contentType.includes('svg')
      ? 'svg'
      : fav.contentType.includes('jpeg') || fav.contentType.includes('jpg')
        ? 'jpg'
        : fav.contentType.includes('webp')
          ? 'webp'
          : 'ico';
  let host: string;
  try {
    host = new URL(b.url).hostname;
  } catch {
    host = b.url;
  }
  const key = r2Keys.favicon(host, ext);
  const put = await putObject(env.ASSETS_BUCKET, key, fav.body, {
    contentType: fav.contentType,
    cacheControl: 'public, max-age=604800'
  });
  await completeAsset(env.DB, assetId, { r2Key: put.key, fileSize: put.size });
  await updateBookmark(env.DB, {
    ownerId: m.userId,
    id: m.bookmarkId,
    patch: { faviconKey: put.key }
  });
  return { ok: true };
}

async function runPreview(env: QueueEnv, m: JobMessage): Promise<{ ok: boolean; reason?: string }> {
  if (!m.bookmarkId) return { ok: false, reason: 'no_bookmark' };
  const b = await getBookmarkById(env.DB, m.userId, m.bookmarkId);
  if (!b) return { ok: false, reason: 'bookmark_not_found' };
  const assetId = await createAsset(env.DB, {
    bookmarkId: m.bookmarkId,
    assetType: 'preview',
    contentType: 'image/jpeg',
    displayName: 'preview',
    status: 'pending'
  });
  const img = await fetchPreviewImage(b.url);
  if (!img) {
    await failAsset(env.DB, assetId);
    return { ok: false, reason: 'preview_fetch_failed' };
  }
  const ext = img.contentType.includes('png')
    ? 'png'
    : img.contentType.includes('webp')
      ? 'webp'
      : 'jpg';
  const key = r2Keys.preview(m.userId, m.bookmarkId, b.url, ext);
  const put = await putObject(env.ASSETS_BUCKET, key, img.body, {
    contentType: img.contentType,
    cacheControl: 'public, max-age=604800'
  });
  await completeAsset(env.DB, assetId, { r2Key: put.key, fileSize: put.size });
  await updateBookmark(env.DB, {
    ownerId: m.userId,
    id: m.bookmarkId,
    patch: { previewImageKey: put.key }
  });
  return { ok: true };
}

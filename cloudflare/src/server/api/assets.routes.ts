import { Hono } from 'hono';
import { z } from 'zod';
import {
  createAsset,
  getAsset,
  listAssetsForBookmark,
  deleteAsset
} from '../../db/repositories/assets.repo';
import { getBookmarkById } from '../../db/repositories/bookmarks.repo';
import { r2Keys } from '../../storage/asset-keys';
import { deleteObject, getObjectStream, putObject } from '../../storage/r2';

type AuthUser = { id: number; email: string; username: string; isAdmin: boolean };

type AssetsEnv = {
  Bindings: {
    DB: D1Database;
    ASSETS_BUCKET: R2Bucket;
    PUBLIC_BASE_URL?: string;
  };
  Variables: { user: AuthUser };
};

const UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

function cspForContentType(ct: string): string {
  if (ct.startsWith('image/')) return "default-src 'none'";
  if (ct === 'application/pdf') return "default-src 'none'; object-src 'self';";
  if (ct === 'text/html') return 'sandbox allow-scripts';
  return "default-src 'none'";
}

export const assetsRouter = new Hono<AssetsEnv>();

function userOrThrow(c: { get: (k: 'user') => AuthUser | undefined }): AuthUser {
  const u = c.get('user');
  if (!u) throw new Error('unauthenticated');
  return u;
}

assetsRouter.get('/bookmarks/:bookmarkId/assets', async (c) => {
  const user = userOrThrow(c);
  const bookmarkId = Number(c.req.param('bookmarkId'));
  if (!Number.isFinite(bookmarkId) || bookmarkId <= 0) {
    return c.json({ error: 'invalid_id' }, 400);
  }
  const items = await listAssetsForBookmark(c.env.DB, user.id, bookmarkId);
  return c.json({ count: items.length, results: items });
});

assetsRouter.post('/bookmarks/:bookmarkId/assets/upload', async (c) => {
  const user = userOrThrow(c);
  const bookmarkId = Number(c.req.param('bookmarkId'));
  if (!Number.isFinite(bookmarkId) || bookmarkId <= 0) {
    return c.json({ error: 'invalid_id' }, 400);
  }
  const b = await getBookmarkById(c.env.DB, user.id, bookmarkId);
  if (!b) return c.json({ error: 'not_found' }, 404);
  const form = await c.req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return c.json({ error: 'file_required' }, 400);
  if (file.size > UPLOAD_MAX_BYTES) {
    return c.json({ error: 'file_too_large', max: UPLOAD_MAX_BYTES }, 413);
  }
  const contentType = file.type || 'application/octet-stream';
  const filename = file.name || 'upload.bin';
  const ext = filename.includes('.') ? (filename.split('.').pop() ?? 'bin') : 'bin';
  const assetId = await createAsset(c.env.DB, {
    bookmarkId,
    assetType: 'upload',
    contentType,
    displayName: filename,
    status: 'pending'
  });
  const buf = await file.arrayBuffer();
  const key = r2Keys.asset(user.id, bookmarkId, assetId, filename, ext);
  const put = await putObject(c.env.ASSETS_BUCKET, key, buf, {
    contentType,
    cacheControl: 'public, max-age=86400',
    metadata: { ownerId: String(user.id) }
  });
  await c.env.DB.prepare(
    'UPDATE bookmark_assets SET r2_key = ?, file_size = ?, status = ? WHERE id = ?'
  )
    .bind(put.key, put.size, 'complete', assetId)
    .run();
  const item = await getAsset(c.env.DB, user.id, bookmarkId, assetId);
  return c.json(item, 201);
});

const AssetParams = z.object({
  bookmarkId: z.coerce.number().int().positive(),
  assetId: z.coerce.number().int().positive()
});

assetsRouter.get('/bookmarks/:bookmarkId/assets/:assetId', async (c) => {
  const user = userOrThrow(c);
  const params = AssetParams.safeParse({
    bookmarkId: c.req.param('bookmarkId'),
    assetId: c.req.param('assetId')
  });
  if (!params.success) return c.json({ error: 'invalid_id' }, 400);
  const asset = await getAsset(c.env.DB, user.id, params.data.bookmarkId, params.data.assetId);
  if (!asset) return c.json({ error: 'not_found' }, 404);
  if (asset.status !== 'complete' || !asset.r2Key) {
    return c.json({ error: 'not_ready' }, 409);
  }
  const obj = await getObjectStream(c.env.ASSETS_BUCKET, asset.r2Key);
  if (!obj) return c.json({ error: 'object_missing' }, 404);
  const url = new URL(c.req.url);
  const disposition = url.searchParams.get('download') === '1' ? 'attachment' : 'inline';
  return new Response(obj.body, {
    headers: {
      'Content-Type': asset.contentType,
      'Content-Length': String(obj.size),
      'Content-Disposition': `${disposition}; filename="${asset.displayName || 'asset'}"`,
      'Content-Security-Policy': cspForContentType(asset.contentType),
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff'
    }
  });
});

assetsRouter.get('/bookmarks/:bookmarkId/assets/:assetId/download', async (c) => {
  const url = new URL(c.req.url);
  url.searchParams.set('download', '1');
  return assetsRouter.fetch(
    new Request(url.toString(), { method: 'GET', headers: c.req.raw.headers }),
    c.env,
    c.executionCtx
  );
});

assetsRouter.delete('/bookmarks/:bookmarkId/assets/:assetId', async (c) => {
  const user = userOrThrow(c);
  const params = AssetParams.safeParse({
    bookmarkId: c.req.param('bookmarkId'),
    assetId: c.req.param('assetId')
  });
  if (!params.success) return c.json({ error: 'invalid_id' }, 400);
  const result = await deleteAsset(c.env.DB, user.id, params.data.assetId);
  if (!result) return c.json({ error: 'not_found' }, 404);
  if (result.r2Key) {
    try {
      await deleteObject(c.env.ASSETS_BUCKET, result.r2Key);
    } catch {
      /* ignore: object may already be gone */
    }
  }
  return c.body(null, 204);
});

assetsRouter.onError((err, c) => {
  console.error('assets router error', err);
  if (err instanceof z.ZodError) {
    return c.json({ error: 'validation', details: err.issues }, 400);
  }
  return c.json({ error: 'internal_error' }, 500);
});

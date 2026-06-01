import { Hono } from 'hono';
import { z } from 'zod';
import { getBookmarkById } from '../../db/repositories/bookmarks.repo';
import { createAsset, completeAsset, failAsset } from '../../db/repositories/assets.repo';
import { r2Keys } from '../../storage/asset-keys';
import { putObject } from '../../storage/r2';

type AuthUser = { id: number };

type Env = {
  Bindings: { DB: D1Database; ASSETS_BUCKET: R2Bucket };
  Variables: { user: AuthUser };
};

const UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

export const singlefileRouter = new Hono<Env>();

singlefileRouter.post('/bookmarks/:bookmarkId/singlefile', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'unauthenticated' }, 401);
  const bookmarkId = Number(c.req.param('bookmarkId'));
  if (!Number.isFinite(bookmarkId) || bookmarkId <= 0) {
    return c.json({ error: 'invalid_id' }, 400);
  }
  const b = await getBookmarkById(c.env.DB, user.id, bookmarkId);
  if (!b) return c.json({ error: 'not_found' }, 404);
  const contentType = c.req.header('content-type') ?? '';
  let body: ArrayBuffer;
  let filename: string;
  if (contentType.includes('application/json')) {
    const json = (await c.req.json().catch(() => null)) as {
      html?: string;
      filename?: string;
    } | null;
    if (!json || !json.html) return c.json({ error: 'html_required' }, 400);
    body = new TextEncoder().encode(json.html).buffer;
    filename = json.filename ?? `${new URL(b.url).hostname}.html`;
  } else {
    const buf = await c.req.raw.arrayBuffer();
    if (buf.byteLength === 0) return c.json({ error: 'empty_body' }, 400);
    body = buf;
    filename = c.req.header('x-filename') ?? `${new URL(b.url).hostname}.html`;
  }
  if (body.byteLength > UPLOAD_MAX_BYTES) {
    return c.json({ error: 'file_too_large', max: UPLOAD_MAX_BYTES }, 413);
  }
  const assetId = await createAsset(c.env.DB, {
    bookmarkId,
    assetType: 'snapshot',
    contentType: 'text/html; charset=utf-8',
    displayName: filename,
    status: 'pending'
  });
  const key = r2Keys.asset(user.id, bookmarkId, assetId, filename, 'html');
  try {
    const put = await putObject(c.env.ASSETS_BUCKET, key, body, {
      contentType: 'text/html; charset=utf-8',
      cacheControl: 'public, max-age=31536000'
    });
    await completeAsset(c.env.DB, assetId, { r2Key: put.key, fileSize: put.size });
  } catch {
    await failAsset(c.env.DB, assetId);
    return c.json({ error: 'upload_failed' }, 500);
  }
  return c.json({ ok: true, asset_id: assetId }, 201);
});

singlefileRouter.onError((err, c) => {
  if (err instanceof z.ZodError) {
    return c.json({ error: 'validation', details: err.issues }, 400);
  }
  console.error('singlefile router error', err);
  return c.json({ error: 'internal_error' }, 500);
});

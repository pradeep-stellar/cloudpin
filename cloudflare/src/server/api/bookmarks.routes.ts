import { Hono } from 'hono';
import { z } from 'zod';
import {
  BookmarkCreate,
  BookmarkUpdate,
  BookmarkListQuery
} from '../../validation/bookmark.schemas';
import { drfPage } from './pagination';
import {
  createBookmark,
  deleteBookmark,
  findBookmarkByNormalizedUrl,
  getBookmarkById,
  listBookmarks,
  setBookmarkArchive,
  shouldUpsertCreateRequest,
  updateBookmark,
  DuplicateUrlError
} from '../../db/repositories/bookmarks.repo';
import { completeAsset, createAsset, failAsset } from '../../db/repositories/assets.repo';
import { r2Keys } from '../../storage/asset-keys';
import { putObject } from '../../storage/r2';
import { normalizeUrl } from '../../domain/url-normalize';

const SINGLEFILE_MAX_BYTES = 20 * 1024 * 1024;

type Bindings = {
  DB: D1Database;
  ASSETS_BUCKET: R2Bucket;
  APP_SECRET?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ADMIN_EMAILS?: string;
  API_TOKEN_PEPPER?: string;
  PUBLIC_BASE_URL?: string;
};

type AuthUser = {
  id: number;
  email: string;
  username: string;
  isAdmin: boolean;
};

type ApiEnv = {
  Bindings: Bindings;
  Variables: {
    user: AuthUser;
    authKind: 'api_token' | 'browser_session';
    tokenId?: number;
  };
};

export const bookmarksRouter = new Hono<ApiEnv>();

function requireUser(c: { get: (k: 'user') => AuthUser | undefined }): AuthUser {
  const u = c.get('user');
  if (!u) throw new HttpError(401, 'unauthenticated');
  return u as AuthUser;
}

class HttpError extends Error {
  constructor(
    public status: number,
    public body: unknown
  ) {
    super(typeof body === 'string' ? body : JSON.stringify(body));
    this.name = 'HttpError';
  }
}

function handleError(err: unknown) {
  if (err instanceof HttpError) {
    return Response.json(err.body, { status: err.status });
  }
  if (err instanceof DuplicateUrlError) {
    return Response.json({ error: 'duplicate_url' }, { status: 409 });
  }
  if (err instanceof z.ZodError) {
    return Response.json({ error: 'validation', details: err.issues }, { status: 400 });
  }
  console.error('api error', err);
  return Response.json({ error: 'internal_error' }, { status: 500 });
}

bookmarksRouter.get('/', async (c) => {
  const user = requireUser(c);
  const queryParse = BookmarkListQuery.safeParse({
    q: c.req.query('q') ?? undefined,
    page: c.req.query('page') ?? undefined,
    page_size: c.req.query('page_size') ?? undefined,
    archived: c.req.query('archived') ?? undefined
  });
  if (!queryParse.success) return handleError(queryParse.error);
  const { q, page, page_size, archived } = queryParse.data;

  const offset = (page - 1) * page_size;
  const { items, total } = await listBookmarks(c.env.DB, {
    ownerId: user.id,
    searchQuery: q,
    archivedFilter: archived ?? 'false',
    limit: page_size,
    offset
  });
  const baseUrl = new URL(c.req.url);
  return c.json(drfPage(items, total, baseUrl.toString(), page, page_size));
});

bookmarksRouter.post('/', async (c) => {
  const user = requireUser(c);
  const body = await c.req.json().catch(() => null);
  const parsed = BookmarkCreate.safeParse(body);
  if (!parsed.success) return handleError(parsed.error);
  const { tag_names, ...rest } = parsed.data;
  const upsert = shouldUpsertCreateRequest(body);
  try {
    const result = await createBookmark(
      c.env.DB,
      {
        ownerId: user.id,
        tagNames: tag_names,
        ...rest
      },
      { upsert }
    );
    const item = await getBookmarkById(c.env.DB, user.id, result.id);
    return c.json(item, { status: result.created ? 201 : 200 });
  } catch (err) {
    return handleError(err);
  }
});

bookmarksRouter.get('/check', async (c) => {
  const user = requireUser(c);
  const url = c.req.query('url');
  if (!url) return c.json({ error: 'url_required' }, 400);
  let normalized: string;
  try {
    normalized = normalizeUrl(url);
  } catch {
    return c.json({ error: 'invalid_url' }, 400);
  }
  const existing = await findBookmarkByNormalizedUrl(c.env.DB, user.id, normalized);
  if (!existing) return c.json({ exists: false }, 200);
  return c.json(
    {
      exists: true,
      bookmark: {
        id: existing.id,
        url: existing.url,
        title: existing.title,
        is_archived: existing.isArchived
      }
    },
    200
  );
});

const IdParam = z.object({ id: z.coerce.number().int().positive() });

bookmarksRouter.get('/:id', async (c) => {
  const user = requireUser(c);
  const parsed = IdParam.safeParse({ id: c.req.param('id') });
  if (!parsed.success) return handleError(parsed.error);
  const item = await getBookmarkById(c.env.DB, user.id, parsed.data.id);
  if (!item) return c.json({ error: 'not_found' }, 404);
  return c.json(item);
});

bookmarksRouter.put('/:id', async (c) => {
  const user = requireUser(c);
  const idParsed = IdParam.safeParse({ id: c.req.param('id') });
  if (!idParsed.success) return handleError(idParsed.error);
  const body = await c.req.json().catch(() => null);
  const parsed = BookmarkUpdate.safeParse(body);
  if (!parsed.success) return handleError(parsed.error);
  try {
    const updated = await updateBookmark(c.env.DB, {
      ownerId: user.id,
      id: idParsed.data.id,
      patch: parsed.data
    });
    if (!updated) return c.json({ error: 'not_found' }, 404);
    const item = await getBookmarkById(c.env.DB, user.id, updated.id);
    return c.json(item);
  } catch (err) {
    return handleError(err);
  }
});

bookmarksRouter.patch('/:id', async (c) => {
  return bookmarksRouter.fetch(
    new Request(c.req.url, { method: 'PUT', headers: c.req.raw.headers, body: c.req.raw.body }),
    c.env,
    c.executionCtx
  );
});

bookmarksRouter.delete('/:id', async (c) => {
  const user = requireUser(c);
  const parsed = IdParam.safeParse({ id: c.req.param('id') });
  if (!parsed.success) return handleError(parsed.error);
  const ok = await deleteBookmark(c.env.DB, user.id, parsed.data.id);
  if (!ok) return c.json({ error: 'not_found' }, 404);
  return c.body(null, 204);
});

bookmarksRouter.post('/:id/archive', async (c) => {
  const user = requireUser(c);
  const parsed = IdParam.safeParse({ id: c.req.param('id') });
  if (!parsed.success) return handleError(parsed.error);
  const updated = await setBookmarkArchive(c.env.DB, user.id, parsed.data.id, true);
  if (!updated) return c.json({ error: 'not_found' }, 404);
  return c.json(await getBookmarkById(c.env.DB, user.id, parsed.data.id));
});

bookmarksRouter.post('/:id/unarchive', async (c) => {
  const user = requireUser(c);
  const parsed = IdParam.safeParse({ id: c.req.param('id') });
  if (!parsed.success) return handleError(parsed.error);
  const updated = await setBookmarkArchive(c.env.DB, user.id, parsed.data.id, false);
  if (!updated) return c.json({ error: 'not_found' }, 404);
  return c.json(await getBookmarkById(c.env.DB, user.id, parsed.data.id));
});

bookmarksRouter.get('/archived', async (c) => {
  const user = requireUser(c);
  const offset = Number(c.req.query('offset') ?? '0');
  const limit = Math.min(Number(c.req.query('limit') ?? '100'), 200);
  const { items, total } = await listBookmarks(c.env.DB, {
    ownerId: user.id,
    archivedFilter: 'only',
    limit,
    offset
  });
  return c.json({ count: total, results: items });
});

bookmarksRouter.get('/shared', async (c) => {
  const user = requireUser(c);
  const offset = Number(c.req.query('offset') ?? '0');
  const limit = Math.min(Number(c.req.query('limit') ?? '100'), 200);
  const { items, total } = await listBookmarks(c.env.DB, {
    ownerId: user.id,
    archivedFilter: 'false',
    limit,
    offset
  });
  const shared = items.filter((b) => b.shared);
  return c.json({ count: total, results: shared });
});

bookmarksRouter.post('/:bookmarkId/singlefile', async (c) => {
  const user = requireUser(c);
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
  if (body.byteLength > SINGLEFILE_MAX_BYTES) {
    return c.json({ error: 'file_too_large', max: SINGLEFILE_MAX_BYTES }, 413);
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

bookmarksRouter.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json(err.body, err.status as 400);
  }
  if (err instanceof z.ZodError) {
    return c.json({ error: 'validation', details: err.issues }, 400);
  }
  if (err instanceof DuplicateUrlError) {
    return c.json({ error: 'duplicate_url' }, 409);
  }
  console.error('bookmarks router error', err);
  return c.json({ error: 'internal_error' }, 500);
});

import { Hono } from 'hono';
import { z } from 'zod';
import { TagCreate } from '../../validation/bookmark.schemas';
import { createTag, deleteTag, getTagById, listTags } from '../../db/repositories/tags.repo';

type Bindings = {
  DB: D1Database;
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
  Variables: { user: AuthUser; authKind: 'api_token' | 'browser_session'; tokenId?: number };
};

export const tagsRouter = new Hono<ApiEnv>();

function requireUser(c: { get: (k: 'user') => AuthUser | undefined }): AuthUser {
  const u = c.get('user');
  if (!u) throw new Error('unauthenticated');
  return u as AuthUser;
}

tagsRouter.get('/', async (c) => {
  const user = requireUser(c);
  const limit = Math.min(Number(c.req.query('limit') ?? '200'), 200);
  const offset = Number(c.req.query('offset') ?? '0');
  const { items, total } = await listTags(c.env.DB, user.id, { limit, offset });
  return c.json({ count: total, results: items });
});

tagsRouter.post('/', async (c) => {
  const user = requireUser(c);
  const body = await c.req.json().catch(() => null);
  const parsed = TagCreate.safeParse(body);
  if (!parsed.success) return c.json({ error: 'validation', details: parsed.error.issues }, 400);
  const result = await createTag(c.env.DB, user.id, parsed.data.name);
  const tag = await getTagById(c.env.DB, user.id, result.id);
  return c.json(tag, { status: result.created ? 201 : 200 });
});

const IdParam = z.object({ id: z.coerce.number().int().positive() });

tagsRouter.get('/:id', async (c) => {
  const user = requireUser(c);
  const parsed = IdParam.safeParse({ id: c.req.param('id') });
  if (!parsed.success) return c.json({ error: 'validation' }, 400);
  const tag = await getTagById(c.env.DB, user.id, parsed.data.id);
  if (!tag) return c.json({ error: 'not_found' }, 404);
  return c.json(tag);
});

tagsRouter.delete('/:id', async (c) => {
  const user = requireUser(c);
  const parsed = IdParam.safeParse({ id: c.req.param('id') });
  if (!parsed.success) return c.json({ error: 'validation' }, 400);
  const ok = await deleteTag(c.env.DB, user.id, parsed.data.id);
  if (!ok) return c.json({ error: 'not_found' }, 404);
  return c.body(null, 204);
});

tagsRouter.onError((err, c) => {
  console.error('tags router error', err);
  return c.json({ error: 'internal_error' }, 500);
});

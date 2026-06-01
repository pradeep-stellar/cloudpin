import { error, fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import { getBookmarkById, updateBookmark } from '$db/repositories/bookmarks.repo';
import { getDb } from '$db/client';
import { bookmarkTags, tags } from '$db/schema';
import { BookmarkUpdate } from '$validation/bookmark.schemas';
import { splitTags, normalizeTagName } from '$domain/tags';
import { eq } from 'drizzle-orm';

export const load: ServerLoad = async ({ locals, params, platform }) => {
  if (locals.auth.state.kind === 'unauthenticated') {
    throw redirect(302, '/login');
  }
  const user = locals.auth.state.user;
  const id = Number(params.bookmarkId);
  if (!Number.isFinite(id) || id <= 0) {
    throw error(400, 'invalid bookmark id');
  }
  const item = await getBookmarkById(platform!.env.DB as D1Database, user.id, id);
  if (!item) {
    throw error(404, 'bookmark not found');
  }
  return { bookmark: item };
};

export const actions: Actions = {
  default: async ({ request, locals, params, platform }) => {
    if (locals.auth.state.kind === 'unauthenticated') {
      return fail(401, { error: 'unauthenticated' });
    }
    const user = locals.auth.state.user;
    const id = Number(params.bookmarkId);
    if (!Number.isFinite(id) || id <= 0) return fail(400, { error: 'invalid_id' });

    const data = await request.formData();
    const tagsRaw = String(data.get('tag_names') ?? '');
    const candidate: Record<string, unknown> = {
      url: data.has('url') ? String(data.get('url') ?? '').trim() : undefined,
      title: data.has('title') ? String(data.get('title') ?? '').trim() : undefined,
      description: data.has('description') ? String(data.get('description') ?? '') : undefined,
      notes: data.has('notes') ? String(data.get('notes') ?? '') : undefined,
      is_archived: data.get('is_archived') === 'on',
      unread: data.get('unread') === 'on',
      shared: data.get('shared') === 'on'
    };
    for (const k of Object.keys(candidate)) {
      if (candidate[k] === undefined) delete candidate[k];
    }
    if (data.has('tag_names')) {
      candidate.tag_names = splitTags(tagsRaw);
    }
    const parsed = BookmarkUpdate.safeParse(candidate);
    if (!parsed.success) {
      return fail(400, { error: 'validation', details: parsed.error.issues });
    }
    const { tag_names, ...rest } = parsed.data;
    try {
      const updated = await updateBookmark(platform!.env.DB as D1Database, {
        ownerId: user.id,
        id,
        patch: rest
      });
      if (!updated) return fail(404, { error: 'not_found' });
      if (tag_names) {
        await replaceTags(platform!.env.DB as D1Database, user.id, id, tag_names);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      if (msg.includes('Another bookmark')) {
        return fail(409, { error: 'duplicate_url' });
      }
      throw err;
    }
    throw redirect(303, `/bookmarks/${id}/details`);
  }
};

async function replaceTags(
  d1: D1Database,
  ownerId: number,
  bookmarkId: number,
  tagNames: string[]
): Promise<void> {
  const db = getDb(d1);
  const normToName = new Map<string, string>();
  for (const n of tagNames) {
    const norm = normalizeTagName(n);
    if (norm && !normToName.has(norm)) normToName.set(norm, n);
  }
  const norms = [...normToName.keys()];
  if (norms.length === 0) {
    await db.delete(bookmarkTags).where(eq(bookmarkTags.bookmarkId, bookmarkId));
    return;
  }
  const existing = await db
    .select()
    .from(tags)
    .where(eq(tags.ownerId, ownerId))
    .then(async () => db.select().from(tags).where(eq(tags.ownerId, ownerId)));
  void existing;
  const matched = await db.select().from(tags).where(eq(tags.ownerId, ownerId));
  const matchedFiltered = matched.filter((t) => norms.includes(t.nameNormalized));
  const matchedNorms = new Set(matchedFiltered.map((t) => t.nameNormalized));
  const toCreate = norms.filter((n) => !matchedNorms.has(n));
  if (toCreate.length > 0) {
    const now = new Date().toISOString();
    await db.insert(tags).values(
      toCreate.map((n) => ({
        ownerId,
        name: normToName.get(n) ?? n,
        nameNormalized: n,
        dateAdded: now
      }))
    );
  }
  const all = await db
    .select()
    .from(tags)
    .where(eq(tags.ownerId, ownerId))
    .then((rows) => rows.filter((r) => norms.includes(r.nameNormalized)));
  await db.delete(bookmarkTags).where(eq(bookmarkTags.bookmarkId, bookmarkId));
  if (all.length > 0) {
    await db.insert(bookmarkTags).values(all.map((t) => ({ bookmarkId, tagId: t.id })));
  }
}

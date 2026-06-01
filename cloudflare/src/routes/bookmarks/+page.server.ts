import { redirect, fail, type Actions, type ServerLoad } from '@sveltejs/kit';
import { sql, eq, desc } from 'drizzle-orm';
import { listBookmarks, setBookmarkArchive, deleteBookmark } from '$db/repositories/bookmarks.repo';
import { getDb } from '$db/client';
import { bookmarkTags, tags } from '$db/schema';

const PAGE_SIZE = 30;

export const load: ServerLoad = async ({ locals, url, platform }) => {
  if (locals.auth.state.kind === 'unauthenticated') {
    throw redirect(302, '/login');
  }
  const user = locals.auth.state.user;
  const db = getDb(platform!.env.DB as D1Database);

  const q = url.searchParams.get('q') ?? '';
  const tagFilter = url.searchParams.get('tag') ?? '';
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));

  const fullQuery = [q, tagFilter ? `#${tagFilter}` : ''].filter(Boolean).join(' ');

  const offset = (page - 1) * PAGE_SIZE;
  const { items, total } = await listBookmarks(platform!.env.DB as D1Database, {
    ownerId: user.id,
    searchQuery: fullQuery,
    archivedFilter: 'false',
    limit: PAGE_SIZE,
    offset
  });

  const tagRows = await db
    .select({
      name: tags.name,
      count: sql<number>`count(*)`.as('count')
    })
    .from(bookmarkTags)
    .innerJoin(tags, eq(tags.id, bookmarkTags.tagId))
    .where(eq(tags.ownerId, user.id))
    .groupBy(tags.name)
    .orderBy(desc(sql`count`))
    .limit(40);

  return {
    bookmarks: items,
    tags: tagRows.map((r) => ({ name: r.name, count: Number(r.count) })),
    total,
    page,
    pageSize: PAGE_SIZE,
    q,
    tagFilter
  };
};

export const actions: Actions = {
  toggleArchive: async ({ request, locals, platform }) => {
    if (locals.auth.state.kind === 'unauthenticated') return fail(401);
    const user = locals.auth.state.user;
    const data = await request.formData();
    const id = Number(data.get('id'));
    const archive = data.get('archive') === 'true';
    if (!Number.isFinite(id) || id <= 0) return fail(400, { error: 'invalid_id' });
    await setBookmarkArchive(platform!.env.DB as D1Database, user.id, id, archive);
    return { ok: true };
  },

  delete: async ({ request, locals, platform }) => {
    if (locals.auth.state.kind === 'unauthenticated') return fail(401);
    const user = locals.auth.state.user;
    const data = await request.formData();
    const id = Number(data.get('id'));
    if (!Number.isFinite(id) || id <= 0) return fail(400, { error: 'invalid_id' });
    await deleteBookmark(platform!.env.DB as D1Database, user.id, id);
    return { ok: true };
  }
};

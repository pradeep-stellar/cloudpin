import { redirect, fail, type Actions, type ServerLoad } from '@sveltejs/kit';
import { sql, eq, desc } from 'drizzle-orm';
import {
  listBookmarks,
  bulkUpdateBookmarks,
  bulkDeleteBookmarks,
  bulkAddTag,
  bulkRemoveTag
} from '$db/repositories/bookmarks.repo';
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

function readIds(formData: FormData): number[] {
  const values = formData.getAll('selected');
  return values.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
}

export const actions: Actions = {
  bulkAction: async ({ request, locals, platform }) => {
    if (locals.auth.state.kind === 'unauthenticated') return fail(401);
    const user = locals.auth.state.user;
    const db = platform!.env.DB as D1Database;
    const data = await request.formData();
    const action = String(data.get('action') ?? '');
    const ids = readIds(data);
    if (!action || ids.length === 0) {
      return fail(400, { error: 'no_selection' });
    }
    switch (action) {
      case 'archive':
        await bulkUpdateBookmarks(db, user.id, ids, { isArchived: true });
        return { ok: true, action, count: ids.length };
      case 'unarchive':
        await bulkUpdateBookmarks(db, user.id, ids, { isArchived: false });
        return { ok: true, action, count: ids.length };
      case 'delete':
        await bulkDeleteBookmarks(db, user.id, ids);
        return { ok: true, action, count: ids.length };
      case 'markRead':
        await bulkUpdateBookmarks(db, user.id, ids, { unread: false });
        return { ok: true, action, count: ids.length };
      case 'markUnread':
        await bulkUpdateBookmarks(db, user.id, ids, { unread: true });
        return { ok: true, action, count: ids.length };
      case 'share':
        await bulkUpdateBookmarks(db, user.id, ids, { shared: true });
        return { ok: true, action, count: ids.length };
      case 'unshare':
        await bulkUpdateBookmarks(db, user.id, ids, { shared: false });
        return { ok: true, action, count: ids.length };
      case 'addTag': {
        const tag = String(data.get('tag') ?? '').trim();
        if (!tag) return fail(400, { error: 'no_tag' });
        const r = await bulkAddTag(db, user.id, ids, tag);
        return { ok: true, action, count: r.addedBookmarkCount };
      }
      case 'removeTag': {
        const tag = String(data.get('tag') ?? '').trim();
        if (!tag) return fail(400, { error: 'no_tag' });
        const count = await bulkRemoveTag(db, user.id, ids, tag);
        return { ok: true, action, count };
      }
      default:
        return fail(400, { error: 'unknown_action' });
    }
  }
};

import { redirect, fail, type Actions, type ServerLoad } from '@sveltejs/kit';
import {
  listBookmarks,
  bulkUpdateBookmarks,
  bulkDeleteBookmarks,
  bulkAddTag,
  bulkRemoveTag
} from '$db/repositories/bookmarks.repo';

export const load: ServerLoad = async ({ locals, platform }) => {
  if (locals.auth.state.kind === 'unauthenticated') {
    throw redirect(302, '/login');
  }
  const user = locals.auth.state.user;
  const { items, total } = await listBookmarks(platform!.env.DB as D1Database, {
    ownerId: user.id,
    archivedFilter: 'false',
    limit: 200,
    offset: 0
  });
  const shared = items.filter((b) => b.shared);
  return { bookmarks: shared, total: shared.length, all: total };
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
    if (!action || ids.length === 0) return fail(400, { error: 'no_selection' });
    switch (action) {
      case 'unshare':
        await bulkUpdateBookmarks(db, user.id, ids, { shared: false });
        return { ok: true, action, count: ids.length };
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

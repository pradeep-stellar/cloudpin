import { error, fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import {
  getBookmarkById,
  setBookmarkArchive,
  deleteBookmark
} from '$db/repositories/bookmarks.repo';
import { displayUrl } from '$domain/url-normalize';

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
  return {
    bookmark: item,
    displayHost: displayUrl(item.url)
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
    const ok = await deleteBookmark(platform!.env.DB as D1Database, user.id, id);
    if (!ok) return fail(404, { error: 'not_found' });
    throw redirect(303, '/bookmarks');
  }
};

import { redirect, type ServerLoad } from '@sveltejs/kit';
import { listBookmarks } from '$db/repositories/bookmarks.repo';

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

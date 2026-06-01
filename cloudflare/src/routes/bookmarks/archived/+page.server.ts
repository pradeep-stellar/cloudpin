import { redirect, type ServerLoad } from '@sveltejs/kit';
import { listBookmarks } from '$db/repositories/bookmarks.repo';

const PAGE_SIZE = 30;

export const load: ServerLoad = async ({ locals, url, platform }) => {
  if (locals.auth.state.kind === 'unauthenticated') {
    throw redirect(302, '/login');
  }
  const user = locals.auth.state.user;
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
  const offset = (page - 1) * PAGE_SIZE;
  const { items, total } = await listBookmarks(platform!.env.DB as D1Database, {
    ownerId: user.id,
    archivedFilter: 'only',
    limit: PAGE_SIZE,
    offset
  });
  return { bookmarks: items, total, page, pageSize: PAGE_SIZE };
};

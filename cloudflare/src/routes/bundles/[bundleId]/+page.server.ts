import { redirect, error, type ServerLoad } from '@sveltejs/kit';
import { getBundle } from '$db/repositories/bundles.repo';
import { listBookmarks } from '$db/repositories/bookmarks.repo';
import { buildBundleSearch } from '$domain/bundles';

export const load: ServerLoad = async ({ locals, platform, params, url }) => {
  if (locals.auth.state.kind === 'unauthenticated') {
    throw redirect(302, '/login');
  }
  const user = locals.auth.state.user;
  const id = Number(params.bundleId);
  if (!Number.isFinite(id) || id <= 0) throw error(404, 'Invalid bundle id');
  const db = platform!.env.DB as D1Database;
  const bundle = await getBundle(db, user.id, id);
  if (!bundle) throw error(404, 'Bundle not found');
  const searchQuery = buildBundleSearch({
    search: bundle.search,
    anyTags: bundle.any_tags,
    allTags: bundle.all_tags,
    excludedTags: bundle.excluded_tags,
    filterUnread: bundle.filter_unread,
    filterShared: bundle.filter_shared
  });
  const archivedFilter = url.searchParams.get('archived') === 'true' ? 'only' : 'false';
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
  const PAGE_SIZE = 30;
  const offset = (page - 1) * PAGE_SIZE;
  const { items, total } = await listBookmarks(db, {
    ownerId: user.id,
    searchQuery,
    archivedFilter,
    limit: PAGE_SIZE,
    offset
  });
  return { bundle, bookmarks: items, total, page, pageSize: PAGE_SIZE };
};

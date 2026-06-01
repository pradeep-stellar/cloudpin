import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { exportNetscape, type ExportBookmark } from '$domain/netscape';
import { listBookmarks } from '$db/repositories/bookmarks.repo';

export const GET: RequestHandler = async ({ locals, platform }) => {
  if (locals.auth.state.kind === 'unauthenticated') {
    throw error(401, 'unauthenticated');
  }
  const user = locals.auth.state.user;
  const db = platform!.env.DB as D1Database;
  const { items } = await listBookmarks(db, {
    ownerId: user.id,
    archivedFilter: 'all',
    limit: 100000,
    offset: 0
  });
  const out: ExportBookmark[] = items.map((b) => ({
    url: b.url,
    title: b.title,
    description: b.description,
    notes: b.notes,
    tags: b.tag_names,
    archived: b.is_archived,
    unread: b.unread,
    shared: b.shared,
    dateAdded: b.date_added
  }));
  const body = exportNetscape(out);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': 'attachment; filename="cloudpin-bookmarks.html"'
    }
  });
};

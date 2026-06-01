import { error, json, type RequestHandler } from '@sveltejs/kit';
import { importNetscape } from '$domain/netscape-import';
import { normalizeUrl } from '$domain/url-normalize';
import { normalizeTagName } from '$domain/tags';
import { createBookmark, DuplicateUrlError } from '$db/repositories/bookmarks.repo';

export const POST: RequestHandler = async ({ request, locals, platform }) => {
  if (locals.auth.state.kind === 'unauthenticated') {
    throw error(401, 'unauthenticated');
  }
  const user = locals.auth.state.user;
  const db = platform!.env.DB as D1Database;
  const contentType = request.headers.get('content-type') ?? '';
  let html: string;
  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    const form = await request.formData();
    const file = form.get('file');
    if (file instanceof File) {
      html = await file.text();
    } else {
      html = String(form.get('html') ?? '');
    }
  } else {
    html = await request.text();
  }
  if (!html.trim()) {
    return json({ ok: false, error: 'empty_file' }, { status: 400 });
  }
  const imported = importNetscape(html);
  let created = 0;
  let updated = 0;
  let failed = 0;
  for (const item of imported) {
    const normalized = normalizeUrl(item.url);
    if (!normalized) {
      failed++;
      continue;
    }
    const tags = item.tags.map((t) => normalizeTagName(t)).filter(Boolean);
    try {
      const result = await createBookmark(db, {
        ownerId: user.id,
        url: item.url,
        title: item.title,
        description: item.description,
        notes: item.notes,
        tagNames: tags,
        isArchived: item.archived,
        unread: item.unread,
        shared: item.shared,
        dateAdded: item.dateAdded ?? undefined
      });
      if (result.created) created++;
      else updated++;
    } catch (e) {
      if (e instanceof DuplicateUrlError) failed++;
      else failed++;
    }
  }
  return json({ ok: true, created, updated, failed, total: imported.length });
};

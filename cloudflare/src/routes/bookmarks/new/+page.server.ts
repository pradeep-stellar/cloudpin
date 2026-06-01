import { fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import { createBookmark } from '$db/repositories/bookmarks.repo';
import { BookmarkCreate } from '$validation/bookmark.schemas';
import { splitTags } from '$domain/tags';

export const load: ServerLoad = async ({ locals }) => {
  if (locals.auth.state.kind === 'unauthenticated') {
    throw redirect(302, '/login');
  }
  return {};
};

export const actions: Actions = {
  default: async ({ request, locals, platform }) => {
    if (locals.auth.state.kind === 'unauthenticated') {
      return fail(401, { error: 'unauthenticated', values: null });
    }
    const user = locals.auth.state.user;
    const data = await request.formData();
    const tagsRaw = String(data.get('tag_names') ?? '');
    const candidate = {
      url: String(data.get('url') ?? '').trim(),
      title: String(data.get('title') ?? '').trim(),
      description: String(data.get('description') ?? ''),
      notes: String(data.get('notes') ?? ''),
      tag_names: splitTags(tagsRaw),
      is_archived: data.get('is_archived') === 'on',
      unread: data.get('unread') === 'on',
      shared: data.get('shared') === 'on'
    };
    const parsed = BookmarkCreate.safeParse(candidate);
    if (!parsed.success) {
      return fail(400, {
        error: 'validation',
        details: parsed.error.issues,
        values: candidate
      });
    }
    const { tag_names, ...rest } = parsed.data;
    const result = await createBookmark(platform!.env.DB as D1Database, {
      ownerId: user.id,
      tagNames: tag_names,
      ...rest
    });
    throw redirect(303, `/bookmarks/${result.id}/details`);
  }
};

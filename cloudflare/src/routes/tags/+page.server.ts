import { redirect, fail, type Actions, type ServerLoad } from '@sveltejs/kit';
import { listTagsWithCounts, renameTag, mergeTags, deleteTag } from '$db/repositories/tags.repo';

export const load: ServerLoad = async ({ locals, platform, url }) => {
  if (locals.auth.state.kind === 'unauthenticated') {
    throw redirect(302, '/login');
  }
  const user = locals.auth.state.user;
  const db = platform!.env.DB as D1Database;
  const tagFilter = url.searchParams.get('tag') ?? '';
  const tags = await listTagsWithCounts(db, user.id);
  const tagRow = tagFilter ? (tags.find((t) => t.name === tagFilter) ?? null) : null;
  return { tags, total: tags.length, tagFilter, tagRow };
};

export const actions: Actions = {
  rename: async ({ request, locals, platform }) => {
    if (locals.auth.state.kind === 'unauthenticated') return fail(401);
    const user = locals.auth.state.user;
    const db = platform!.env.DB as D1Database;
    const data = await request.formData();
    const id = Number(data.get('id'));
    const name = String(data.get('name') ?? '').trim();
    if (!Number.isFinite(id) || id <= 0) return fail(400, { error: 'invalid_id' });
    if (!name) return fail(400, { error: 'empty_name' });
    try {
      const r = await renameTag(db, user.id, id, name);
      if (!r) return fail(404, { error: 'not_found' });
      return { ok: true, merged: r.merged, newName: r.name };
    } catch (e) {
      return fail(400, { error: (e as Error).message });
    }
  },

  merge: async ({ request, locals, platform }) => {
    if (locals.auth.state.kind === 'unauthenticated') return fail(401);
    const user = locals.auth.state.user;
    const db = platform!.env.DB as D1Database;
    const data = await request.formData();
    const sourceId = Number(data.get('sourceId'));
    const targetName = String(data.get('targetName') ?? '').trim();
    if (!Number.isFinite(sourceId) || sourceId <= 0) return fail(400, { error: 'invalid_source' });
    if (!targetName) return fail(400, { error: 'empty_target' });
    const all = await listTagsWithCounts(db, user.id);
    const target = all.find((t) => t.name === targetName);
    let targetId: number;
    if (target) {
      targetId = target.id;
    } else {
      const { createTag } = await import('$db/repositories/tags.repo');
      const created = await createTag(db, user.id, targetName);
      targetId = created.id;
    }
    if (sourceId === targetId) return fail(400, { error: 'same_tag' });
    const moved = await mergeTags(db, user.id, sourceId, targetId);
    return { ok: true, moved };
  },

  delete: async ({ request, locals, platform }) => {
    if (locals.auth.state.kind === 'unauthenticated') return fail(401);
    const user = locals.auth.state.user;
    const db = platform!.env.DB as D1Database;
    const data = await request.formData();
    const id = Number(data.get('id'));
    if (!Number.isFinite(id) || id <= 0) return fail(400, { error: 'invalid_id' });
    const ok = await deleteTag(db, user.id, id);
    if (!ok) return fail(404, { error: 'not_found' });
    return { ok: true };
  }
};

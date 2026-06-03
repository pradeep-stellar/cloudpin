import { redirect, error, fail, type Actions, type ServerLoad } from '@sveltejs/kit';
import { getBundle, updateBundle, deleteBundle } from '$db/repositories/bundles.repo';
import { requireFormCsrf } from '$lib/server/auth/form-action';

export const load: ServerLoad = async ({ locals, platform, params }) => {
  if (locals.auth.state.kind === 'unauthenticated') {
    throw redirect(302, '/login');
  }
  const user = locals.auth.state.user;
  const id = Number(params.bundleId);
  if (!Number.isFinite(id) || id <= 0) throw error(404, 'Invalid bundle id');
  const bundle = await getBundle(platform!.env.DB as D1Database, user.id, id);
  if (!bundle) throw error(404, 'Bundle not found');
  return { bundle };
};

function parseTriState(v: string): 'yes' | 'no' | 'off' {
  if (v === 'yes' || v === 'no' || v === 'off') return v;
  return 'off';
}

export const actions: Actions = {
  update: async ({ request, locals, platform, params }) => {
    if (locals.auth.state.kind === 'unauthenticated') return fail(401);
    const csrf = await requireFormCsrf({ request, locals, platform });
    if (csrf) return csrf;
    const user = locals.auth.state.user;
    const id = Number(params.bundleId);
    if (!Number.isFinite(id) || id <= 0) return fail(400, { error: 'invalid_id' });
    const data = await request.formData();
    const name = String(data.get('name') ?? '').trim();
    if (!name) return fail(400, { error: 'name_required' });
    const ok = await updateBundle(platform!.env.DB as D1Database, user.id, id, {
      name,
      search: String(data.get('search') ?? ''),
      any_tags: String(data.get('any_tags') ?? ''),
      all_tags: String(data.get('all_tags') ?? ''),
      excluded_tags: String(data.get('excluded_tags') ?? ''),
      filter_unread: parseTriState(String(data.get('filter_unread') ?? 'off')),
      filter_shared: parseTriState(String(data.get('filter_shared') ?? 'off'))
    });
    if (!ok) return fail(404, { error: 'not_found' });
    return { ok: true };
  },

  delete: async ({ request, locals, platform, params }) => {
    if (locals.auth.state.kind === 'unauthenticated') return fail(401);
    const csrf = await requireFormCsrf({ request, locals, platform });
    if (csrf) return csrf;
    const user = locals.auth.state.user;
    const id = Number(params.bundleId);
    if (!Number.isFinite(id) || id <= 0) return fail(400, { error: 'invalid_id' });
    const ok = await deleteBundle(platform!.env.DB as D1Database, user.id, id);
    if (!ok) return fail(404, { error: 'not_found' });
    throw redirect(303, '/bundles');
  }
};

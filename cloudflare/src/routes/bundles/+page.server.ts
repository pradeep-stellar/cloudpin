import { fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import { deleteBundle, listBundles } from '$db/repositories/bundles.repo';
import { requireFormCsrf } from '$lib/server/auth/form-action';

export const load: ServerLoad = async ({ locals, platform }) => {
  if (locals.auth.state.kind === 'unauthenticated') {
    throw redirect(302, '/login');
  }
  const user = locals.auth.state.user;
  const bundles = await listBundles(platform!.env.DB as D1Database, user.id);
  return { bundles };
};

export const actions: Actions = {
  delete: async ({ request, locals, platform }) => {
    if (locals.auth.state.kind === 'unauthenticated') return fail(401);
    const csrf = await requireFormCsrf({ request, locals, platform });
    if (csrf) return csrf;
    const user = locals.auth.state.user;
    const data = await request.formData();
    const id = Number(data.get('id'));
    if (!Number.isFinite(id) || id <= 0) return fail(400, { error: 'invalid_id' });
    const ok = await deleteBundle(platform!.env.DB as D1Database, user.id, id);
    if (!ok) return fail(404, { error: 'not_found' });
    return { ok: true };
  }
};

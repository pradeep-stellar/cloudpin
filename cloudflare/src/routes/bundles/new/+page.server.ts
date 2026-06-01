import { redirect, fail, type Actions, type ServerLoad } from '@sveltejs/kit';
import { createBundle } from '$db/repositories/bundles.repo';

export const load: ServerLoad = async ({ locals }) => {
  if (locals.auth.state.kind === 'unauthenticated') {
    throw redirect(302, '/login');
  }
  return {};
};

export const actions: Actions = {
  default: async ({ request, locals, platform }) => {
    if (locals.auth.state.kind === 'unauthenticated') return fail(401);
    const user = locals.auth.state.user;
    const data = await request.formData();
    const name = String(data.get('name') ?? '').trim();
    if (!name) return fail(400, { error: 'name_required' });
    const id = await createBundle(platform!.env.DB as D1Database, user.id, {
      name,
      search: String(data.get('search') ?? ''),
      any_tags: String(data.get('any_tags') ?? ''),
      all_tags: String(data.get('all_tags') ?? ''),
      excluded_tags: String(data.get('excluded_tags') ?? ''),
      filter_unread: parseTriState(String(data.get('filter_unread') ?? 'off')),
      filter_shared: parseTriState(String(data.get('filter_shared') ?? 'off'))
    });
    throw redirect(303, `/bundles/${id}/edit`);
  }
};

function parseTriState(v: string): 'yes' | 'no' | 'off' {
  if (v === 'yes' || v === 'no' || v === 'off') return v;
  return 'off';
}

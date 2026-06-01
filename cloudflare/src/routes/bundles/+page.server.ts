import { redirect, type ServerLoad } from '@sveltejs/kit';
import { listBundles } from '$db/repositories/bundles.repo';

export const load: ServerLoad = async ({ locals, platform }) => {
  if (locals.auth.state.kind === 'unauthenticated') {
    throw redirect(302, '/login');
  }
  const user = locals.auth.state.user;
  const bundles = await listBundles(platform!.env.DB as D1Database, user.id);
  return { bundles };
};

import { redirect, type ServerLoad } from '@sveltejs/kit';
import { getUserProfile } from '$db/repositories/tags.repo';
import { loadSessionUser } from '$db/repositories/tokens.repo';

export const load: ServerLoad = async ({ locals, platform }) => {
  if (locals.auth.state.kind === 'unauthenticated') {
    throw redirect(302, '/login');
  }
  const user = locals.auth.state.user;
  const [profile, full] = await Promise.all([
    getUserProfile(platform!.env.DB as D1Database, user.id),
    loadSessionUser(platform!.env.DB as D1Database, user.id)
  ]);
  return {
    profile,
    user: full
  };
};

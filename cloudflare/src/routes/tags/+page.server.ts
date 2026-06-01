import { redirect, type ServerLoad } from '@sveltejs/kit';
import { listTags } from '$db/repositories/tags.repo';

export const load: ServerLoad = async ({ locals, platform }) => {
  if (locals.auth.state.kind === 'unauthenticated') {
    throw redirect(302, '/login');
  }
  const user = locals.auth.state.user;
  const { items, total } = await listTags(platform!.env.DB as D1Database, user.id, {
    limit: 200,
    offset: 0
  });
  return { tags: items, total };
};

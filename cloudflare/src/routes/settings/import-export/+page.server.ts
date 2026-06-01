import { redirect, type ServerLoad } from '@sveltejs/kit';
export const load: ServerLoad = async ({ locals }) => {
  if (locals.auth.state.kind === 'unauthenticated') {
    throw redirect(302, '/login');
  }
  return {};
};

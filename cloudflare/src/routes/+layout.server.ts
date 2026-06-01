import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
  return {
    appName: 'cloudpin',
    user: locals.auth.state.kind === 'unauthenticated' ? null : locals.auth.state.user,
    path: url.pathname
  };
};

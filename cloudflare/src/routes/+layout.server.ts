import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
  return {
    appName: 'cloudpin',
    user: locals.auth.state.kind === 'unauthenticated' ? null : locals.auth.state.user,
    csrfToken: locals.auth.csrfToken ?? null,
    path: url.pathname
  };
};

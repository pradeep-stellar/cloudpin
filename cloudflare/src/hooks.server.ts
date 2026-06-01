import type { Handle } from '@sveltejs/kit';
import { resolveAuth, checkCsrf, defaultDevIdentity } from '$lib/server/auth/middleware';

export const handle: Handle = async ({ event, resolve }) => {
  const env = (event.platform?.env ?? {}) as unknown as Parameters<typeof resolveAuth>[0]['env'];
  event.locals.auth = await resolveAuth({
    request: event.request,
    env,
    allowDevBypass: import.meta.env.DEV,
    devIdentity: defaultDevIdentity()
  });

  if (event.locals.auth.isMutation && event.locals.auth.state.kind === 'browser_session') {
    const csrf = await checkCsrf({
      env,
      state: event.locals.auth.state,
      request: event.request,
      origin: event.locals.auth.origin
    });
    if (!csrf.ok) {
      return new Response('csrf_failed', { status: 403 });
    }
  }

  return resolve(event);
};

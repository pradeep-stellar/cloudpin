import type { Handle } from '@sveltejs/kit';
import { resolveAuth, checkCsrf, defaultDevIdentity } from '$lib/server/auth/middleware';

// End-to-end tests need to run against a built bundle served by `wrangler
// dev` or `vite preview` without standing up a full Cloudflare Access tunnel.
// The Playwright webServer sets CLOUDPIN_E2E_BYPASS_AUTH=1 in the wrangler
// process environment. We read it from the worker env binding first, then
// fall back to globalThis.process.env for `vite preview` and any other
// Node-style runner. The bypass is gated on this explicit opt-in — it never
// engages in normal dev or production.
export function readE2EBypass(env: { CLOUDPIN_E2E_BYPASS_AUTH?: string }): boolean {
  if (env.CLOUDPIN_E2E_BYPASS_AUTH === '1') return true;
  try {
    return globalThis.process?.env?.CLOUDPIN_E2E_BYPASS_AUTH === '1';
  } catch {
    return false;
  }
}

export const handle: Handle = async ({ event, resolve }) => {
  const env = (event.platform?.env ?? {}) as unknown as Parameters<typeof resolveAuth>[0]['env'];
  const e2eBypass = readE2EBypass(env);
  const allowDevBypass = import.meta.env.DEV || e2eBypass;
  event.locals.auth = await resolveAuth({
    request: event.request,
    env,
    allowDevBypass,
    devIdentity: defaultDevIdentity()
  });

  // CSRF is enforced for browser sessions on mutations, with one explicit
  // exception: the e2e bypass. Playwright runs against `wrangler dev` with
  // CLOUDPIN_E2E_BYPASS_AUTH=1; in that mode the dev user is fixed, the
  // server is local, and the request Origin always matches the dev origin.
  // Skipping CSRF here is safe and lets specs exercise the real form/action
  // path. Production must never set this flag.
  if (
    !e2eBypass &&
    event.locals.auth.isMutation &&
    event.locals.auth.state.kind === 'browser_session'
  ) {
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

import { fail, type ActionFailure, type RequestEvent } from '@sveltejs/kit';
import { checkCsrf, type AuthEnv } from './middleware';
import { readE2EBypass } from './e2e-bypass';

type FormCsrfEvent = Pick<RequestEvent, 'locals' | 'platform' | 'request'>;

export type CsrfActionFailure = ActionFailure<{ error: 'csrf_failed' }>;

export async function requireFormCsrf(event: FormCsrfEvent): Promise<CsrfActionFailure | null> {
  if (event.locals.auth.state.kind !== 'browser_session') return null;
  if (!event.locals.auth.isMutation) return null;

  const env = event.platform?.env;
  if (env && readE2EBypass(env)) return null;
  if (!env) return fail(403, { error: 'csrf_failed' });

  const csrf = await checkCsrf({
    env: env as AuthEnv,
    state: event.locals.auth.state,
    request: event.request,
    origin: event.locals.auth.origin
  });
  if (!csrf.ok) return fail(403, { error: 'csrf_failed' });
  return null;
}

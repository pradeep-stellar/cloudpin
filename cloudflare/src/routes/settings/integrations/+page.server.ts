import { redirect, fail, type Actions, type ServerLoad } from '@sveltejs/kit';
import { listTokensForUser, createToken, revokeToken } from '$db/repositories/tokens.repo';
import { getFeedToken, rotateFeedToken, deleteFeedToken } from '$db/repositories/feed-tokens.repo';
import { env } from '$env/dynamic/private';
import { requireFormCsrf } from '$lib/server/auth/form-action';

export const load: ServerLoad = async ({ locals, platform, url }) => {
  if (locals.auth.state.kind === 'unauthenticated') {
    throw redirect(302, '/login');
  }
  const user = locals.auth.state.user;
  const db = platform!.env.DB as D1Database;
  const [tokens, feed] = await Promise.all([
    listTokensForUser(db, user.id),
    getFeedToken(db, user.id)
  ]);
  return {
    tokens,
    feedToken: feed,
    baseUrl: env.PUBLIC_BASE_URL || url.origin
  };
};

export const actions: Actions = {
  createToken: async ({ request, locals, platform }) => {
    if (locals.auth.state.kind === 'unauthenticated') return fail(401);
    const csrf = await requireFormCsrf({ request, locals, platform });
    if (csrf) return csrf;
    const user = locals.auth.state.user;
    const data = await request.formData();
    const name = String(data.get('name') ?? '').trim() || 'token';
    const result = await createToken(platform!.env.DB as D1Database, {
      userId: user.id,
      name
    });
    return { ok: true, action: 'createToken', rawToken: result.rawToken, tokenName: name };
  },

  revokeToken: async ({ request, locals, platform }) => {
    if (locals.auth.state.kind === 'unauthenticated') return fail(401);
    const csrf = await requireFormCsrf({ request, locals, platform });
    if (csrf) return csrf;
    const user = locals.auth.state.user;
    const data = await request.formData();
    const id = Number(data.get('id'));
    if (!Number.isFinite(id) || id <= 0) return fail(400, { error: 'invalid_id' });
    const ok = await revokeToken(platform!.env.DB as D1Database, user.id, id);
    if (!ok) return fail(404, { error: 'not_found' });
    return { ok: true, action: 'revokeToken' };
  },

  rotateFeed: async ({ request, locals, platform }) => {
    if (locals.auth.state.kind === 'unauthenticated') return fail(401);
    const csrf = await requireFormCsrf({ request, locals, platform });
    if (csrf) return csrf;
    const user = locals.auth.state.user;
    const r = await rotateFeedToken(platform!.env.DB as D1Database, user.id);
    return { ok: true, action: 'rotateFeed', rawToken: r.rawToken };
  },

  deleteFeed: async ({ request, locals, platform }) => {
    if (locals.auth.state.kind === 'unauthenticated') return fail(401);
    const csrf = await requireFormCsrf({ request, locals, platform });
    if (csrf) return csrf;
    const user = locals.auth.state.user;
    await deleteFeedToken(platform!.env.DB as D1Database, user.id);
    return { ok: true, action: 'deleteFeed' };
  }
};

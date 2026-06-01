import { error, type RequestHandler } from '@sveltejs/kit';
import { getUserProfile } from '$db/repositories/profiles.repo';

export const GET: RequestHandler = async ({ url, platform }) => {
  const token = url.searchParams.get('token') ?? '';
  if (!token) throw error(401, 'missing_token');
  const { resolveFeedToken } = await import('$db/repositories/feed-tokens.repo');
  const db = platform!.env.DB as D1Database;
  const user = await resolveFeedToken(db, token);
  if (!user) throw error(403, 'invalid_token');
  const profile = await getUserProfile(db, user.id);
  const css = profile?.customCss ?? '';
  if (!css) {
    return new Response('', {
      status: 200,
      headers: { 'Content-Type': 'text/css; charset=utf-8' }
    });
  }
  return new Response(css, {
    status: 200,
    headers: {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': 'no-cache'
    }
  });
};

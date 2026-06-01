import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async ({ url }) => {
  const baseUrl = env.PUBLIC_BASE_URL || url.origin;
  const body = JSON.stringify(
    {
      name: 'cloudpin',
      short_name: 'cloudpin',
      description: 'Bookmark manager on Cloudflare',
      start_url: '/bookmarks',
      display: 'standalone',
      background_color: '#fafafa',
      theme_color: '#2563eb',
      icons: [
        {
          src: `${baseUrl}/icons/icon-192.png`,
          sizes: '192x192',
          type: 'image/png'
        },
        {
          src: `${baseUrl}/icons/icon-512.png`,
          sizes: '512x512',
          type: 'image/png'
        }
      ]
    },
    null,
    2
  );
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/manifest+json' }
  });
};

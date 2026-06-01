import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { resolveFeedToken } from '$db/repositories/feed-tokens.repo';
import { listBookmarks } from '$db/repositories/bookmarks.repo';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildRss(title: string, link: string, description: string, items: RssItem[]): string {
  const lastBuild = items[0]?.pubDate ?? new Date().toUTCString();
  const body = items
    .map(
      (i) => `    <item>
      <title>${escapeXml(i.title)}</title>
      <link>${escapeXml(i.link)}</link>
      <guid isPermaLink="false">${escapeXml(i.guid)}</guid>
      <pubDate>${i.pubDate}</pubDate>
      <description>${escapeXml(i.description)}</description>${i.tags.map((t) => `\n      <category>${escapeXml(t)}</category>`).join('')}
    </item>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(link)}</link>
    <description>${escapeXml(description)}</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
${body}
  </channel>
</rss>`;
}

type RssItem = {
  title: string;
  link: string;
  guid: string;
  pubDate: string;
  description: string;
  tags: string[];
};

export const GET: RequestHandler = async ({ url, platform, params }) => {
  const token = url.searchParams.get('token') ?? '';
  if (!token) throw error(401, 'missing_token');
  const db = platform!.env.DB as D1Database;
  const user = await resolveFeedToken(db, token);
  if (!user) throw error(403, 'invalid_token');
  const sharedOnly = params.kind === 'shared';
  const archivedFilter = sharedOnly ? 'false' : 'all';
  const { items } = await listBookmarks(db, {
    ownerId: user.id,
    archivedFilter,
    limit: 50,
    offset: 0
  });
  const filtered = sharedOnly ? items.filter((b) => b.shared) : items;
  const baseUrl = url.origin;
  const rssItems: RssItem[] = filtered.map((b) => ({
    title: b.title || b.url,
    link: b.url,
    guid: `${baseUrl}/bookmarks/${b.id}`,
    pubDate: new Date(b.date_added).toUTCString(),
    description: [b.description, b.notes].filter(Boolean).join('\n\n'),
    tags: b.tag_names
  }));
  const body = buildRss(
    `${user.username} bookmarks on cloudpin`,
    baseUrl,
    sharedOnly ? 'Public shared bookmarks' : 'All bookmarks',
    rssItems
  );
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' }
  });
};

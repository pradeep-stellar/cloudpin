import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async ({ url }) => {
  const baseUrl = env.PUBLIC_BASE_URL || url.origin;
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>cloudpin</ShortName>
  <Description>Search cloudpin bookmarks</Description>
  <Url type="text/html" template="${baseUrl}/bookmarks?q={searchTerms}"/>
  <Image>${baseUrl}/icons/icon-192.png</Image>
  <InputEncoding>UTF-8</InputEncoding>
</OpenSearchDescription>`;
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/opensearchdescription+xml; charset=utf-8' }
  });
};

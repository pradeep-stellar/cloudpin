export function cspForContentType(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.startsWith('image/')) return "default-src 'none'";
  if (ct === 'application/pdf') return "default-src 'none'; object-src 'self';";
  if (ct === 'text/html') return 'sandbox allow-scripts';
  if (ct.startsWith('video/')) return "default-src 'none'; media-src 'self';";
  if (ct.startsWith('audio/')) return "default-src 'none'; media-src 'self';";
  if (ct === 'application/json' || ct === 'text/plain' || ct === 'text/css') {
    return "default-src 'none'";
  }
  return "default-src 'none'";
}

export type AssetDisposition = 'inline' | 'attachment';

export function dispositionFor(download: boolean): AssetDisposition {
  return download ? 'attachment' : 'inline';
}

export function contentDispositionHeader(disposition: AssetDisposition, filename: string): string {
  const safe = filename.replace(/[\r\n"]/g, '_') || 'asset';
  return `${disposition}; filename="${safe}"`;
}

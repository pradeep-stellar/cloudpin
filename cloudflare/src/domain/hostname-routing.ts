// Hostname-based path allowlist for separating the private app from
// the public share host. When the public hostname is configured
// (PUBLIC_HOSTNAME), only the listed paths are reachable on that host;
// anything else returns 404. When PUBLIC_HOSTNAME is empty, no
// hostname gating is applied and the request is always treated as the
// private app.
export const PUBLIC_ALLOWED_PATHS = ['/public', '/health'] as const;
export type PublicAllowedPath = (typeof PUBLIC_ALLOWED_PATHS)[number];

export type HostnameDecision =
  | { kind: 'public'; allowed: true; matchedPrefix: PublicAllowedPath }
  | { kind: 'public'; allowed: false; pathname: string }
  | { kind: 'private' };

// Strip the default port so 127.0.0.1:8788 matches a configured
// 127.0.0.1. Cloudflare sets the request URL hostname without the
// port in production, but wrangler dev includes it.
function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function isPublicHost(requestUrl: string, publicHostname: string): boolean {
  if (!publicHostname) return false;
  return hostOf(requestUrl) === publicHostname.toLowerCase();
}

function matchesPublicPath(pathname: string): PublicAllowedPath | null {
  for (const prefix of PUBLIC_ALLOWED_PATHS) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return prefix;
    }
  }
  return null;
}

export function decideHostnameRouting(
  requestUrl: string,
  publicHostname: string | undefined
): HostnameDecision {
  if (!publicHostname) return { kind: 'private' };
  if (!isPublicHost(requestUrl, publicHostname)) return { kind: 'private' };
  const path = (() => {
    try {
      return new URL(requestUrl).pathname;
    } catch {
      return '';
    }
  })();
  const matched = matchesPublicPath(path);
  if (matched) return { kind: 'public', allowed: true, matchedPrefix: matched };
  return { kind: 'public', allowed: false, pathname: path };
}

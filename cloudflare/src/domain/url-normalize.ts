const DEFAULT_TRACKING_PREFIXES = ['utm_'] as const;
const DEFAULT_TRACKING_EXACT = new Set([
  'fbclid',
  'gclid',
  'gclsrc',
  'mc_cid',
  'mc_eid',
  'igshid',
  'yclid',
  'ref',
  'ref_src',
  'ref_url',
  'source',
  'src',
  'spm'
]);

export type NormalizeOptions = {
  trackingParamPrefixes?: readonly string[];
  trackingParamExact?: ReadonlySet<string>;
  stripFragment?: boolean;
  stripDefaultPort?: boolean;
  sortQuery?: boolean;
  dropRootSlash?: boolean;
  lowercaseHost?: boolean;
  addMissingScheme?: boolean;
};

const DEFAULTS: Required<Omit<NormalizeOptions, 'trackingParamPrefixes' | 'trackingParamExact'>> = {
  stripFragment: true,
  stripDefaultPort: true,
  sortQuery: true,
  dropRootSlash: true,
  lowercaseHost: true,
  addMissingScheme: true
};

function isTrackingParam(name: string, prefixes: readonly string[], exact: ReadonlySet<string>) {
  if (exact.has(name)) return true;
  for (const p of prefixes) {
    if (name.startsWith(p)) return true;
  }
  return false;
}

const UNRESERVED = /[^A-Za-z0-9\-._~!$&'()*+,;=:@%/?]/g;

function percentEncodePath(path: string): string {
  return path.replace(
    UNRESERVED,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')
  );
}

export class InvalidUrlError extends Error {
  constructor(input: string) {
    super(`Invalid URL: ${input}`);
    this.name = 'InvalidUrlError';
  }
}

export function normalizeUrl(input: string, options: NormalizeOptions = {}): string {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new InvalidUrlError(String(input));
  }

  const opts = { ...DEFAULTS, ...options };
  const prefixes = options.trackingParamPrefixes ?? DEFAULT_TRACKING_PREFIXES;
  const exact = options.trackingParamExact ?? DEFAULT_TRACKING_EXACT;

  let raw = input.trim();
  if (opts.addMissingScheme && !/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    raw = 'https://' + raw;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new InvalidUrlError(input);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new InvalidUrlError(input);
  }

  let host = url.hostname;
  let port = url.port;
  if (opts.lowercaseHost) host = host.toLowerCase();
  if (opts.stripDefaultPort) {
    if (
      (url.protocol === 'https:' && port === '443') ||
      (url.protocol === 'http:' && port === '80')
    ) {
      port = '';
    }
  }

  let path = url.pathname;
  if (opts.dropRootSlash && (path === '/' || path === '')) {
    path = '';
  } else {
    path = percentEncodePath(path);
  }

  const params = url.searchParams;
  const kept: Array<[string, string]> = [];
  const seen = new Set<string>();
  for (const [k, v] of params) {
    if (isTrackingParam(k.toLowerCase(), prefixes, exact)) continue;
    if (opts.sortQuery) {
      const compound = k + '\u0000' + v;
      if (seen.has(compound)) continue;
      seen.add(compound);
    }
    kept.push([k, v]);
  }
  if (opts.sortQuery) {
    kept.sort(([a, av], [b, bv]) => {
      if (a < b) return -1;
      if (a > b) return 1;
      if (av < bv) return -1;
      if (av > bv) return 1;
      return 0;
    });
  }
  const search = new URLSearchParams();
  for (const [k, v] of kept) search.append(k, v);
  const qs = search.toString();

  const scheme = url.protocol.slice(0, -1).toLowerCase();
  let out = `${scheme}://${host}${port ? `:${port}` : ''}${path}${qs ? `?${qs}` : ''}`;
  if (!opts.stripFragment && url.hash) {
    out += url.hash;
  }
  return out;
}

export function displayUrl(normalized: string): string {
  try {
    const u = new URL(normalized);
    return (
      u.host +
      (u.pathname === '' || u.pathname === '/' ? '' : u.pathname) +
      (u.search || '') +
      (u.hash || '')
    );
  } catch {
    return normalized;
  }
}

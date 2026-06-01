import { fromBase64Url, toBase64Url, bytesToUtf8, safeEqualString } from './crypto';
import type { AccessIdentity } from './types';

const CERTS_PATH = '/cdn-cgi/access/certs';

export class AccessJwtError extends Error {
  constructor(
    public reason:
      | 'missing_header'
      | 'malformed_jwt'
      | 'unknown_kid'
      | 'invalid_signature'
      | 'invalid_audience'
      | 'invalid_issuer'
      | 'expired'
      | 'missing_claim',
    message: string
  ) {
    super(message);
    this.name = 'AccessJwtError';
  }
}

type CertCacheEntry = {
  fetchedAt: number;
  keys: Map<string, JsonWebKey>;
};

export type CertFetcher = (url: string) => Promise<{ keys: JsonWebKey[] }>;

const defaultCertFetcher: CertFetcher = async (url) => {
  const res = await fetch(url, { cf: { cacheTtl: 300, cacheEverything: false } });
  if (!res.ok) {
    throw new AccessJwtError('unknown_kid', `Failed to fetch Access certs: ${res.status}`);
  }
  return (await res.json()) as { keys: JsonWebKey[] };
};

export type AccessJwtValidatorOptions = {
  teamDomain?: string;
  audience?: string;
  clockSkewSeconds?: number;
  certTtlMs?: number;
  fetcher?: CertFetcher;
  devIdentity?: AccessIdentity;
};

export class AccessJwtValidator {
  private cache: CertCacheEntry | null = null;
  private readonly teamDomain: string | undefined;
  private readonly audience: string | undefined;
  private readonly clockSkewSeconds: number;
  private readonly certTtlMs: number;
  private readonly fetcher: CertFetcher;
  private readonly devIdentity: AccessIdentity | undefined;

  constructor(opts: AccessJwtValidatorOptions = {}) {
    this.teamDomain = opts.teamDomain;
    this.audience = opts.audience;
    this.clockSkewSeconds = opts.clockSkewSeconds ?? 30;
    this.certTtlMs = opts.certTtlMs ?? 60 * 60 * 1000;
    this.fetcher = opts.fetcher ?? defaultCertFetcher;
    this.devIdentity = opts.devIdentity;
  }

  isDevMode(): boolean {
    return Boolean(this.devIdentity && (!this.teamDomain || !this.audience));
  }

  async validate(jwt: string | undefined | null): Promise<AccessIdentity> {
    if (this.isDevMode() && this.devIdentity) {
      if (!jwt) return this.devIdentity;
      try {
        return await this.verifyProduction(jwt);
      } catch {
        return this.devIdentity;
      }
    }
    if (!jwt) throw new AccessJwtError('missing_header', 'No Access JWT provided');
    return this.verifyProduction(jwt);
  }

  private async verifyProduction(jwt: string): Promise<AccessIdentity> {
    const parts = jwt.split('.');
    if (parts.length !== 3) {
      throw new AccessJwtError('malformed_jwt', 'JWT must have 3 parts');
    }
    const [headerB64, payloadB64, sigB64] = parts as [string, string, string];
    let header: { alg?: string; kid?: string; typ?: string };
    let payload: {
      iss?: string;
      aud?: string | string[];
      sub?: string;
      email?: string;
      exp?: number;
      iat?: number;
    };
    try {
      header = JSON.parse(bytesToUtf8(fromBase64Url(headerB64)));
      payload = JSON.parse(bytesToUtf8(fromBase64Url(payloadB64)));
    } catch {
      throw new AccessJwtError('malformed_jwt', 'JWT is not valid base64url JSON');
    }
    if (header.alg !== 'RS256') {
      throw new AccessJwtError('malformed_jwt', `Unsupported alg: ${String(header.alg)}`);
    }
    if (!header.kid) {
      throw new AccessJwtError('malformed_jwt', 'JWT header missing kid');
    }

    const keys = await this.getKeys();
    const jwk = keys.get(header.kid);
    if (!jwk) {
      throw new AccessJwtError('unknown_kid', `No key for kid ${header.kid}`);
    }

    const publicKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const signedData = utf8Bytes(`${headerB64}.${payloadB64}`);
    const signature = fromBase64Url(sigB64);
    const ok = await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      publicKey,
      toBufferSource(signature),
      toBufferSource(signedData)
    );
    if (!ok) {
      throw new AccessJwtError('invalid_signature', 'JWT signature did not verify');
    }

    if (!payload.sub) throw new AccessJwtError('missing_claim', 'sub missing');
    if (!payload.email) throw new AccessJwtError('missing_claim', 'email missing');
    if (typeof payload.exp !== 'number') {
      throw new AccessJwtError('missing_claim', 'exp missing');
    }
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp + this.clockSkewSeconds < now) {
      throw new AccessJwtError('expired', 'Access JWT has expired');
    }
    if (this.audience) {
      const auds = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
      if (!auds.some((a) => safeEqualString(a, this.audience ?? ''))) {
        throw new AccessJwtError('invalid_audience', 'aud does not match expected AUD');
      }
    }
    if (this.teamDomain && payload.iss) {
      const expectedIss = `https://${this.teamDomain}`;
      if (!safeEqualString(payload.iss, expectedIss)) {
        throw new AccessJwtError('invalid_issuer', `iss must equal ${expectedIss}`);
      }
    }

    const audience = Array.isArray(payload.aud) ? (payload.aud[0] ?? '') : (payload.aud ?? '');

    return {
      email: payload.email,
      subject: payload.sub,
      issuer: payload.iss ?? '',
      audience,
      expiresAt: payload.exp
    };
  }

  private async getKeys(): Promise<Map<string, JsonWebKey>> {
    const now = Date.now();
    if (this.cache && now - this.cache.fetchedAt < this.certTtlMs) {
      return this.cache.keys;
    }
    if (!this.teamDomain) {
      throw new AccessJwtError('unknown_kid', 'No team domain configured');
    }
    const url = `https://${this.teamDomain}${CERTS_PATH}`;
    const fetched = await this.fetcher(url);
    const map = new Map<string, JsonWebKey>();
    for (const k of fetched.keys) {
      const kid = (k as { kid?: unknown }).kid;
      if (typeof kid === 'string') map.set(kid, k);
    }
    this.cache = { fetchedAt: now, keys: map };
    return map;
  }

  clearCache(): void {
    this.cache = null;
  }
}

function utf8Bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function toBufferSource(input: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(input.length);
  new Uint8Array(ab).set(input);
  return ab;
}

export function isAccessJwtError(err: unknown): err is AccessJwtError {
  return err instanceof AccessJwtError;
}

export const _testing = { toBase64Url };

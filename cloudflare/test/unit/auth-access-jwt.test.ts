import { describe, it, expect } from 'vitest';
import { AccessJwtValidator, AccessJwtError } from '../../src/lib/server/auth/access-jwt';
import type { AccessIdentity } from '../../src/lib/server/auth/types';

const KID = 'test-kid-1';
const TEAM = 'myteam.cloudflareaccess.com';
const ISS = `https://${TEAM}`;
const AUD = 'a1b2c3d4e5f6abcdef';

type KeyPair = { privateKey: CryptoKey; publicKey: CryptoKey; jwk: JsonWebKey };

async function generateRsaKeypair(): Promise<KeyPair> {
  const keypair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256'
    },
    true,
    ['sign', 'verify']
  );
  const jwk = await crypto.subtle.exportKey('jwk', keypair.publicKey);
  const enriched = { ...jwk, kid: KID, alg: 'RS256', use: 'sig' } as JsonWebKey;
  return { privateKey: keypair.privateKey, publicKey: keypair.publicKey, jwk: enriched };
}

function b64Url(input: Uint8Array | ArrayBuffer): string {
  const view = input instanceof Uint8Array ? input : new Uint8Array(input);
  let bin = '';
  for (let i = 0; i < view.length; i++) bin += String.fromCharCode(view[i] ?? 0);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signJwt(
  privateKey: CryptoKey,
  header: Record<string, unknown>,
  payload: Record<string, unknown>
): Promise<string> {
  const enc = new TextEncoder();
  const headerB64 = b64Url(enc.encode(JSON.stringify(header)));
  const payloadB64 = b64Url(enc.encode(JSON.stringify(payload)));
  const signingInput = new Uint8Array(enc.encode(`${headerB64}.${payloadB64}`));
  const sig = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, privateKey, signingInput);
  return `${headerB64}.${payloadB64}.${b64Url(sig)}`;
}

async function makeValidator(jwk: JsonWebKey) {
  return new AccessJwtValidator({
    teamDomain: TEAM,
    audience: AUD,
    fetcher: async () => ({ keys: [jwk] })
  });
}

async function makeIdentity(
  overrides: Partial<{
    email: string;
    subject: string;
    audience: string;
    issuer: string;
    expiresAt: number;
  }> = {}
): Promise<AccessIdentity> {
  return {
    email: 'user@example.com',
    subject: 'sub-123',
    issuer: ISS,
    audience: AUD,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    ...overrides
  };
}

describe('AccessJwtValidator', () => {
  it('verifies a valid JWT', async () => {
    const kp = await generateRsaKeypair();
    const validator = await makeValidator(kp.jwk);
    const id = await makeIdentity();
    const jwt = await signJwt(
      kp.privateKey,
      { alg: 'RS256', kid: KID, typ: 'JWT' },
      {
        iss: id.issuer,
        aud: id.audience,
        sub: id.subject,
        email: id.email,
        exp: id.expiresAt,
        iat: Math.floor(Date.now() / 1000)
      }
    );
    const out = await validator.validate(jwt);
    expect(out.email).toBe('user@example.com');
    expect(out.subject).toBe('sub-123');
    expect(out.audience).toBe(AUD);
  });

  it('rejects a JWT signed with a different key', async () => {
    const real = await generateRsaKeypair();
    const attacker = await generateRsaKeypair();
    const validator = await makeValidator(real.jwk);
    const id = await makeIdentity();
    const jwt = await signJwt(
      attacker.privateKey,
      { alg: 'RS256', kid: KID, typ: 'JWT' },
      {
        iss: id.issuer,
        aud: id.audience,
        sub: id.subject,
        email: id.email,
        exp: id.expiresAt,
        iat: Math.floor(Date.now() / 1000)
      }
    );
    await expect(validator.validate(jwt)).rejects.toThrow(AccessJwtError);
  });

  it('rejects an expired JWT', async () => {
    const kp = await generateRsaKeypair();
    const validator = await makeValidator(kp.jwk);
    const id = await makeIdentity({ expiresAt: Math.floor(Date.now() / 1000) - 100 });
    const jwt = await signJwt(
      kp.privateKey,
      { alg: 'RS256', kid: KID, typ: 'JWT' },
      {
        iss: id.issuer,
        aud: id.audience,
        sub: id.subject,
        email: id.email,
        exp: id.expiresAt,
        iat: id.expiresAt - 3600
      }
    );
    await expect(validator.validate(jwt)).rejects.toThrow(AccessJwtError);
  });

  it('rejects when audience does not match', async () => {
    const kp = await generateRsaKeypair();
    const validator = await makeValidator(kp.jwk);
    const id = await makeIdentity({ audience: 'different-aud' });
    const jwt = await signJwt(
      kp.privateKey,
      { alg: 'RS256', kid: KID, typ: 'JWT' },
      {
        iss: id.issuer,
        aud: id.audience,
        sub: id.subject,
        email: id.email,
        exp: id.expiresAt,
        iat: Math.floor(Date.now() / 1000)
      }
    );
    await expect(validator.validate(jwt)).rejects.toThrow(AccessJwtError);
  });

  it('rejects when issuer does not match team domain', async () => {
    const kp = await generateRsaKeypair();
    const validator = await makeValidator(kp.jwk);
    const id = await makeIdentity({ issuer: 'https://evil.example.com' });
    const jwt = await signJwt(
      kp.privateKey,
      { alg: 'RS256', kid: KID, typ: 'JWT' },
      {
        iss: id.issuer,
        aud: id.audience,
        sub: id.subject,
        email: id.email,
        exp: id.expiresAt,
        iat: Math.floor(Date.now() / 1000)
      }
    );
    await expect(validator.validate(jwt)).rejects.toThrow(AccessJwtError);
  });

  it('rejects an unknown kid', async () => {
    const kp = await generateRsaKeypair();
    const validator = await makeValidator(kp.jwk);
    const id = await makeIdentity();
    const jwt = await signJwt(
      kp.privateKey,
      { alg: 'RS256', kid: 'other-kid', typ: 'JWT' },
      {
        iss: id.issuer,
        aud: id.audience,
        sub: id.subject,
        email: id.email,
        exp: id.expiresAt,
        iat: Math.floor(Date.now() / 1000)
      }
    );
    await expect(validator.validate(jwt)).rejects.toThrow(AccessJwtError);
  });

  it('rejects malformed JWTs', async () => {
    const kp = await generateRsaKeypair();
    const validator = await makeValidator(kp.jwk);
    await expect(validator.validate('not.a.jwt.at.all')).rejects.toThrow(AccessJwtError);
    await expect(validator.validate('two.parts')).rejects.toThrow(AccessJwtError);
  });

  it('caches certs within ttl', async () => {
    const kp = await generateRsaKeypair();
    let calls = 0;
    const validator = new AccessJwtValidator({
      teamDomain: TEAM,
      audience: AUD,
      fetcher: async () => {
        calls++;
        return { keys: [kp.jwk] };
      },
      certTtlMs: 60_000
    });
    const id = await makeIdentity();
    const jwt = await signJwt(
      kp.privateKey,
      { alg: 'RS256', kid: KID, typ: 'JWT' },
      {
        iss: id.issuer,
        aud: id.audience,
        sub: id.subject,
        email: id.email,
        exp: id.expiresAt,
        iat: Math.floor(Date.now() / 1000)
      }
    );
    await validator.validate(jwt);
    await validator.validate(jwt);
    await validator.validate(jwt);
    expect(calls).toBe(1);
  });

  it('in dev mode returns the dev identity when no JWT provided', async () => {
    const validator = new AccessJwtValidator({
      devIdentity: {
        email: 'dev@local',
        subject: 'dev-sub',
        issuer: 'dev',
        audience: 'dev-aud',
        expiresAt: 0
      }
    });
    const out = await validator.validate(undefined);
    expect(out.email).toBe('dev@local');
  });

  it('in dev mode falls back to dev identity when JWT is bad', async () => {
    const validator = new AccessJwtValidator({
      devIdentity: {
        email: 'dev@local',
        subject: 'dev-sub',
        issuer: 'dev',
        audience: 'dev-aud',
        expiresAt: 0
      }
    });
    const out = await validator.validate('garbage.jwt.string');
    expect(out.email).toBe('dev@local');
  });
});

import { sha256, constantTimeEqual, randomBase64Url } from './crypto';

const TOKEN_PREFIX_LEN = 6;
const TOKEN_BYTES = 32;
const PEPPER_SEPARATOR = '|';

export type GeneratedApiToken = {
  rawToken: string;
  tokenHash: string;
  tokenPrefix: string;
};

export function generateApiTokenRaw(): string {
  return randomBase64Url(TOKEN_BYTES);
}

export async function hashApiToken(rawToken: string, pepper: string = ''): Promise<string> {
  const input = pepper ? rawToken + PEPPER_SEPARATOR + pepper : rawToken;
  const bytes = await sha256(input);
  return bytesToHex(bytes);
}

export function tokenPrefix(rawToken: string): string {
  return rawToken.slice(0, TOKEN_PREFIX_LEN);
}

export async function generateApiToken(pepper: string = ''): Promise<GeneratedApiToken> {
  const rawToken = generateApiTokenRaw();
  return {
    rawToken,
    tokenHash: await hashApiToken(rawToken, pepper),
    tokenPrefix: tokenPrefix(rawToken)
  };
}

export function extractBearerToken(headerValue: string | null | undefined): string | null {
  if (!headerValue) return null;
  const trimmed = headerValue.trim();
  if (trimmed === '') return null;
  const match = /^(token|bearer)\s+(.+)$/i.exec(trimmed);
  if (!match) return null;
  const token = (match[2] ?? '').trim();
  return token === '' ? null : token;
}

export function validateTokenShape(rawToken: string): boolean {
  if (rawToken.length < 16 || rawToken.length > 256) return false;
  return /^[A-Za-z0-9_-]+$/.test(rawToken);
}

export async function safeEqualHash(a: string, b: string): Promise<boolean> {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  return constantTimeEqual(aBytes, bBytes);
}

function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) {
    s += (b[i] ?? 0).toString(16).padStart(2, '0');
  }
  return s;
}

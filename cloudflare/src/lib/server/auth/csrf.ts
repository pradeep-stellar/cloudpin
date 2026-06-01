import { hmacSha256, toBase64Url } from './crypto';

export type CsrfTokenParts = {
  userId: number;
  sessionId: string;
  dayBucket: number;
  nonce: string;
};

export async function buildCsrfToken(appSecret: string, parts: CsrfTokenParts): Promise<string> {
  const body = `${parts.userId}.${parts.sessionId}.${parts.dayBucket}.${parts.nonce}`;
  const mac = await hmacSha256(appSecret, body);
  return `${toBase64Url(mac).slice(0, 40)}`;
}

export async function verifyCsrfToken(
  appSecret: string,
  parts: CsrfTokenParts,
  token: string
): Promise<boolean> {
  const expected = await buildCsrfToken(appSecret, parts);
  return constantTimeStrEqual(expected, token);
}

function constantTimeStrEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export const CSRF_HEADER = 'x-csrf-token';
export const CSRF_FORM_FIELD = '_csrf';

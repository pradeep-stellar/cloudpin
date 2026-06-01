import { hmacSha256, randomBase64Url, toBase64Url } from './crypto';

const SESSION_VERSION = 'v1';
const SESSION_TTL_DAYS = 30;

export type SessionPayload = {
  sessionId: string;
  userId: number;
  dayBucket: number;
};

function dayBucketFromEpoch(epochSeconds: number): number {
  return Math.floor(epochSeconds / 86400);
}

export function currentDayBucket(): number {
  return dayBucketFromEpoch(Math.floor(Date.now() / 1000));
}

export function newSessionId(): string {
  return randomBase64Url(24);
}

export async function signSessionCookie(
  appSecret: string,
  payload: SessionPayload
): Promise<string> {
  const body = `${SESSION_VERSION}.${payload.sessionId}.${payload.userId}.${payload.dayBucket}`;
  const mac = await hmacSha256(appSecret, body);
  return `${body}.${toBase64Url(mac).slice(0, 32)}`;
}

export async function verifySessionCookie(
  appSecret: string,
  cookie: string
): Promise<SessionPayload | null> {
  const parts = cookie.split('.');
  if (parts.length !== 5) return null;
  const [version, sessionId, userIdStr, dayBucketStr, sig] = parts as [
    string,
    string,
    string,
    string,
    string
  ];
  if (version !== SESSION_VERSION) return null;
  const userId = Number(userIdStr);
  const dayBucket = Number(dayBucketStr);
  if (!Number.isInteger(userId) || userId <= 0) return null;
  if (!Number.isInteger(dayBucket) || dayBucket <= 0) return null;
  const body = `${version}.${sessionId}.${userId}.${dayBucket}`;
  const expected = await hmacSha256(appSecret, body);
  const expectedSig = toBase64Url(expected).slice(0, 32);
  if (!constantTimeStrEqual(expectedSig, sig)) return null;
  const ageDays = currentDayBucket() - dayBucket;
  if (ageDays < 0 || ageDays > SESSION_TTL_DAYS) return null;
  return { sessionId, userId, dayBucket };
}

function constantTimeStrEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export const SESSION_COOKIE_NAME = 'cloudpin_session';
export const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 86400;

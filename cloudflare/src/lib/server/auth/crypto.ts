const encoder = new TextEncoder();
const decoder = new TextDecoder();

const B64URL_RE = /^[A-Za-z0-9_-]*$/;

export function toBase64Url(bytes: Uint8Array | ArrayBuffer): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < view.length; i++) {
    bin += String.fromCharCode(view[i] ?? 0);
  }
  const b64 = btoa(bin);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(input: string): Uint8Array {
  if (!B64URL_RE.test(input)) {
    throw new Error('Invalid base64url input');
  }
  const padded = input + '='.repeat((4 - (input.length % 4)) % 4);
  const b64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

export function utf8ToBytes(input: string): Uint8Array {
  return encoder.encode(input);
}

export function bytesToUtf8(input: Uint8Array | ArrayBuffer): string {
  const view = input instanceof Uint8Array ? input : new Uint8Array(input);
  return decoder.decode(view);
}

export function toHex(bytes: Uint8Array | ArrayBuffer): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = '';
  for (let i = 0; i < view.length; i++) {
    const v = view[i] ?? 0;
    out += v.toString(16).padStart(2, '0');
  }
  return out;
}

export function fromHex(input: string): Uint8Array {
  if (input.length % 2 !== 0) throw new Error('Invalid hex input');
  const out = new Uint8Array(input.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(input.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new Error('Invalid hex input');
    out[i] = byte;
  }
  return out;
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

export async function sha256(input: Uint8Array | string): Promise<Uint8Array> {
  const data = typeof input === 'string' ? utf8ToBytes(input) : input;
  const hash = await crypto.subtle.digest('SHA-256', toArrayBuffer(data));
  return new Uint8Array(hash);
}

export async function hmacSha256(
  key: Uint8Array | string,
  data: Uint8Array | string
): Promise<Uint8Array> {
  const keyData = typeof key === 'string' ? utf8ToBytes(key) : key;
  const message = typeof data === 'string' ? utf8ToBytes(data) : data;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(keyData),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, toArrayBuffer(message));
  return new Uint8Array(sig);
}

function toArrayBuffer(input: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(input.length);
  new Uint8Array(ab).set(input);
  return ab;
}

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

export function randomBase64Url(length: number): string {
  return toBase64Url(randomBytes(length));
}

export function safeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

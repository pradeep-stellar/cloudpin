export type PutOptions = {
  contentType: string;
  contentLength?: number;
  cacheControl?: string;
  gzip?: boolean;
  metadata?: Record<string, string>;
};

export async function putObject(
  bucket: R2Bucket,
  key: string,
  body: ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array | string,
  opts: PutOptions
): Promise<{ key: string; size: number }> {
  let payload: ArrayBuffer | Uint8Array | string = body as ArrayBuffer;
  if (body instanceof ReadableStream) {
    payload = await new Response(body).arrayBuffer();
  } else if (typeof body === 'string') {
    payload = new TextEncoder().encode(body);
  } else if (body instanceof Uint8Array) {
    payload = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
  }
  const size =
    payload instanceof ArrayBuffer
      ? payload.byteLength
      : typeof payload === 'string'
        ? new TextEncoder().encode(payload).byteLength
        : (payload as Uint8Array).byteLength;
  const httpMetadata: R2HTTPMetadata = {
    contentType: opts.contentType,
    cacheControl: opts.cacheControl ?? 'public, max-age=86400'
  };
  await bucket.put(key, payload, {
    httpMetadata,
    customMetadata: opts.metadata
  });
  return { key, size };
}

export async function getObjectStream(
  bucket: R2Bucket,
  key: string
): Promise<{
  body: ReadableStream<Uint8Array>;
  contentType: string | undefined;
  size: number;
} | null> {
  const obj = await bucket.get(key);
  if (!obj) return null;
  return { body: obj.body, contentType: obj.httpMetadata?.contentType, size: obj.size };
}

export async function deleteObject(bucket: R2Bucket, key: string): Promise<void> {
  await bucket.delete(key);
}

export async function objectExists(bucket: R2Bucket, key: string): Promise<boolean> {
  const head = await bucket.head(key);
  return head !== null;
}

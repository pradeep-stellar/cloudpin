import { describe, it, expect } from 'vitest';
import { gzipBuffer } from '../../src/jobs/handlers/snapshot';

describe('gzipBuffer', () => {
  it('produces a non-empty compressed buffer', async () => {
    const original = new TextEncoder().encode('hello world '.repeat(100));
    const ab = original.buffer.slice(
      original.byteOffset,
      original.byteOffset + original.byteLength
    ) as ArrayBuffer;
    const gz = await gzipBuffer(ab);
    expect(gz.body.byteLength).toBeGreaterThan(0);
    expect(gz.encoding).toBe('gzip');
    const decompressed = new Response(
      new Response(gz.body).body!.pipeThrough(new DecompressionStream('gzip'))
    );
    const out = await new Response(decompressed.body).text();
    expect(out).toBe('hello world '.repeat(100));
  });
});

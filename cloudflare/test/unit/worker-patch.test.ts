import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { patchWorkerFile } from '../../scripts/patch-worker.mjs';

const SVELTEKIT_WORKER = `// src/worker.js
import { Server } from "./../output/server/index.js";
import { manifest, prerendered, base_path } from "./../cloudflare-tmp/manifest.js";
import { env } from "cloudflare:workers";

var server = new Server(manifest);
var worker_default = {
  async fetch(req, env2, ctx) {
    return new Response("ok");
  }
};
export {
  worker_default as default
};
`;

const ALREADY_PATCHED_WORKER = `import { handleQueueBatch } from "../../src/jobs/queue-consumer.ts";
var server = new Server(manifest);
var worker_default = { async fetch() {} };
export {
  worker_default as default,
  handleQueueBatch as queue
};
`;

describe('patchWorkerFile', () => {
  let dir: string;
  let workerPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cloudpin-patch-'));
    workerPath = join(dir, '_worker.js');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('adds a queue import and queue named export to a SvelteKit worker', async () => {
    await writeFile(workerPath, SVELTEKIT_WORKER, 'utf8');
    const result = await patchWorkerFile(workerPath);
    expect(result.patched).toBe(true);
    expect(result.reason).toBe('patched');

    const patched = await readFile(workerPath, 'utf8');
    expect(patched).toContain(
      'import { handleQueueBatch } from "../../src/jobs/queue-consumer.ts";'
    );
    expect(patched).toContain('handleQueueBatch as queue');
    expect(patched).toContain('worker_default as default');
  });

  it('is idempotent: re-running is a no-op', async () => {
    await writeFile(workerPath, SVELTEKIT_WORKER, 'utf8');
    await patchWorkerFile(workerPath);
    const firstPass = await readFile(workerPath, 'utf8');

    const result = await patchWorkerFile(workerPath);
    expect(result.patched).toBe(false);
    expect(result.reason).toBe('already_patched');

    const secondPass = await readFile(workerPath, 'utf8');
    expect(secondPass).toBe(firstPass);
  });

  it('does not duplicate the import line on a re-patch (defensive)', async () => {
    await writeFile(workerPath, ALREADY_PATCHED_WORKER, 'utf8');
    const result = await patchWorkerFile(workerPath);
    expect(result.patched).toBe(false);
    const patched = await readFile(workerPath, 'utf8');
    const matches = patched.match(/from "\.\.\/\.\.\/src\/jobs\/queue-consumer\.ts"/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('throws on a file that does not match the SvelteKit worker pattern', async () => {
    const bad = `export default { fetch() {} };\n`;
    await writeFile(workerPath, bad, 'utf8');
    await expect(patchWorkerFile(workerPath)).rejects.toThrow(
      /does not match the expected SvelteKit worker export pattern/
    );
  });

  it('preserves the default export alongside the new queue export', async () => {
    await writeFile(workerPath, SVELTEKIT_WORKER, 'utf8');
    await patchWorkerFile(workerPath);
    const patched = await readFile(workerPath, 'utf8');

    // Both names appear in the same export block, comma-separated
    const exportBlock = patched.match(/export\s*\{[^}]*\}/);
    expect(exportBlock).toBeDefined();
    const block = exportBlock![0];
    expect(block).toMatch(/worker_default as default/);
    expect(block).toMatch(/handleQueueBatch as queue/);
  });
});

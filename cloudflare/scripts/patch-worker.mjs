#!/usr/bin/env node
// Patch the SvelteKit-generated Cloudflare worker to add a `queue` named
// export that calls handleQueueBatch from src/jobs/queue-consumer.ts.
//
// Why this exists:
//   adapter-cloudflare writes .svelte-kit/cloudflare/_worker.js with a
//   single `default` export holding the fetch handler. Cloudflare Queues
//   need a named `queue` export on the same worker entry. The SvelteKit
//   adapter has no built-in hook for that, so we patch the file in place
//   right after `vite build` via the npm `postbuild` hook.
//
// Idempotency: re-running the script on an already-patched file is a no-op.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, '..');
const WORKER_PATH = resolve(PROJECT_ROOT, '.svelte-kit/cloudflare/_worker.js');

const QUEUE_IMPORT = 'import { handleQueueBatch } from "../../src/jobs/queue-consumer.ts";\n';

const ORIGINAL_EXPORT_RE = /export\s*\{\s*worker_default as default\s*\};/;

const PATCHED_EXPORT = `export {
  worker_default as default,
  handleQueueBatch as queue
};`;

/**
 * @param {string} [workerPath]
 * @returns {Promise<{patched: boolean, reason: string}>}
 */
export async function patchWorkerFile(workerPath = WORKER_PATH) {
  const original = await readFile(workerPath, 'utf8');

  if (original.includes('handleQueueBatch as queue')) {
    return { patched: false, reason: 'already_patched' };
  }

  if (!ORIGINAL_EXPORT_RE.test(original)) {
    throw new Error(
      `patch-worker: ${workerPath} does not match the expected SvelteKit ` +
        `worker export pattern \`export { worker_default as default };\`. ` +
        `Did the SvelteKit adapter change its worker template?`
    );
  }

  let patched = original.includes(QUEUE_IMPORT.trim()) ? original : QUEUE_IMPORT + original;

  patched = patched.replace(ORIGINAL_EXPORT_RE, PATCHED_EXPORT);

  await writeFile(workerPath, patched, 'utf8');
  return { patched: true, reason: 'patched' };
}

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1] ?? '');

if (isMain) {
  try {
    const result = await patchWorkerFile();
    const verb = result.patched ? 'patched' : 'skipped';
    console.log(`patch-worker: ${verb} ${WORKER_PATH} (${result.reason})`);
  } catch (err) {
    console.error('patch-worker failed:', err);
    process.exit(1);
  }
}

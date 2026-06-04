#!/usr/bin/env node
// Patch the SvelteKit-generated Cloudflare worker to add the named exports
// the wrangler config requires but the @sveltejs/adapter-cloudflare template
// does not emit on its own.
//
// Why this exists:
//   adapter-cloudflare writes .svelte-kit/cloudflare/_worker.js with only a
//   `default` export holding the fetch handler. The wrangler config declares
//   additional bindings that need named exports on the same worker entry:
//
//     - handleQueueBatch as `queue` (Cloudflare Queues consumer)
//
//   The SvelteKit adapter has no built-in hook for these, so we patch the
//   file in place right after `vite build` via the npm `postbuild` hook.
//
// Idempotency: re-running the script on an already-patched file is a no-op.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, '..');
const WORKER_PATH = resolve(PROJECT_ROOT, '.svelte-kit/cloudflare/_worker.js');

const EXTRA_IMPORTS = ['import { handleQueueBatch } from "../../src/jobs/queue-consumer.ts";'].join(
  '\n'
);

const ORIGINAL_EXPORT_RE = /export\s*\{\s*worker_default as default\s*\};/;

const PATCHED_EXPORT = `export {
  worker_default as default,
  handleQueueBatch as queue
};`;

const WORKFLOW_IMPORT_RE =
  /^import \{ ImportWorkflow, SnapshotWorkflow \} from "\.\.\/\.\.\/src\/workflows\/index\.ts";\n/m;
const WORKFLOW_EXPORT_RE = /\n?  ImportWorkflow,\n?  SnapshotWorkflow,?/g;

function stripLegacyWorkflowExports(source) {
  return source.replace(WORKFLOW_IMPORT_RE, '').replace(WORKFLOW_EXPORT_RE, '');
}

function isPatched(source) {
  return source.includes('handleQueueBatch as queue') && !source.includes('workflows/index');
}

/**
 * @param {string} [workerPath]
 * @returns {Promise<{patched: boolean, reason: string}>}
 */
export async function patchWorkerFile(workerPath = WORKER_PATH) {
  const onDisk = await readFile(workerPath, 'utf8');
  const cleaned = stripLegacyWorkflowExports(onDisk);

  if (isPatched(cleaned) && cleaned === onDisk) {
    return { patched: false, reason: 'already_patched' };
  }

  if (!ORIGINAL_EXPORT_RE.test(cleaned)) {
    throw new Error(
      `patch-worker: ${workerPath} does not match the expected SvelteKit ` +
        `worker export pattern \`export { worker_default as default };\`. ` +
        `Did the SvelteKit adapter change its worker template?`
    );
  }

  const importsPresent = cleaned.includes('handleQueueBatch from');
  const withImports = importsPresent ? cleaned : EXTRA_IMPORTS + '\n' + cleaned;
  const finalPatched = withImports.replace(ORIGINAL_EXPORT_RE, PATCHED_EXPORT);

  await writeFile(workerPath, finalPatched, 'utf8');
  const reason = cleaned !== onDisk ? 'stripped_workflows' : 'patched';
  return { patched: true, reason };
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

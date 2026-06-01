import type { MessageBatch } from '@cloudflare/workers-types';
import { JobMessageSchema, type JobMessage } from './messages';
import { runJob, type QueueEnv } from './runner';

export async function handleQueueBatch(batch: MessageBatch, env: unknown): Promise<void> {
  // The workerd runtime hands us the wrangler-generated Env, which types
  // BROWSER as a plain Fetcher. The actual binding carries the
  // .quickAction() RPC method (see src/jobs/handlers/snapshot.ts). Narrow at
  // this single boundary so the runner never needs scattered casts.
  const queueEnv = env as QueueEnv;
  await runBatch(batch, queueEnv);
}

async function runBatch(batch: MessageBatch, env: QueueEnv): Promise<void> {
  const messages: { ok: boolean; message: JobMessage; reason?: string }[] = [];
  for (const raw of batch.messages) {
    const parsed = JobMessageSchema.safeParse(JSON.parse(raw.body as string));
    if (!parsed.success) {
      raw.retry({ delaySeconds: 30 });
      messages.push({
        ok: false,
        message: {
          jobId: 'invalid',
          type: 'metadata.refresh',
          userId: 0,
          attemptKey: 'invalid',
          requestedAt: new Date().toISOString()
        },
        reason: 'parse_error'
      });
      continue;
    }
    const result = await runJob({ env, message: parsed.data });
    if (result.ok) {
      raw.ack();
    } else if (result.reason === 'bookmark_not_found' || result.reason === 'not_implemented') {
      raw.ack();
    } else {
      raw.retry({ delaySeconds: Math.min(60 * 5, 30 * Math.pow(2, raw.attempts - 1)) });
    }
    messages.push({ ok: result.ok, message: parsed.data, reason: result.reason });
  }
  void messages;
}

import { describe, it, expect } from 'vitest';
import { enqueueBookmarkJobs, jobTypesForProfile } from '../../src/jobs/enqueue';
import { JobMessageSchema } from '../../src/jobs/messages';

describe('jobTypesForProfile', () => {
  it('always refreshes metadata, adds the rest from profile flags', () => {
    expect(jobTypesForProfile(null)).toEqual(['metadata.refresh']);
    expect(
      jobTypesForProfile({
        enableFavicons: true,
        enablePreviewImages: false,
        enableAutomaticHtmlSnapshots: true,
        webArchiveIntegration: 'everything'
      })
    ).toEqual(['metadata.refresh', 'favicon.load', 'snapshot.create', 'wayback.create']);
  });
});

describe('enqueueBookmarkJobs', () => {
  it('sends one JSON-string message per job that the consumer can parse', async () => {
    const sent: { body: string }[] = [];
    const db = {
      prepare: () => ({
        bind: () => ({
          all: async () => ({ results: [] }),
          raw: async () => [],
          first: async () => null,
          run: async () => ({ success: true, meta: {} })
        })
      })
    } as unknown as D1Database;
    const JOBS = {
      sendBatch: async (m: { body: string }[]) => void sent.push(...m)
    } as unknown as Queue;
    await enqueueBookmarkJobs({ DB: db, JOBS }, 1, 42);
    expect(sent).toHaveLength(1);
    const parsed = JobMessageSchema.parse(JSON.parse(sent[0]!.body));
    expect(parsed.type).toBe('metadata.refresh');
    expect(parsed.bookmarkId).toBe(42);
    expect(parsed.userId).toBe(1);
  });
});

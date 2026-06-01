import { describe, it, expect } from 'vitest';
import { JobMessageSchema } from '../../src/jobs/messages';

describe('JobMessage schema', () => {
  it('accepts a valid message', () => {
    const r = JobMessageSchema.safeParse({
      jobId: 'j1',
      type: 'favicon.load',
      userId: 1,
      bookmarkId: 42,
      attemptKey: 'k1',
      requestedAt: '2024-01-01T00:00:00Z'
    });
    expect(r.success).toBe(true);
  });

  it('rejects unknown job types', () => {
    const r = JobMessageSchema.safeParse({
      jobId: 'j1',
      type: 'magic.thing',
      userId: 1,
      attemptKey: 'k1',
      requestedAt: '2024-01-01T00:00:00Z'
    });
    expect(r.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const r = JobMessageSchema.safeParse({
      jobId: 'j1',
      type: 'favicon.load',
      userId: 1
    });
    expect(r.success).toBe(false);
  });
});

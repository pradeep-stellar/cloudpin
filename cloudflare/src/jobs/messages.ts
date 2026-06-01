import { z } from 'zod';

export const JobTypeSchema = z.enum([
  'metadata.refresh',
  'favicon.load',
  'preview.load',
  'wayback.create',
  'snapshot.create',
  'import.process',
  'backfill.favicons',
  'backfill.previews'
]);

export const JobMessageSchema = z.object({
  jobId: z.string().min(1),
  type: JobTypeSchema,
  userId: z.number().int().positive(),
  bookmarkId: z.number().int().positive().optional(),
  attemptKey: z.string().min(1),
  requestedAt: z.string()
});

export type JobType = z.infer<typeof JobTypeSchema>;
export type JobMessage = z.infer<typeof JobMessageSchema>;

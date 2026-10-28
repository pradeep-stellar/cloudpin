import type { JobMessage, JobType } from './messages';
import { getUserProfile, type UserProfileRow } from '../db/repositories/profiles.repo';

type JobFlags = Pick<
  UserProfileRow,
  | 'enableFavicons'
  | 'enablePreviewImages'
  | 'enableAutomaticHtmlSnapshots'
  | 'webArchiveIntegration'
>;

export function jobTypesForProfile(profile: JobFlags | null): JobType[] {
  const types: JobType[] = ['metadata.refresh'];
  if (profile?.enableFavicons) types.push('favicon.load');
  if (profile?.enablePreviewImages) types.push('preview.load');
  if (profile?.enableAutomaticHtmlSnapshots) types.push('snapshot.create');
  if (profile && profile.webArchiveIntegration !== 'disabled') types.push('wayback.create');
  return types;
}

// Called once per newly created bookmark. The consumer (queue-consumer.ts)
// expects each message body to be a JSON string.
export async function enqueueBookmarkJobs(
  env: { DB: D1Database; JOBS: Queue },
  userId: number,
  bookmarkId: number
): Promise<void> {
  const profile = await getUserProfile(env.DB, userId);
  const requestedAt = new Date().toISOString();
  const messages = jobTypesForProfile(profile).map((type) => {
    const body: JobMessage = {
      jobId: crypto.randomUUID(),
      type,
      userId,
      bookmarkId,
      attemptKey: `${type}:${bookmarkId}:${requestedAt}`,
      requestedAt
    };
    return { body: JSON.stringify(body) };
  });
  await env.JOBS.sendBatch(messages);
}

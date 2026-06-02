import { DuplicateUrlError } from '$db/repositories/bookmarks.repo';

// Map repository-level errors from updateBookmark to a SvelteKit
// fail() shape. Returns null when the error should propagate. Lives in
// its own module so the edit form action can stay free of arbitrary
// exports (SvelteKit rejects anything other than load/actions/etc in
// +page.server.ts).
export function mapUpdateError(err: unknown): { status: number; body: { error: string } } | null {
  if (err instanceof DuplicateUrlError) {
    return { status: 409, body: { error: 'duplicate_url' } };
  }
  return null;
}

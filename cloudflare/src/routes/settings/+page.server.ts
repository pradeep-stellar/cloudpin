import { redirect, fail, type Actions, type ServerLoad } from '@sveltejs/kit';
import { getUserProfile, upsertUserProfile } from '$db/repositories/profiles.repo';
import { loadSessionUser } from '$db/repositories/tokens.repo';

const BOOLEAN_FIELDS = [
  'enableSharing',
  'enablePublicSharing',
  'enableFavicons',
  'enablePreviewImages',
  'displayUrl',
  'displayViewBookmarkAction',
  'displayEditBookmarkAction',
  'displayArchiveBookmarkAction',
  'displayRemoveBookmarkAction',
  'permanentNotes',
  'enableAutomaticHtmlSnapshots',
  'defaultMarkUnread',
  'defaultMarkShared',
  'stickyPagination',
  'collapseSidePanel',
  'hideBundles',
  'legacySearch'
] as const;

const TEXT_FIELDS = [
  'theme',
  'bookmarkDateDisplay',
  'bookmarkDescriptionDisplay',
  'bookmarkLinkTarget',
  'webArchiveIntegration',
  'tagSearch',
  'tagGrouping'
] as const;

export const load: ServerLoad = async ({ locals, platform }) => {
  if (locals.auth.state.kind === 'unauthenticated') {
    throw redirect(302, '/login');
  }
  const user = locals.auth.state.user;
  const [profile, full] = await Promise.all([
    getUserProfile(platform!.env.DB as D1Database, user.id),
    loadSessionUser(platform!.env.DB as D1Database, user.id)
  ]);
  return { profile, user: full };
};

function parseBool(v: FormDataEntryValue | null): boolean {
  return v === 'on' || v === 'true' || v === '1';
}

export const actions: Actions = {
  default: async ({ request, locals, platform }) => {
    if (locals.auth.state.kind === 'unauthenticated') return fail(401);
    const user = locals.auth.state.user;
    const data = await request.formData();
    const patch: Record<string, unknown> = {};
    for (const f of TEXT_FIELDS) {
      const v = data.get(f);
      if (typeof v === 'string') patch[f] = v;
    }
    for (const f of BOOLEAN_FIELDS) {
      patch[f] = parseBool(data.get(f));
    }
    const maxLines = Number(data.get('bookmarkDescriptionMaxLines'));
    if (Number.isFinite(maxLines) && maxLines > 0) {
      patch['bookmarkDescriptionMaxLines'] = Math.min(20, Math.floor(maxLines));
    }
    const itemsPerPage = Number(data.get('itemsPerPage'));
    if (Number.isFinite(itemsPerPage) && itemsPerPage > 0) {
      patch['itemsPerPage'] = Math.min(500, Math.floor(itemsPerPage));
    }
    const css = String(data.get('customCss') ?? '');
    patch['customCss'] = css;
    if (css) {
      const enc = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', enc.encode(css));
      const hashArr = Array.from(new Uint8Array(hashBuffer));
      patch['customCssHash'] = hashArr.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    await upsertUserProfile(platform!.env.DB as D1Database, user.id, patch);
    return { ok: true, savedAt: new Date().toISOString() };
  }
};

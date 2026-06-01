import { test, expect } from '@playwright/test';

const DEV_EMAIL = 'dev@cloudpin.local';

test.describe('auth (e2e bypass)', () => {
  test('GET / does not redirect to /login and lands on /bookmarks', async ({ page }) => {
    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(response, 'root response should exist').not.toBeNull();
    // The root server load throws redirect(302, '/bookmarks') for any
    // authenticated request, and redirect(302, '/login') for an
    // unauthenticated one. With the e2e bypass active, we must not
    // see /login.
    await expect(page).not.toHaveURL(/\/login(\?|$)/);
    await expect(page).toHaveURL(/\/bookmarks(\?|$)/);
  });

  test('/bookmarks returns 200 and renders the canonical heading', async ({ page }) => {
    const response = await page.goto('/bookmarks');
    expect(response, 'bookmarks response should exist').not.toBeNull();
    expect(response!.status(), 'bookmarks page should be 200').toBe(200);
    await expect(page).toHaveURL(/\/bookmarks(\?|$)/);
    await expect(page.getByRole('heading', { name: 'All bookmarks' })).toBeVisible();
  });

  test('topbar shows the dev identity and the standard nav', async ({ page }) => {
    await page.goto('/bookmarks');
    // The layout renders the user's email in the topbar when
    // locals.auth is resolved. The dev bypass resolves to this email.
    await expect(page.locator('header.topbar .user .email')).toHaveText(DEV_EMAIL);
    // Nav items that the layout always renders for an authenticated user.
    for (const label of ['All', 'Archived', 'Shared', 'Tags', 'Bundles', 'Settings']) {
      await expect(
        page.locator('header.topbar nav.nav a', { hasText: new RegExp(`^${label}$`) })
      ).toBeVisible();
    }
  });

  test('archived and shared lists also require no login under the bypass', async ({ page }) => {
    for (const path of ['/bookmarks/archived', '/bookmarks/shared']) {
      const response = await page.goto(path);
      expect(response, `${path} response should exist`).not.toBeNull();
      expect(response!.status(), `${path} should be 200`).toBe(200);
      await expect(page).not.toHaveURL(/\/login(\?|$)/);
    }
  });
});

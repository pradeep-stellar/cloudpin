import { test, expect } from '@playwright/test';

test('boot smoke: /bookmarks renders under the dev identity', async ({ page }) => {
  await page.goto('/bookmarks');
  // The dev bypass resolves to the dev@cloudpin.local identity, so we should
  // land on the bookmarks page directly, not be redirected to /login.
  await expect(page).toHaveURL(/\/bookmarks/);
  await expect(page.getByRole('heading', { name: 'All bookmarks' })).toBeVisible();
});

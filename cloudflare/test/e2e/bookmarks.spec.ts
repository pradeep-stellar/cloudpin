import { test, expect } from '@playwright/test';

const DEV_TAG = 'crud-e2e';

test.describe('bookmarks CRUD', () => {
  test('create → list → edit → archive → delete', async ({ page }) => {
    // Unique URL per run so this spec is idempotent against the shared
    // local D1 state. The query string is normalised away by the URL
    // canonicaliser only when canonical-equivalent; we keep the path
    // unique to avoid collisions.
    const unique = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const url = `https://example.com/${unique}`;
    const originalTitle = `${unique} original title`;
    const editedTitle = `${unique} edited title`;
    const description = `crud spec run for ${unique}`;
    const notes = `notes for ${unique}`;

    page.on('dialog', (d) => {
      // The details page's Delete button uses window.confirm.
      void d.accept();
    });

    // 1. Create: /bookmarks/new → fill → submit → land on /details.
    await page.goto('/bookmarks/new');
    await expect(page.getByRole('heading', { name: 'New bookmark' })).toBeVisible();

    await page.locator('input[name="url"]').fill(url);
    await page.locator('input[name="title"]').fill(originalTitle);
    await page.locator('textarea[name="description"]').fill(description);
    await page.locator('textarea[name="notes"]').fill(notes);
    await page.locator('input[name="tag_names"]').fill(DEV_TAG);
    await page.getByRole('button', { name: 'Save bookmark' }).click();

    await expect(page).toHaveURL(/\/bookmarks\/\d+\/details$/);
    const detailsUrl = page.url();
    const idMatch = detailsUrl.match(/\/bookmarks\/(\d+)\/details/);
    expect(idMatch, 'should capture bookmark id from details url').not.toBeNull();
    const bookmarkId = idMatch![1];
    await expect(page.getByRole('heading', { name: originalTitle })).toBeVisible();
    await expect(page.locator('article.details .url', { hasText: 'example.com' })).toBeVisible();

    // 2. New bookmark appears in the active list at /bookmarks.
    await page.goto('/bookmarks');
    const card = page.locator('article.card', { hasText: originalTitle });
    await expect(card).toBeVisible();
    // The card should expose Edit / Details links.
    await expect(card.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      `/bookmarks/${bookmarkId}/edit`
    );

    // 3. Edit: change the title and save; verify the change on /details.
    await card.getByRole('link', { name: 'Edit' }).click();
    await expect(page).toHaveURL(new RegExp(`/bookmarks/${bookmarkId}/edit$`));
    const titleInput = page.locator('input[name="title"]');
    await expect(titleInput).toHaveValue(originalTitle);
    await titleInput.fill(editedTitle);
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page).toHaveURL(new RegExp(`/bookmarks/${bookmarkId}/details$`));
    await expect(page.getByRole('heading', { name: editedTitle })).toBeVisible();
    await expect(page.getByRole('heading', { name: originalTitle })).toHaveCount(0);

    // The active list should now show the edited title.
    await page.goto('/bookmarks');
    await expect(page.locator('article.card', { hasText: editedTitle })).toBeVisible();
    await expect(page.locator('article.card', { hasText: originalTitle })).toHaveCount(0);

    // 4. Archive: use the details page Archive button.
    await page.goto(`/bookmarks/${bookmarkId}/details`);
    await page.getByRole('button', { name: 'Archive' }).click();
    // The toggleArchive action returns { ok: true } and stays on /details.
    await expect(page).toHaveURL(new RegExp(`/bookmarks/${bookmarkId}/details$`));
    // The Status section should now read 'Archived: yes' and the button
    // should flip to 'Unarchive'.
    await expect(page.locator('article.details .status')).toContainText('Archived: yes');
    await expect(page.getByRole('button', { name: 'Unarchive' })).toBeVisible();

    // The bookmark should disappear from /bookmarks and show up in
    // /bookmarks/archived.
    await page.goto('/bookmarks');
    await expect(page.locator('article.card', { hasText: editedTitle })).toHaveCount(0);

    await page.goto('/bookmarks/archived');
    await expect(page.locator('article.card', { hasText: editedTitle })).toBeVisible();

    // 5. Delete from archived: navigate back to details and click Delete.
    await page.goto(`/bookmarks/${bookmarkId}/details`);
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page).toHaveURL(/\/bookmarks(\?|$)/);

    // The bookmark should be gone from both lists.
    await expect(page.locator('article.card', { hasText: editedTitle })).toHaveCount(0);
    await page.goto('/bookmarks/archived');
    await expect(page.locator('article.card', { hasText: editedTitle })).toHaveCount(0);

    // The details page should now 404.
    const resp = await page.goto(`/bookmarks/${bookmarkId}/details`);
    expect(resp, 'details response should exist').not.toBeNull();
    expect(resp!.status(), 'deleted bookmark details should 404').toBe(404);
  });
});

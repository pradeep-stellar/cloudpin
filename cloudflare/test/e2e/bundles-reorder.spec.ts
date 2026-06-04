import { test, expect, type Page } from '@playwright/test';

async function createBundle(page: Page, name: string): Promise<void> {
  await page.goto('/bundles/new');
  await page.locator('input[name="name"]').fill(name);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/\/bundles\/\d+\/edit$/);
}

test.describe('bundle reorder', () => {
  test('reorders three bundles via up/down and persists on reload', async ({ page }) => {
    const unique = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const names = [
      `Bundle A ${unique}`,
      `Bundle B ${unique}`,
      `Bundle C ${unique}`
    ];

    for (const name of names) {
      await createBundle(page, name);
    }

    await page.goto('/bundles');
    await expect(page.getByRole('heading', { name: 'Bundles' })).toBeVisible();

    const rows = page.locator('.bundle-list li', { hasText: unique });
    await expect(rows).toHaveCount(3);

    const rowA = rows.filter({ hasText: names[0]! });

    await rowA.locator('button[aria-label="Move down"]').click();
    await rowA.locator('button[aria-label="Move down"]').click();
    await page.getByRole('button', { name: 'Save order' }).click();

    await page.reload();
    const namesOnPage = await page
      .locator('.bundle-list li', { hasText: unique })
      .locator('a')
      .allTextContents();
    expect(namesOnPage).toEqual([names[1], names[2], names[0]]);
  });
});
import { test, expect, type Page } from '@playwright/test';

async function seedBookmark(
  page: Page,
  opts: { url: string; title: string; tag: string }
): Promise<void> {
  await page.goto('/bookmarks/new');
  await page.locator('input[name="url"]').fill(opts.url);
  await page.locator('input[name="title"]').fill(opts.title);
  await page.locator('input[name="tag_names"]').fill(opts.tag);
  await page.getByRole('button', { name: 'Save bookmark' }).click();
  await expect(page).toHaveURL(/\/bookmarks\/\d+\/details$/);
}

test.describe('bulk actions', () => {
  test('archive 2 of 3 selected bookmarks via the bulk bar', async ({ page }) => {
    const unique = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const tag = `bulk-e2e-${unique}`;
    const seed = [
      { url: `https://example.com/bulk-a-${unique}`, title: `Bulk A ${unique}` },
      { url: `https://example.com/bulk-b-${unique}`, title: `Bulk B ${unique}` },
      { url: `https://example.com/bulk-c-${unique}`, title: `Bulk C ${unique}` }
    ];

    // 1. Seed three bookmarks with a shared tag so the bulk bar is
    // visible and so the test can clean them up by tag filter.
    for (const s of seed) {
      await seedBookmark(page, { url: s.url, title: s.title, tag });
    }

    // 2. Visit /bookmarks and check 2 of the 3 cards.
    await page.goto('/bookmarks');
    await expect(page.getByRole('heading', { name: 'All bookmarks' })).toBeVisible();

    // Filter by the unique tag so the seed isn't drowned out by other
    // bookmarks that may have leaked into the shared D1 from earlier
    // test runs.
    const tagChip = page.locator('aside.side .cloud .tag', { hasText: `#${tag}` }).first();
    await tagChip.click();
    await expect(page).toHaveURL(new RegExp(`[?&]tag=${tag}(?:&|$)`));

    const cards = page.locator('article.card');
    await expect(cards).toHaveCount(3);

    const cardA = cards.filter({ hasText: seed[0]!.title });
    const cardB = cards.filter({ hasText: seed[1]!.title });
    const cardC = cards.filter({ hasText: seed[2]!.title });

    // Each card's checkbox is a child label.check > input[name=selected].
    await cardA.locator('input[name="selected"]').check();
    await cardB.locator('input[name="selected"]').check();
    // Sanity: cardC is unchecked.
    await expect(cardC.locator('input[name="selected"]')).not.toBeChecked();

    // 3. Pick 'archive' from the bulk action select, click Apply.
    await page.locator('select[name="action"]').selectOption('archive');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();

    // The bulk action returns { ok: true, ... } without a redirect.
    // With use:enhance the form re-runs the load, so the list should
    // shrink to just the un-archived card.
    await expect(cards).toHaveCount(1);
    await expect(cards).toHaveText(new RegExp(seed[2]!.title));
    await expect(page.locator('article.card', { hasText: seed[0]!.title })).toHaveCount(0);
    await expect(page.locator('article.card', { hasText: seed[1]!.title })).toHaveCount(0);

    // 4. The two archived cards should now live at /bookmarks/archived.
    // The archived page has no tag filter, so we look up cards by their
    // unique title directly.
    await page.goto('/bookmarks/archived');
    await expect(page.locator('article.card', { hasText: seed[0]!.title })).toBeVisible();
    await expect(page.locator('article.card', { hasText: seed[1]!.title })).toBeVisible();
    await expect(page.locator('article.card', { hasText: seed[2]!.title })).toHaveCount(0);

    // 5. The third (un-archived) card is still on /bookmarks.
    await page.goto('/bookmarks');
    await page
      .locator('aside.side .cloud .tag', { hasText: `#${tag}` })
      .first()
      .click();
    await expect(page.locator('article.card', { hasText: seed[2]!.title })).toBeVisible();
    await expect(page.locator('article.card', { hasText: seed[0]!.title })).toHaveCount(0);
    await expect(page.locator('article.card', { hasText: seed[1]!.title })).toHaveCount(0);

    // Clean up: navigate to archived and active, unarchive / delete
    // everything we created so the test is idempotent across runs.
    page.on('dialog', (d) => {
      void d.accept();
    });
    for (const title of [seed[0]!.title, seed[1]!.title, seed[2]!.title]) {
      await page.goto('/bookmarks');
      const card = page.locator('article.card', { hasText: title });
      if ((await card.count()) > 0) {
        await card.getByRole('link', { name: 'Details' }).click();
        await page.getByRole('button', { name: 'Delete' }).click();
        await expect(page).toHaveURL(/\/bookmarks(?:\?|$)/);
      } else {
        // Look on the archived page.
        await page.goto('/bookmarks/archived');
        const archived = page.locator('article.card', { hasText: title });
        if ((await archived.count()) > 0) {
          await archived.getByRole('link', { name: 'Details' }).click();
          await page.getByRole('button', { name: 'Delete' }).click();
          await expect(page).toHaveURL(/\/bookmarks(?:\?|$)/);
        }
      }
    }
  });
});

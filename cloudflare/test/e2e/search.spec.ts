import { test, expect, type Page } from '@playwright/test';

const TAG_A = 'search-e2e-alpha';
const TAG_B = 'search-e2e-beta';

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

test.describe('search and tag chip', () => {
  test('search filters list, tag chip filters list, Clear resets URL', async ({ page }) => {
    // Use unique URLs/titles per run so the seed is idempotent against
    // the shared local D1 state.
    const unique = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const alphaUrl = `https://example.com/alpha-${unique}`;
    const betaUrl = `https://example.com/beta-${unique}`;
    const alphaTitle = `Alpha doc ${unique}`;
    const betaTitle = `Beta doc ${unique}`;
    const tagA = `${TAG_A}-${unique}`;
    const tagB = `${TAG_B}-${unique}`;

    // 1. Seed two bookmarks with distinct tags.
    await seedBookmark(page, { url: alphaUrl, title: alphaTitle, tag: tagA });
    await seedBookmark(page, { url: betaUrl, title: betaTitle, tag: tagB });

    // 2. Visit /bookmarks and confirm both bookmarks are present, with
    // both tag chips in the cloud.
    await page.goto('/bookmarks');
    await expect(page.getByRole('heading', { name: 'All bookmarks' })).toBeVisible();
    await expect(page.locator('article.card', { hasText: alphaTitle })).toBeVisible();
    await expect(page.locator('article.card', { hasText: betaTitle })).toBeVisible();
    const alphaChip = page.locator('aside.side .cloud .tag', { hasText: `#${tagA}` }).first();
    const betaChip = page.locator('aside.side .cloud .tag', { hasText: `#${tagB}` }).first();
    await expect(alphaChip).toBeVisible();
    await expect(betaChip).toBeVisible();

    const totalBefore = (await page.locator('header.bar .meta').textContent()) ?? '';
    expect(totalBefore).toMatch(/\d+\s+total/);

    // 3. Type a query that matches only the seeded alpha bookmark.
    // Use a phrase unique to the alpha title to avoid false matches
    // against any bookmarks left behind in the shared D1 by other tests
    // (or against the beta bookmark, which has the same run id).
    const searchInput = page.locator('input[name="q"]');
    const alphaNeedle = `Alpha ${alphaTitle.split(' ').pop() ?? ''}`.trim();
    await searchInput.fill(alphaNeedle);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    // URLSearchParams encodes spaces as '+' rather than '%20'.
    const expectedQ = `q=${encodeURIComponent(alphaNeedle).replace(/%20/g, '+')}`;
    await expect(page).toHaveURL(new RegExp(`[?&]${expectedQ.replace(/\+/g, '\\+')}(?:&|$)`));
    await expect(page.locator('article.card', { hasText: alphaTitle })).toBeVisible();
    await expect(page.locator('article.card', { hasText: betaTitle })).toHaveCount(0);
    const totalAfterSearch = (await page.locator('header.bar .meta').textContent()) ?? '';
    expect(totalAfterSearch).toMatch(/1\s+total/);

    // 4. Click the alpha tag chip and assert the URL has ?tag= and the
    // list filters down. The Search form is a JS-driven goto(), so clear
    // the previous ?q= by going back to /bookmarks first to keep the
    // assertions focused on tag-chip behaviour.
    await page.goto('/bookmarks');
    await alphaChip.click();
    await expect(page).toHaveURL(new RegExp(`[?&]tag=${encodeURIComponent(tagA)}(?:&|$)`));
    await expect(page.locator('article.card', { hasText: alphaTitle })).toBeVisible();
    await expect(page.locator('article.card', { hasText: betaTitle })).toHaveCount(0);
    // The selected chip should be visually marked.
    await expect(
      page.locator('aside.side .cloud .tag.selected', { hasText: `#${tagA}` })
    ).toBeVisible();

    // Click the same chip again to clear the filter (toggle behaviour).
    await page.locator('aside.side .cloud .tag.selected', { hasText: `#${tagA}` }).click();
    await expect(page).toHaveURL(/\/bookmarks(?:\?page=\d+)?$/);

    // 5. Click the beta chip, then use the Clear button to drop the
    // query params.
    await betaChip.click();
    await expect(page).toHaveURL(new RegExp(`[?&]tag=${encodeURIComponent(tagB)}(?:&|$)`));
    await expect(page.locator('article.card', { hasText: betaTitle })).toBeVisible();

    // The Clear link only renders when q or tag is set.
    const clearLink = page.getByRole('link', { name: 'Clear' });
    await expect(clearLink).toBeVisible();
    await clearLink.click();
    await expect(page).toHaveURL(/\/bookmarks(?:\?page=\d+)?$/);
    await expect(page.locator('article.card', { hasText: alphaTitle })).toBeVisible();
    await expect(page.locator('article.card', { hasText: betaTitle })).toBeVisible();

    // Clean up: delete both seeded bookmarks so we don't leak test
    // data into the shared D1 state forever. Navigate via details and
    // accept the confirm dialog.
    page.on('dialog', (d) => {
      void d.accept();
    });
    for (const title of [alphaTitle, betaTitle]) {
      await page.goto('/bookmarks');
      const card = page.locator('article.card', { hasText: title });
      if ((await card.count()) === 0) continue;
      await card.getByRole('link', { name: 'Details' }).click();
      await page.getByRole('button', { name: 'Delete' }).click();
      await expect(page).toHaveURL(/\/bookmarks(?:\?|$)/);
    }
  });
});

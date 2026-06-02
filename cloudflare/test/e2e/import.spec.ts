import { test, expect } from '@playwright/test';

const FIXTURE = 'test/fixtures/bookmarks-netscape.html';

test.describe('Netscape import', () => {
  test('upload fixture, see success result, imported bookmarks appear', async ({ page }) => {
    await page.goto('/settings/import-export');
    await expect(page.getByRole('heading', { name: 'Import & export' })).toBeVisible();

    // Upload the fixture file. The form uses fetch() under the hood,
    // not a SvelteKit form action, so we drive the file input + submit.
    await page.locator('input[type="file"][name="file"]').setInputFiles(FIXTURE);
    await page.getByRole('button', { name: /Import/ }).click();

    // The result renders as a <p class="ok"> or <p class="err">.
    const okMsg = page.locator('p.ok');
    await expect(okMsg).toBeVisible({ timeout: 15_000 });
    const msg = (await okMsg.textContent()) ?? '';
    // The fixture has 3 entries. created + updated should sum to 3
    // and failed should be 0, regardless of whether the import is a
    // fresh insert or a no-op against prior data in the shared D1.
    expect(msg).toMatch(/of 3 entries/);
    expect(msg).not.toMatch(/failed/);
    expect(msg).toMatch(/^Imported \d+ new, kept \d+ existing/);
    const m = msg.match(/Imported (\d+) new, kept (\d+) existing/);
    expect(m).not.toBeNull();
    const created = Number(m![1]);
    const kept = Number(m![2]);
    expect(created + kept).toBe(3);

    // The Svelte bookmark is unique to the fixture (the title "Svelte"
    // doesn't appear in any other spec). Search for it and confirm it
    // is on /bookmarks.
    await page.goto('/bookmarks?q=Svelte');
    const svelteCard = page.locator('article.card', { hasText: 'Svelte' });
    await expect(svelteCard).toBeVisible();
    await expect(svelteCard).toContainText('svelte.dev');

    // The fixture tags should show up in the tag cloud. #svelte is
    // unique to the fixture entry; #docs and #example may already
    // exist from other imports.
    await page.goto('/bookmarks');
    const svelteChip = page.locator('aside.side .cloud .tag', { hasText: '#svelte' }).first();
    await expect(svelteChip).toBeVisible();
  });
});

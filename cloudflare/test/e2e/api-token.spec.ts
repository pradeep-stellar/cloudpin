import { test, expect } from '@playwright/test';

test.describe('API token', () => {
  test('create token, call /api/bookmarks/ with it, revoke from settings', async ({
    page,
    request,
    baseURL
  }) => {
    // 1. Create a token from the Integrations page.
    await page.goto('/settings/integrations');
    await expect(page.getByRole('heading', { name: 'Integrations' })).toBeVisible();

    const tokenName = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    await page.locator('input[name="name"]').fill(tokenName);
    await page.getByRole('button', { name: 'Create token' }).click();

    // The raw token is rendered once inside the reveal block. Capture it
    // before the user (or the form's update()) hides it.
    const reveal = page.locator('.reveal');
    await expect(reveal).toBeVisible();
    const rawToken = (await reveal.locator('pre').textContent())?.trim() ?? '';
    expect(rawToken, 'revealed token should be a non-empty string').toBeTruthy();
    expect(rawToken.length, 'revealed token should be at least 16 chars').toBeGreaterThanOrEqual(
      16
    );

    // Dismiss the reveal so it doesn't interfere with the rest of the
    // test.
    await reveal.getByRole('button', { name: /saved it/i }).click();
    await expect(reveal).toBeHidden();

    // 2. Call /api/bookmarks/ with the token. Use a fresh request
    // context that has the Authorization header set.
    const apiRes = await request.get(`${baseURL}/api/bookmarks/`, {
      headers: { Authorization: `Token ${rawToken}` }
    });
    expect(apiRes.status(), 'API request with token should be 200').toBe(200);
    const body = (await apiRes.json()) as {
      count: number;
      next: string | null;
      previous: string | null;
      results: unknown[];
    };
    expect(body).toHaveProperty('count');
    expect(body).toHaveProperty('next');
    expect(body).toHaveProperty('previous');
    expect(body).toHaveProperty('results');
    expect(Array.isArray(body.results)).toBe(true);
    expect(typeof body.count).toBe('number');
    expect(body.next === null || typeof body.next === 'string').toBe(true);
    expect(body.previous === null || typeof body.previous === 'string').toBe(true);

    // 3. Sanity: the same call without the token should 401.
    const noAuth = await request.get(`${baseURL}/api/bookmarks/`);
    expect(noAuth.status()).toBe(401);

    // 4. Sanity: a Bearer-prefixed header should also work (the auth
    // middleware accepts both Token and Bearer).
    const bearerRes = await request.get(`${baseURL}/api/bookmarks/`, {
      headers: { Authorization: `Bearer ${rawToken}` }
    });
    expect(bearerRes.status(), 'Bearer auth should also work').toBe(200);

    // 5. Revoke the token from the settings page so it doesn't leak.
    // The list of tokens should include our newly created one; revoke
    // it via the form on its row.
    await page.goto('/settings/integrations');
    const row = page.locator('table.tokens tbody tr', { hasText: tokenName });
    await expect(row).toBeVisible();
    // Sanity: before revoke, status reads 'Active' and a Revoke button
    // is present.
    await expect(row).toContainText('Active');
    await expect(row.getByRole('button', { name: 'Revoke' })).toBeVisible();
    await row.getByRole('button', { name: 'Revoke' }).click();
    // After revoke, the row's status flips to 'Revoked' and the Revoke
    // button is gone.
    await expect(row).toContainText('Revoked');
    await expect(row.getByRole('button', { name: 'Revoke' })).toHaveCount(0);

    // 6. The revoked token should now 401.
    const revokedRes = await request.get(`${baseURL}/api/bookmarks/`, {
      headers: { Authorization: `Token ${rawToken}` }
    });
    expect(revokedRes.status(), 'revoked token should be rejected').toBe(401);
  });
});

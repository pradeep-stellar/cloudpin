import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

// Verifies the public sharing surface:
//   - /public/assets/{id} returns the bytes for a publicly-shared
//     asset (bookmark.shared=true AND profile.enablePublicSharing=true).
//   - /public/assets/{id} returns 403 (not 404) for an asset whose
//     bookmark is not shared, or whose profile disables public
//     sharing.
//   - /public/assets/{id} returns 404 for a missing asset id.
//   - The public route never requires a session and never returns a
//     redirect to /login.
test.describe('public asset access at /public/assets/{id}', () => {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const publicUrl = `https://public-${unique}.example.com/`;
  const privateUrl = `https://private-${unique}.example.com/`;
  const payload = new TextEncoder().encode('cloudpin-public-asset-marker').buffer;

  async function createToken(page: Page): Promise<string> {
    await page.goto('/settings/integrations');
    await expect(page.getByRole('heading', { name: 'Integrations' })).toBeVisible();
    const tokenName = `e2e-public-${unique}`;
    await page.locator('input[name="name"]').fill(tokenName);
    await page.getByRole('button', { name: 'Create token' }).click();
    const reveal = page.locator('.reveal');
    await expect(reveal).toBeVisible();
    const raw = (await reveal.locator('pre').textContent())?.trim() ?? '';
    expect(raw).toBeTruthy();
    await reveal.getByRole('button', { name: /saved it/i }).click();
    return raw;
  }

  async function uploadAsset(
    request: APIRequestContext,
    baseURL: string | undefined,
    token: string,
    bookmarkId: number,
    content: ArrayBuffer
  ): Promise<number> {
    // SvelteKit's built-in csrf.checkOrigin rejects multipart POSTs
    // whose Origin doesn't match the request URL origin. Playwright's
    // request.post doesn't set Origin, so we set it explicitly.
    const res = await request.post(`${baseURL}/api/bookmarks/${bookmarkId}/assets/upload/`, {
      headers: {
        Authorization: `Token ${token}`,
        Origin: baseURL ?? 'http://127.0.0.1:8788'
      },
      multipart: {
        file: {
          name: 'marker.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from(content)
        }
      }
    });
    if (res.status() !== 201) {
      const body = await res.text();
      throw new Error(`upload failed: ${res.status()} ${body}`);
    }
    const body = (await res.json()) as { id: number };
    return body.id;
  }

  async function setBookmarkShared(
    request: APIRequestContext,
    baseURL: string | undefined,
    token: string,
    bookmarkId: number,
    shared: boolean
  ): Promise<void> {
    // The /api/bookmarks/:id/ endpoint treats PATCH as a full update
    // (it delegates to PUT), so we first fetch the current record
    // and re-PUT with the desired shared flag.
    const get = await request.get(`${baseURL}/api/bookmarks/${bookmarkId}/`, {
      headers: { Authorization: `Token ${token}` }
    });
    if (get.status() !== 200) {
      throw new Error(`get bookmark failed: ${get.status()} ${await get.text()}`);
    }
    const current = (await get.json()) as {
      url: string;
      title: string;
      description: string;
      notes: string;
      is_archived: boolean;
      unread: boolean;
      shared: boolean;
      tag_names: string[];
    };
    const res = await request.put(`${baseURL}/api/bookmarks/${bookmarkId}/`, {
      headers: { Authorization: `Token ${token}` },
      data: { ...current, shared }
    });
    if (res.status() !== 200) {
      const body = await res.text();
      throw new Error(`put failed: ${res.status()} ${body}`);
    }
  }

  async function setPublicSharing(page: Page, enabled: boolean): Promise<void> {
    await page.goto('/settings#sharing');
    const box = page.locator('input[name="enablePublicSharing"]');
    await expect(box).toBeVisible();
    const checked = await box.isChecked();
    if (checked !== enabled) {
      if (enabled) await box.check();
      else await box.uncheck();
    }
    // The settings form is a long page; submit by clicking the Save
    // button near the top.
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(box).toBeChecked({ checked: enabled });
  }

  async function createSharedBookmark(
    request: APIRequestContext,
    baseURL: string | undefined,
    token: string,
    url: string
  ): Promise<number> {
    const res = await request.post(`${baseURL}/api/bookmarks/`, {
      headers: { Authorization: `Token ${token}` },
      data: { url, title: `Public ${unique}`, shared: true }
    });
    if (res.status() !== 201) {
      const body = await res.text();
      throw new Error(`create failed: ${res.status()} ${body}`);
    }
    const body = (await res.json()) as { id: number };
    return body.id;
  }

  async function createUnsharedBookmark(
    request: APIRequestContext,
    baseURL: string | undefined,
    token: string,
    url: string
  ): Promise<number> {
    const res = await request.post(`${baseURL}/api/bookmarks/`, {
      headers: { Authorization: `Token ${token}` },
      data: { url, title: `Private ${unique}`, shared: false }
    });
    if (res.status() !== 201) {
      const body = await res.text();
      throw new Error(`create failed: ${res.status()} ${body}`);
    }
    const body = (await res.json()) as { id: number };
    return body.id;
  }

  test('publicly-shared asset returns 200 with the bytes', async ({ page, request, baseURL }) => {
    const token = await createToken(page);
    await setPublicSharing(page, true);

    const bookmarkId = await createSharedBookmark(request, baseURL, token, publicUrl);
    const assetId = await uploadAsset(request, baseURL, token, bookmarkId, payload);

    // Hit the public route anonymously (no Authorization header).
    const res = await request.get(`${baseURL}/public/assets/${assetId}/?t=${unique}-shared`);
    expect(res.status()).toBe(200);
    const buf = await res.body();
    expect(new TextDecoder().decode(buf)).toBe('cloudpin-public-asset-marker');
    expect(res.headers()['content-type']).toBe('text/plain');
    expect(res.headers()['content-security-policy']).toBeTruthy();
  });

  test('non-shared asset returns 403', async ({ page, request, baseURL }) => {
    const token = await createToken(page);
    // Public sharing was enabled by the previous test; turn it off so
    // the unshared bookmark is forbidden on both counts (not shared
    // AND public sharing off).
    await setPublicSharing(page, false);

    const bookmarkId = await createUnsharedBookmark(request, baseURL, token, privateUrl);
    const assetId = await uploadAsset(request, baseURL, token, bookmarkId, payload);

    const res = await request.get(`${baseURL}/public/assets/${assetId}/?t=${unique}-unshared`);
    expect(res.status()).toBe(403);
  });

  test('shared asset with public sharing disabled returns 403', async ({
    page,
    request,
    baseURL
  }) => {
    const token = await createToken(page);

    // Public sharing is off by default; create the asset while
    // disabled and confirm 403. The toggle is exercised implicitly
    // by the first test, which sets public sharing on.
    const bookmarkId = await createSharedBookmark(
      request,
      baseURL,
      token,
      `https://public-toggled-${unique}.example.com/`
    );
    const assetId = await uploadAsset(request, baseURL, token, bookmarkId, payload);

    // Use a cache-busting query parameter so Playwright's request
    // context (which respects Cache-Control) does not replay a
    // previous 200 from a different test.
    const res = await request.get(`${baseURL}/public/assets/${assetId}/?t=${unique}-toggled`);
    expect(res.status()).toBe(403);
  });

  test('missing asset id returns 404', async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/public/assets/9999999999/?t=${unique}-missing`);
    expect(res.status()).toBe(404);
  });

  test('shared asset becomes inaccessible when the bookmark is unshared', async ({
    page,
    request,
    baseURL
  }) => {
    const token = await createToken(page);
    // Default state: public sharing is off. Enable it for this test
    // and create a shared asset, then unshare the bookmark and check
    // that the asset is no longer publicly accessible.
    await setPublicSharing(page, true);
    const bookmarkId = await createSharedBookmark(
      request,
      baseURL,
      token,
      `https://public-unshare-${unique}.example.com/`
    );
    const assetId = await uploadAsset(request, baseURL, token, bookmarkId, payload);

    // Sanity: with public sharing on and bookmark shared, the asset
    // is accessible.
    const before = await request.get(
      `${baseURL}/public/assets/${assetId}/?t=${unique}-unshare-before`
    );
    expect(before.status()).toBe(200);

    await setBookmarkShared(request, baseURL, token, bookmarkId, false);

    const after = await request.get(
      `${baseURL}/public/assets/${assetId}/?t=${unique}-unshare-after`
    );
    expect(after.status()).toBe(403);
  });
});

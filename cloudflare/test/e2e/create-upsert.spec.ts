import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

// Verifies the upsert semantics of POST /api/bookmarks/:
//   - When a caller POSTs with just a URL, the server is idempotent:
//     existing record is returned with 200, untouched.
//   - When a caller POSTs with a URL plus any other field (title,
//     description, notes, tag_names, is_archived, unread, shared), the
//     server merges the supplied fields into the existing record and
//     returns 200 with the merged result.
//   - When the URL is new, the server creates the record and returns
//     201.
test.describe('POST /api/bookmarks/ upsert semantics', () => {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const url = `https://upsert-${unique}.example.com/`;
  const altUrl = `https://upsert-alt-${unique}.example.com/`;
  const tagUrl = `https://upsert-tags-${unique}.example.com/`;

  async function createToken(page: Page): Promise<string> {
    await page.goto('/settings/integrations');
    await expect(page.getByRole('heading', { name: 'Integrations' })).toBeVisible();
    const tokenName = `e2e-upsert-${unique}`;
    await page.locator('input[name="name"]').fill(tokenName);
    await page.getByRole('button', { name: 'Create token' }).click();
    const reveal = page.locator('.reveal');
    await expect(reveal).toBeVisible();
    const raw = (await reveal.locator('pre').textContent())?.trim() ?? '';
    expect(raw).toBeTruthy();
    await reveal.getByRole('button', { name: /saved it/i }).click();
    return raw;
  }

  async function authedRequest(
    request: APIRequestContext,
    baseURL: string | undefined,
    token: string
  ) {
    return {
      post: (path: string, data: unknown) =>
        request.post(`${baseURL}${path}`, {
          headers: { Authorization: `Token ${token}` },
          data
        }),
      get: (path: string) =>
        request.get(`${baseURL}${path}`, {
          headers: { Authorization: `Token ${token}` }
        })
    };
  }

  test('first POST creates (201), repeat with extra fields upserts (200)', async ({
    page,
    request,
    baseURL
  }) => {
    const token = await createToken(page);
    const api = await authedRequest(request, baseURL, token);

    // 1. First POST creates the bookmark and returns 201.
    const first = await api.post('/api/bookmarks/', {
      url,
      title: 'Original title',
      description: 'Original desc'
    });
    expect(first.status()).toBe(201);
    const firstBody = (await first.json()) as {
      id: number;
      title: string;
      description: string;
    };
    expect(firstBody.title).toBe('Original title');
    expect(firstBody.description).toBe('Original desc');

    // 2. Repeat POST with the same URL but new title + description.
    //    This is an upsert and should return 200.
    const second = await api.post('/api/bookmarks/', {
      url,
      title: 'Updated title',
      description: 'Updated desc'
    });
    expect(second.status()).toBe(200);
    const secondBody = (await second.json()) as {
      id: number;
      title: string;
      description: string;
    };
    expect(secondBody.id).toBe(firstBody.id);
    expect(secondBody.title).toBe('Updated title');
    expect(secondBody.description).toBe('Updated desc');
  });

  test('idempotent POST with just a URL does not overwrite fields', async ({
    page,
    request,
    baseURL
  }) => {
    const token = await createToken(page);
    const api = await authedRequest(request, baseURL, token);

    // Create with a title.
    const created = await api.post('/api/bookmarks/', {
      url: altUrl,
      title: 'Keep me'
    });
    expect(created.status()).toBe(201);
    const createdId = ((await created.json()) as { id: number }).id;

    // POST the same URL with no other fields. shouldUpsertCreateRequest
    // returns false (only `url` is present), so the existing record is
    // returned untouched.
    const idempotent = await api.post('/api/bookmarks/', { url: altUrl });
    expect(idempotent.status()).toBe(200);
    const idempotentBody = (await idempotent.json()) as { id: number; title: string };
    expect(idempotentBody.id).toBe(createdId);
    expect(idempotentBody.title).toBe('Keep me');
  });

  test('upsert replaces tag_names when provided as an empty array', async ({
    page,
    request,
    baseURL
  }) => {
    const token = await createToken(page);
    const api = await authedRequest(request, baseURL, token);

    // Create with one tag.
    const created = await api.post('/api/bookmarks/', {
      url: tagUrl,
      title: 'Tagged',
      tag_names: ['initial']
    });
    expect(created.status()).toBe(201);

    // Upsert with explicit empty tag_names: this should clear the tags.
    const cleared = await api.post('/api/bookmarks/', {
      url: tagUrl,
      title: 'Tagged',
      tag_names: []
    });
    expect(cleared.status()).toBe(200);
    const clearedBody = (await cleared.json()) as { tag_names: string[] };
    expect(clearedBody.tag_names).toEqual([]);
  });
});

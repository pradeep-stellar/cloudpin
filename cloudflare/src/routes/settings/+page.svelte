<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  const p = $derived(data.profile);
</script>

<svelte:head>
  <title>Settings · cloudpin</title>
</svelte:head>

<aside class="side">
  <ul>
    <li><a href="/settings" class="active">General</a></li>
    <li><a href="/settings/integrations">Integrations</a></li>
    <li><a href="/settings/import-export">Import &amp; export</a></li>
  </ul>
</aside>

<section class="main">
  <h1>General settings</h1>

  {#if form?.ok}
    <p class="ok">Saved at {form.savedAt}</p>
  {/if}

  <form method="POST" use:enhance>
    <h2 id="display">Display</h2>
    <label>
      <span>Theme</span>
      <select name="theme">
        {#each ['auto', 'light', 'dark'] as v (v)}
          <option value={v} selected={p?.theme === v}>{v}</option>
        {/each}
      </select>
    </label>
    <label>
      <span>Bookmark date display</span>
      <select name="bookmarkDateDisplay">
        {#each ['relative', 'absolute'] as v (v)}
          <option value={v} selected={p?.bookmarkDateDisplay === v}>{v}</option>
        {/each}
      </select>
    </label>
    <label>
      <span>Bookmark description display</span>
      <select name="bookmarkDescriptionDisplay">
        {#each ['inline', 'separate'] as v (v)}
          <option value={v} selected={p?.bookmarkDescriptionDisplay === v}>{v}</option>
        {/each}
      </select>
    </label>
    <label>
      <span>Max description lines</span>
      <input
        type="number"
        name="bookmarkDescriptionMaxLines"
        min="1"
        max="20"
        value={p?.bookmarkDescriptionMaxLines ?? 1}
      />
    </label>
    <label>
      <span>Bookmark link target</span>
      <select name="bookmarkLinkTarget">
        {#each ['_blank', '_self'] as v (v)}
          <option value={v} selected={p?.bookmarkLinkTarget === v}>{v}</option>
        {/each}
      </select>
    </label>
    <label>
      <span>Items per page</span>
      <input type="number" name="itemsPerPage" min="10" max="500" value={p?.itemsPerPage ?? 30} />
    </label>

    <h2 id="sharing">Sharing &amp; tags</h2>
    <label class="check">
      <input type="checkbox" name="enableSharing" checked={p?.enableSharing ?? false} />
      <span>Enable sharing UI</span>
    </label>
    <label class="check">
      <input type="checkbox" name="enablePublicSharing" checked={p?.enablePublicSharing ?? false} />
      <span>Enable public sharing (feeds/assets)</span>
    </label>
    <label>
      <span>Tag search</span>
      <select name="tagSearch">
        {#each ['strict', 'lax'] as v (v)}
          <option value={v} selected={p?.tagSearch === v}>{v}</option>
        {/each}
      </select>
    </label>
    <label>
      <span>Tag grouping</span>
      <select name="tagGrouping">
        {#each ['alphabetical', 'count'] as v (v)}
          <option value={v} selected={p?.tagGrouping === v}>{v}</option>
        {/each}
      </select>
    </label>
    <label>
      <span>Web archive integration</span>
      <select name="webArchiveIntegration">
        {#each ['disabled', 'enabled'] as v (v)}
          <option value={v} selected={p?.webArchiveIntegration === v}>{v}</option>
        {/each}
      </select>
    </label>

    <h2 id="advanced">Advanced</h2>
    <label class="check">
      <input type="checkbox" name="displayUrl" checked={p?.displayUrl ?? false} />
      <span>Show URL on bookmark cards</span>
    </label>
    <label class="check">
      <input
        type="checkbox"
        name="displayViewBookmarkAction"
        checked={p?.displayViewBookmarkAction ?? true}
      />
      <span>Show view action</span>
    </label>
    <label class="check">
      <input
        type="checkbox"
        name="displayEditBookmarkAction"
        checked={p?.displayEditBookmarkAction ?? true}
      />
      <span>Show edit action</span>
    </label>
    <label class="check">
      <input
        type="checkbox"
        name="displayArchiveBookmarkAction"
        checked={p?.displayArchiveBookmarkAction ?? true}
      />
      <span>Show archive action</span>
    </label>
    <label class="check">
      <input
        type="checkbox"
        name="displayRemoveBookmarkAction"
        checked={p?.displayRemoveBookmarkAction ?? true}
      />
      <span>Show remove action</span>
    </label>
    <label class="check">
      <input type="checkbox" name="enableFavicons" checked={p?.enableFavicons ?? false} />
      <span>Show favicons</span>
    </label>
    <label class="check">
      <input type="checkbox" name="enablePreviewImages" checked={p?.enablePreviewImages ?? false} />
      <span>Show preview images</span>
    </label>
    <label class="check">
      <input
        type="checkbox"
        name="enableAutomaticHtmlSnapshots"
        checked={p?.enableAutomaticHtmlSnapshots ?? true}
      />
      <span>Create HTML snapshots automatically</span>
    </label>
    <label class="check">
      <input type="checkbox" name="defaultMarkUnread" checked={p?.defaultMarkUnread ?? false} />
      <span>Default new bookmarks to unread</span>
    </label>
    <label class="check">
      <input type="checkbox" name="defaultMarkShared" checked={p?.defaultMarkShared ?? false} />
      <span>Default new bookmarks to shared</span>
    </label>
    <label class="check">
      <input type="checkbox" name="stickyPagination" checked={p?.stickyPagination ?? false} />
      <span>Sticky pagination</span>
    </label>
    <label class="check">
      <input type="checkbox" name="collapseSidePanel" checked={p?.collapseSidePanel ?? false} />
      <span>Collapse side panel by default</span>
    </label>
    <label class="check">
      <input type="checkbox" name="hideBundles" checked={p?.hideBundles ?? false} />
      <span>Hide bundles nav</span>
    </label>
    <label class="check">
      <input type="checkbox" name="legacySearch" checked={p?.legacySearch ?? false} />
      <span>Use legacy search</span>
    </label>
    <label class="check">
      <input type="checkbox" name="permanentNotes" checked={p?.permanentNotes ?? false} />
      <span>Always show notes</span>
    </label>

    <label>
      <span>Custom CSS</span>
      <textarea name="customCss" rows="6">{p?.customCss ?? ''}</textarea>
    </label>

    <div class="actions">
      <button class="btn btn-primary" type="submit">Save</button>
    </div>
  </form>
</section>

<style>
  :global(.layout):has(.side) {
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: 20px;
  }
  .side {
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px 0;
    height: fit-content;
  }
  .side ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .side a {
    display: block;
    padding: 8px 14px;
    color: var(--fg);
  }
  .side a.active {
    background: #eef2ff;
    color: var(--fg);
  }
  .main {
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px 24px;
  }
  h1 {
    margin: 0 0 16px;
    font-size: 20px;
  }
  h2 {
    margin: 24px 0 12px;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fg-muted);
  }
  .ok {
    color: var(--success);
    margin: 0 0 12px;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  label > span {
    font-size: 12px;
    color: var(--fg-muted);
  }
  label.check {
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }
  label.check input {
    width: auto;
  }
  label.check span {
    color: var(--fg);
    font-size: 14px;
  }
  .actions {
    margin-top: 12px;
  }
  textarea {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
  }
</style>

<script lang="ts">
  let result = $state<{
    ok: boolean;
    created?: number;
    updated?: number;
    failed?: number;
    total?: number;
    error?: string;
  } | null>(null);
  let busy = $state(false);

  async function uploadImport(e: SubmitEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    busy = true;
    result = null;
    try {
      const res = await fetch('/settings/import', { method: 'POST', body: fd });
      result = await res.json();
    } catch (err) {
      result = { ok: false, error: (err as Error).message };
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head>
  <title>Import &amp; export · cloudpin</title>
</svelte:head>

<aside class="side">
  <ul>
    <li><a href="/settings">General</a></li>
    <li><a href="/settings/integrations">Integrations</a></li>
    <li><a href="/settings/import-export" class="active">Import &amp; export</a></li>
  </ul>
</aside>

<section class="main">
  <h1>Import &amp; export</h1>

  <h2>Export</h2>
  <p>
    Download all your bookmarks as a Netscape-format HTML file. You can use this to migrate to other
    tools or back up.
  </p>
  <a class="btn btn-primary" href="/settings/export">Download bookmarks.html</a>

  <h2>Import</h2>
  <p>
    Upload a Netscape-format HTML file. Existing URLs are kept as-is; new URLs create bookmarks with
    the original title, description, notes, tags, archived state, and date added.
  </p>

  <form onsubmit={uploadImport}>
    <label>
      <span>HTML file</span>
      <input type="file" name="file" accept=".html,text/html" required />
    </label>
    <div class="actions">
      <button class="btn btn-primary" type="submit" disabled={busy}>
        {busy ? 'Importing…' : 'Import'}
      </button>
    </div>
  </form>

  {#if result}
    {#if result.ok}
      <p class="ok">
        Imported {result.created} new, kept {result.updated} existing
        {#if result.failed && result.failed > 0}({result.failed} failed){/if}
        of {result.total} entries.
      </p>
    {:else}
      <p class="err">Import failed: {result.error ?? 'unknown error'}</p>
    {/if}
  {/if}
</section>

<style>
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
    margin: 24px 0 8px;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fg-muted);
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 520px;
    margin-top: 8px;
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
  .ok {
    color: var(--success);
  }
  .err {
    color: var(--danger);
  }
  .actions {
    display: flex;
    gap: 8px;
  }
</style>

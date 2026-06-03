<script lang="ts">
  import { enhance } from '$app/forms';
  import CsrfInput from '$lib/components/CsrfInput.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const b = $derived(data.bundle);
</script>

<svelte:head>
  <title>Edit · {b.name} · cloudpin</title>
</svelte:head>

<a class="back" href="/bundles">← Back</a>
<h1>Edit bundle</h1>

<div class="actions">
  <a class="btn" href={`/bookmarks?bundle=${b.id}`}>Preview</a>
  <form method="POST" action="?/delete" use:enhance class="inline">
    <CsrfInput token={data.csrfToken} />
    <button
      class="btn danger"
      type="submit"
      onclick={(e) => {
        if (!confirm(`Delete bundle "${b.name}"?`)) e.preventDefault();
      }}
    >
      Delete
    </button>
  </form>
</div>

<form method="POST" action="?/update" use:enhance>
  <CsrfInput token={data.csrfToken} />
  <label>
    <span>Name</span>
    <input type="text" name="name" required value={b.name} />
  </label>
  <label>
    <span>Search</span>
    <input type="text" name="search" value={b.search} />
  </label>
  <label>
    <span>Any of these tags (comma-separated)</span>
    <input type="text" name="any_tags" value={b.any_tags} />
  </label>
  <label>
    <span>All of these tags (comma-separated)</span>
    <input type="text" name="all_tags" value={b.all_tags} />
  </label>
  <label>
    <span>Excluded tags (comma-separated)</span>
    <input type="text" name="excluded_tags" value={b.excluded_tags} />
  </label>
  <label>
    <span>Filter unread</span>
    <select name="filter_unread">
      <option value="off" selected={b.filter_unread === 'off'}>Off</option>
      <option value="yes" selected={b.filter_unread === 'yes'}>Yes only</option>
      <option value="no" selected={b.filter_unread === 'no'}>No only</option>
    </select>
  </label>
  <label>
    <span>Filter shared</span>
    <select name="filter_shared">
      <option value="off" selected={b.filter_shared === 'off'}>Off</option>
      <option value="yes" selected={b.filter_shared === 'yes'}>Yes only</option>
      <option value="no" selected={b.filter_shared === 'no'}>No only</option>
    </select>
  </label>
  <div class="form-actions">
    <button class="btn btn-primary" type="submit">Save</button>
    <a class="btn" href="/bundles">Cancel</a>
  </div>
</form>

<style>
  .back {
    color: var(--fg-muted);
    font-size: 13px;
  }
  h1 {
    margin: 6px 0 16px;
    font-size: 20px;
  }
  .actions {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }
  .actions form {
    margin: 0;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 520px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  label span {
    font-size: 12px;
    color: var(--fg-muted);
  }
  input,
  select {
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
    color: var(--fg);
  }
  .form-actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }
  .btn.danger {
    background: var(--danger);
    color: white;
  }
</style>

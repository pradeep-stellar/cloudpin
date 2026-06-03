<script lang="ts">
  import { enhance } from '$app/forms';
  import CsrfInput from '$lib/components/CsrfInput.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>New bundle · cloudpin</title>
</svelte:head>

<a class="back" href="/bundles">← Back</a>
<h1>New bundle</h1>

<form method="POST" use:enhance>
  <CsrfInput token={data.csrfToken} />
  <label>
    <span>Name</span>
    <input type="text" name="name" required placeholder="e.g. Reading list" />
  </label>
  <label>
    <span>Search</span>
    <input type="text" name="search" placeholder="title/url/notes text" />
  </label>
  <label>
    <span>Any of these tags (comma-separated)</span>
    <input type="text" name="any_tags" placeholder="e.g. js, typescript" />
  </label>
  <label>
    <span>All of these tags (comma-separated)</span>
    <input type="text" name="all_tags" />
  </label>
  <label>
    <span>Excluded tags (comma-separated)</span>
    <input type="text" name="excluded_tags" />
  </label>
  <label>
    <span>Filter unread</span>
    <select name="filter_unread">
      <option value="off">Off</option>
      <option value="yes">Yes only</option>
      <option value="no">No only</option>
    </select>
  </label>
  <label>
    <span>Filter shared</span>
    <select name="filter_shared">
      <option value="off">Off</option>
      <option value="yes">Yes only</option>
      <option value="no">No only</option>
    </select>
  </label>
  <div class="actions">
    <button class="btn btn-primary" type="submit">Create</button>
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
  .actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }
</style>

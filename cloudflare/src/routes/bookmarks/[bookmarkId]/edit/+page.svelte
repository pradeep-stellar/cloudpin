<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  const b = $derived(data.bookmark);
</script>

<svelte:head>
  <title>Edit · {b.title || b.url}</title>
</svelte:head>

<a class="back" href={`/bookmarks/${b.id}/details`}>← Details</a>
<h1>Edit bookmark</h1>

<form method="POST" use:enhance class="form">
  <label>
    <span>URL *</span>
    <input type="url" name="url" required value={b.url} />
  </label>
  <label>
    <span>Title</span>
    <input type="text" name="title" value={b.title} maxlength="512" />
  </label>
  <label>
    <span>Description</span>
    <textarea name="description" rows="3">{b.description}</textarea>
  </label>
  <label>
    <span>Notes</span>
    <textarea name="notes" rows="5">{b.notes}</textarea>
  </label>
  <label>
    <span>Tags</span>
    <input type="text" name="tag_names" value={b.tag_names.join(' ')} />
  </label>
  <fieldset class="checks">
    <label class="check">
      <input type="checkbox" name="unread" checked={b.unread} />
      <span>Unread</span>
    </label>
    <label class="check">
      <input type="checkbox" name="shared" checked={b.shared} />
      <span>Shared</span>
    </label>
    <label class="check">
      <input type="checkbox" name="is_archived" checked={b.is_archived} />
      <span>Archived</span>
    </label>
  </fieldset>

  {#if form?.error}
    <p class="error">
      {#if form.error === 'duplicate_url'}Another bookmark already uses this URL.{:else}{form.error}{/if}
    </p>
  {/if}

  <div class="actions">
    <button class="btn btn-primary" type="submit">Save</button>
    <a class="btn" href={`/bookmarks/${b.id}/details`}>Cancel</a>
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
  .form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 640px;
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  label > span {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fg-muted);
  }
  .checks {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .check {
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }
  .check input {
    width: auto;
  }
  .error {
    color: var(--danger);
    margin: 0;
  }
  .actions {
    display: flex;
    gap: 8px;
  }
</style>

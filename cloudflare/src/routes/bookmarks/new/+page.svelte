<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
  <title>New bookmark · cloudpin</title>
</svelte:head>

<a class="back" href="/bookmarks">← Back</a>

<h1>New bookmark</h1>

<form method="POST" use:enhance class="form">
  <label>
    <span>URL *</span>
    <input
      type="url"
      name="url"
      required
      placeholder="https://example.com/article"
      value={form?.values?.url ?? ''}
    />
  </label>
  <label>
    <span>Title</span>
    <input
      type="text"
      name="title"
      maxlength="512"
      placeholder="Optional"
      value={form?.values?.title ?? ''}
    />
  </label>
  <label>
    <span>Description</span>
    <textarea name="description" rows="3" placeholder="Optional summary"
      >{form?.values?.description ?? ''}</textarea
    >
  </label>
  <label>
    <span>Notes</span>
    <textarea name="notes" rows="5" placeholder="Markdown supported"
      >{form?.values?.notes ?? ''}</textarea
    >
  </label>
  <label>
    <span>Tags</span>
    <input
      type="text"
      name="tag_names"
      placeholder="space-separated, e.g. rust web-dev"
      value={form?.values?.tag_names?.join(' ') ?? ''}
    />
  </label>
  <fieldset class="checks">
    <label class="check">
      <input type="checkbox" name="unread" checked={form?.values?.unread ?? false} />
      <span>Mark as unread</span>
    </label>
    <label class="check">
      <input type="checkbox" name="shared" checked={form?.values?.shared ?? false} />
      <span>Share publicly</span>
    </label>
    <label class="check">
      <input type="checkbox" name="is_archived" checked={form?.values?.is_archived ?? false} />
      <span>Archive immediately</span>
    </label>
  </fieldset>

  {#if form?.error}
    <p class="error">{form.error}</p>
  {/if}

  <div class="actions">
    <button type="submit" class="btn btn-primary">Save bookmark</button>
    <a class="btn" href="/bookmarks">Cancel</a>
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
    margin-top: 4px;
  }
</style>

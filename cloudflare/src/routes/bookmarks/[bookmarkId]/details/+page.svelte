<script lang="ts">
  import { enhance } from '$app/forms';
  import CsrfInput from '$lib/components/CsrfInput.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const b = $derived(data.bookmark);
</script>

<svelte:head>
  <title>{b.title || b.url} · cloudpin</title>
</svelte:head>

<a class="back" href="/bookmarks">← All bookmarks</a>

<article class="details">
  <header>
    <h1>{b.title || b.url}</h1>
    <a class="url" href={b.url} target="_blank" rel="noopener noreferrer">{data.displayHost}</a>
    <div class="meta">
      Added {new Date(b.date_added).toLocaleString()} · Updated {new Date(
        b.date_modified
      ).toLocaleString()}
    </div>
  </header>

  {#if b.description}
    <section>
      <h2>Description</h2>
      <p>{b.description}</p>
    </section>
  {/if}

  {#if b.notes}
    <section>
      <h2>Notes</h2>
      <pre class="notes">{b.notes}</pre>
    </section>
  {/if}

  {#if b.tag_names.length > 0}
    <section>
      <h2>Tags</h2>
      <ul class="tags">
        {#each b.tag_names as t (t)}
          <li><a href={`/bookmarks?tag=${encodeURIComponent(t)}`}>#{t}</a></li>
        {/each}
      </ul>
    </section>
  {/if}

  <section>
    <h2>Status</h2>
    <ul class="status">
      <li><strong>Unread:</strong> {b.unread ? 'yes' : 'no'}</li>
      <li><strong>Shared:</strong> {b.shared ? 'yes' : 'no'}</li>
      <li><strong>Archived:</strong> {b.is_archived ? 'yes' : 'no'}</li>
    </ul>
  </section>

  <footer class="actions">
    <a class="btn btn-primary" href={`/bookmarks/${b.id}/edit`}>Edit</a>
    <form method="POST" action="?/toggleArchive" use:enhance>
      <CsrfInput token={data.csrfToken} />
      <input type="hidden" name="id" value={b.id} />
      <input type="hidden" name="archive" value={b.is_archived ? 'false' : 'true'} />
      <button class="btn" type="submit">{b.is_archived ? 'Unarchive' : 'Archive'}</button>
    </form>
    <form method="POST" action="?/delete" use:enhance>
      <CsrfInput token={data.csrfToken} />
      <input type="hidden" name="id" value={b.id} />
      <button
        class="btn btn-danger"
        type="submit"
        onclick={(e) => {
          if (!confirm('Delete this bookmark?')) e.preventDefault();
        }}
      >
        Delete
      </button>
    </form>
  </footer>
</article>

<style>
  .back {
    color: var(--fg-muted);
    font-size: 13px;
  }
  .details {
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 760px;
  }
  h1 {
    margin: 0 0 4px;
    font-size: 20px;
  }
  .url {
    color: var(--fg-muted);
    font-size: 13px;
    word-break: break-all;
  }
  .meta {
    color: var(--fg-muted);
    font-size: 12px;
    margin-top: 4px;
  }
  h2 {
    margin: 0 0 6px;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fg-muted);
  }
  section p {
    margin: 0;
    white-space: pre-wrap;
  }
  .notes {
    margin: 0;
    background: var(--code-bg);
    border-radius: 4px;
    padding: 8px 10px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .tags {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .tags a {
    background: var(--tag-bg);
    color: var(--tag-fg);
    padding: 3px 9px;
    border-radius: 999px;
  }
  .status {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .actions {
    display: flex;
    gap: 8px;
    border-top: 1px solid var(--border);
    padding-top: 12px;
  }
  .actions form {
    display: inline;
  }
</style>

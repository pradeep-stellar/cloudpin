<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let renameValue = $state('');
  let mergeTarget = $state('');
</script>

<svelte:head>
  <title>Tags · cloudpin</title>
</svelte:head>

<a class="back" href="/bookmarks">← Back</a>
<h1>Tags</h1>
<p class="meta">{data.total} tags</p>

<div class="layout">
  <section>
    <h3>Browse</h3>
    <ul class="tag-list">
      {#each data.tags as t (t.id)}
        <li class:active={data.tagFilter === t.name}>
          <a href={`/tags?tag=${encodeURIComponent(t.name)}`}>#{t.name}</a>
          <span class="count">{t.bookmark_count ?? 0}</span>
        </li>
      {/each}
    </ul>
  </section>

  {#if data.tagFilter}
    <section>
      <h3>#{data.tagFilter}</h3>
      <p>
        <a class="btn" href={`/bookmarks?tag=${encodeURIComponent(data.tagFilter)}`}>
          View bookmarks
        </a>
      </p>

      <details>
        <summary>Rename</summary>
        <form method="POST" action="?/rename">
          <input type="hidden" name="id" value={data.tagRow?.id ?? ''} />
          <input type="text" name="name" placeholder="New name" bind:value={renameValue} required />
          <button class="btn" type="submit">Rename</button>
        </form>
      </details>

      <details>
        <summary>Merge into…</summary>
        <form method="POST" action="?/merge">
          <input type="hidden" name="sourceId" value={data.tagRow?.id ?? ''} />
          <input
            type="text"
            name="targetName"
            placeholder="Target tag name"
            bind:value={mergeTarget}
            required
          />
          <button class="btn" type="submit">Merge</button>
        </form>
      </details>

      <details>
        <summary>Delete</summary>
        <form method="POST" action="?/delete">
          <input type="hidden" name="id" value={data.tagRow?.id ?? ''} />
          <button class="btn danger" type="submit">Delete tag</button>
        </form>
      </details>
    </section>
  {/if}
</div>

<style>
  .back {
    color: var(--fg-muted);
    font-size: 13px;
  }
  h1 {
    margin: 6px 0 4px;
    font-size: 20px;
  }
  .meta {
    color: var(--fg-muted);
    font-size: 13px;
    margin: 0 0 16px;
  }
  .layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  @media (max-width: 720px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
  section {
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px 14px;
  }
  h3 {
    margin: 0 0 8px;
    font-size: 13px;
  }
  .tag-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .tag-list li {
    display: flex;
    justify-content: space-between;
    padding: 4px 8px;
    border-radius: 4px;
  }
  .tag-list li.active {
    background: var(--tag-bg);
  }
  .count {
    color: var(--fg-muted);
    font-size: 12px;
  }
  details {
    margin-top: 10px;
  }
  summary {
    cursor: pointer;
    color: var(--fg-muted);
    padding: 4px 0;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 6px;
  }
  input[type='text'] {
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
    color: var(--fg);
  }
  .btn.danger {
    background: var(--danger);
    color: white;
  }
</style>

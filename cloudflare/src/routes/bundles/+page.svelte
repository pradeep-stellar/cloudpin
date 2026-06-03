<script lang="ts">
  import CsrfInput from '$lib/components/CsrfInput.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Bundles · cloudpin</title>
</svelte:head>

<header class="bar">
  <h2>Bundles</h2>
  <a class="btn btn-primary" href="/bundles/new">+ New bundle</a>
</header>

{#if data.bundles.length === 0}
  <div class="empty">
    <p>No bundles yet.</p>
    <a class="btn btn-primary" href="/bundles/new">Create your first bundle</a>
  </div>
{:else}
  <ul class="bundle-list">
    {#each data.bundles as b (b.id)}
      <li>
        <a href={`/bundles/${b.id}/edit`}>{b.name}</a>
        <span class="meta">
          {#if b.search}search: <code>{b.search}</code>{/if}
          {#if b.any_tags}any: <code>{b.any_tags}</code>{/if}
          {#if b.all_tags}all: <code>{b.all_tags}</code>{/if}
          {#if b.excluded_tags}exclude: <code>{b.excluded_tags}</code>{/if}
        </span>
        <form method="POST" action="?/delete" class="del">
          <CsrfInput token={data.csrfToken} />
          <input type="hidden" name="id" value={b.id} />
          <button
            class="btn"
            type="submit"
            onclick={(e) => {
              if (!confirm(`Delete bundle "${b.name}"?`)) e.preventDefault();
            }}
          >
            Delete
          </button>
        </form>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }
  .bar h2 {
    margin: 0;
    flex: 1;
    font-size: 18px;
  }
  .empty {
    background: var(--bg-elev);
    border: 1px dashed var(--border);
    border-radius: var(--radius);
    padding: 24px;
    text-align: center;
    color: var(--fg-muted);
  }
  .bundle-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .bundle-list li {
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px 14px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .bundle-list a {
    font-weight: 500;
  }
  .meta {
    flex: 1;
    color: var(--fg-muted);
    font-size: 12px;
  }
  .meta code {
    margin: 0 4px;
  }
  .del {
    margin: 0;
  }
</style>

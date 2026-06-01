<script lang="ts">
  import BookmarkCard from '$lib/components/BookmarkCard.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const totalPages = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)));
</script>

<svelte:head>
  <title>{data.bundle.name} · cloudpin</title>
</svelte:head>

<header class="bar">
  <h2>{data.bundle.name}</h2>
  <a class="btn" href={`/bundles/${data.bundle.id}/edit`}>Edit</a>
  <a class="btn" href="/bundles">← All bundles</a>
</header>
<p class="meta">{data.total} matching · page {data.page} of {totalPages}</p>

{#if data.bookmarks.length === 0}
  <div class="empty"><p>No bookmarks match this bundle.</p></div>
{:else}
  <div class="cards">
    {#each data.bookmarks as b (b.id)}
      <BookmarkCard bookmark={b} onTagClick={() => {}} />
    {/each}
  </div>
{/if}

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .bar h2 {
    margin: 0;
    flex: 1;
    font-size: 18px;
  }
  .meta {
    color: var(--fg-muted);
    font-size: 13px;
    margin: 4px 0 12px;
  }
  .cards {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .empty {
    background: var(--bg-elev);
    border: 1px dashed var(--border);
    border-radius: var(--radius);
    padding: 24px;
    text-align: center;
    color: var(--fg-muted);
  }
</style>

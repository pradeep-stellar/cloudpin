<script lang="ts">
  import BookmarkCard from '$lib/components/BookmarkCard.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const totalPages = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)));
</script>

<svelte:head>
  <title>Archived · cloudpin</title>
</svelte:head>

<header class="bar">
  <h2>Archived</h2>
  <div class="meta">{data.total} archived · page {data.page} of {totalPages}</div>
  <a class="btn" href="/bookmarks">← Active</a>
</header>

{#if data.bookmarks.length === 0}
  <div class="empty"><p>Nothing archived.</p></div>
{:else}
  <div class="cards">
    {#each data.bookmarks as b (b.id)}
      <BookmarkCard bookmark={b} />
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
    font-size: 12px;
  }
  .cards {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 12px;
  }
  .empty {
    background: var(--bg-elev);
    border: 1px dashed var(--border);
    border-radius: var(--radius);
    padding: 24px;
    text-align: center;
    color: var(--fg-muted);
    margin-top: 12px;
  }
</style>

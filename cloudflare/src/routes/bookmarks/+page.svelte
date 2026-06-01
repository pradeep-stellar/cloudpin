<script lang="ts">
  import BookmarkCard from '$lib/components/BookmarkCard.svelte';
  import TagCloud from '$lib/components/TagCloud.svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const totalPages = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)));

  function applySearch(e: SubmitEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const q = (form.elements.namedItem('q') as HTMLInputElement)?.value ?? '';
    const tag = (form.elements.namedItem('tag') as HTMLInputElement)?.value ?? '';
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (tag) params.set('tag', tag);
    params.set('page', '1');
    goto(`/bookmarks?${params.toString()}`);
  }

  function selectTag(tag: string | null) {
    const params = new URLSearchParams($page.url.searchParams);
    if (tag) {
      params.set('tag', tag);
    } else {
      params.delete('tag');
    }
    params.set('page', '1');
    goto(`/bookmarks?${params.toString()}`);
  }

  function gotoPage(p: number) {
    const params = new URLSearchParams($page.url.searchParams);
    params.set('page', String(p));
    goto(`/bookmarks?${params.toString()}`);
  }
</script>

<svelte:head>
  <title>Bookmarks · cloudpin</title>
</svelte:head>

<div class="layout">
  <aside class="side">
    <section>
      <h3>Search</h3>
      <form onsubmit={applySearch}>
        <input
          type="search"
          name="q"
          placeholder="title, url, notes, #tag, !unread"
          value={data.q}
        />
        {#if data.tagFilter}
          <input type="hidden" name="tag" value={data.tagFilter} />
        {/if}
        <div class="row">
          <button type="submit" class="btn btn-primary">Search</button>
          {#if data.q || data.tagFilter}
            <a class="btn" href="/bookmarks">Clear</a>
          {/if}
        </div>
      </form>
    </section>
    <section>
      <h3>Tags</h3>
      <TagCloud tags={data.tags} selected={data.tagFilter} onSelect={selectTag} />
    </section>
  </aside>

  <section class="main">
    <header class="bar">
      <h2>All bookmarks</h2>
      <div class="meta">
        {data.total} total · page {data.page} of {totalPages}
      </div>
      <a class="btn btn-primary" href="/bookmarks/new">+ New</a>
    </header>

    {#if data.bookmarks.length === 0}
      <div class="empty">
        <p>No bookmarks yet.</p>
        <a class="btn btn-primary" href="/bookmarks/new">Add your first bookmark</a>
      </div>
    {:else}
      <div class="cards">
        {#each data.bookmarks as b (b.id)}
          <BookmarkCard bookmark={b} onTagClick={(t) => selectTag(t)} />
        {/each}
      </div>

      <nav class="pager">
        {#if data.page > 1}
          <button class="btn" onclick={() => gotoPage(data.page - 1)}>← Previous</button>
        {/if}
        {#if data.page < totalPages}
          <button class="btn" onclick={() => gotoPage(data.page + 1)}>Next →</button>
        {/if}
      </nav>
    {/if}
  </section>
</div>

<style>
  .layout {
    display: grid;
    grid-template-columns: 240px 1fr;
    gap: 20px;
  }
  @media (max-width: 720px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .side section {
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px 14px;
  }
  .side h3 {
    margin: 0 0 8px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fg-muted);
  }
  .row {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }
  .main {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
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
  }
  .empty {
    background: var(--bg-elev);
    border: 1px dashed var(--border);
    border-radius: var(--radius);
    padding: 24px;
    text-align: center;
    color: var(--fg-muted);
  }
  .pager {
    display: flex;
    justify-content: space-between;
    margin-top: 8px;
  }
</style>

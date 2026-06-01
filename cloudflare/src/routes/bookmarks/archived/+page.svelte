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
  <form method="POST" action="?/bulkAction" class="bulk-form">
    <div class="bulk-bar">
      <label class="bulk-label">
        <span>Action:</span>
        <select name="action" required>
          <option value="">— choose —</option>
          <option value="unarchive">Unarchive</option>
          <option value="delete">Delete</option>
          <option value="markRead">Mark as read</option>
          <option value="markUnread">Mark as unread</option>
          <option value="share">Share</option>
          <option value="unshare">Unshare</option>
          <option value="addTag">Add tag…</option>
          <option value="removeTag">Remove tag…</option>
        </select>
      </label>
      <input type="text" name="tag" placeholder="tag name (for add/remove)" class="tag-input" />
      <button type="submit" class="btn">Apply</button>
    </div>
    <div class="cards">
      {#each data.bookmarks as b (b.id)}
        <BookmarkCard bookmark={b} />
      {/each}
    </div>
  </form>
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
  .bulk-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 12px;
  }
  .bulk-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 8px 12px;
  }
  .bulk-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }
  .tag-input {
    flex: 1;
    min-width: 120px;
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
    color: var(--fg);
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
    margin-top: 12px;
  }
</style>

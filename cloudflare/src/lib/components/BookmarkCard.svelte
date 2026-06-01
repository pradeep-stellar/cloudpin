<script lang="ts">
  import { displayUrl } from '$lib/../domain/url-normalize';

  type Bookmark = {
    id: number;
    url: string;
    title: string;
    description: string;
    notes: string;
    tag_names: string[];
    is_archived: boolean;
    unread: boolean;
    shared: boolean;
    date_added: string;
    date_modified: string;
  };

  type Props = {
    bookmark: Bookmark;
    onTagClick?: (tag: string) => void;
    canEdit?: boolean;
  };

  let { bookmark, onTagClick, canEdit = true }: Props = $props();

  const displayTitle = $derived(bookmark.title || bookmark.url);
  const displayHost = $derived(displayUrl(bookmark.url));
  const hasNotes = $derived(bookmark.notes && bookmark.notes.trim() !== '');
  const hasDescription = $derived(bookmark.description && bookmark.description.trim() !== '');
</script>

<article class="card" class:archived={bookmark.is_archived} class:unread={bookmark.unread}>
  <header class="head">
    <a class="title" href={bookmark.url} target="_blank" rel="noopener noreferrer">
      {displayTitle}
    </a>
    {#if bookmark.unread}
      <span class="badge unread-badge" title="Unread">•</span>
    {/if}
    {#if bookmark.shared}
      <span class="badge shared-badge" title="Shared">↗</span>
    {/if}
  </header>
  <a class="url" href={bookmark.url} target="_blank" rel="noopener noreferrer">
    {displayHost}
  </a>
  {#if hasDescription}
    <p class="description">{bookmark.description}</p>
  {/if}
  {#if hasNotes}
    <pre class="notes">{bookmark.notes}</pre>
  {/if}
  {#if bookmark.tag_names.length > 0}
    <ul class="tags">
      {#each bookmark.tag_names as tag (tag)}
        <li>
          <button
            type="button"
            class="tag"
            onclick={() => onTagClick?.(tag)}
            title="Filter by #{tag}"
          >
            #{tag}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
  <footer class="foot">
    <span class="date" title={`Added ${bookmark.date_added}`}>
      {new Date(bookmark.date_added).toLocaleString()}
    </span>
    {#if canEdit}
      <div class="actions">
        <a href={`/bookmarks/${bookmark.id}/details`}>Details</a>
        <a href={`/bookmarks/${bookmark.id}/edit`}>Edit</a>
        <form method="POST" action="/?/toggleArchive" style="display:inline">
          <input type="hidden" name="id" value={bookmark.id} />
          <input type="hidden" name="archive" value={bookmark.is_archived ? 'false' : 'true'} />
          <button type="submit" class="link-btn">
            {bookmark.is_archived ? 'Unarchive' : 'Archive'}
          </button>
        </form>
        <form method="POST" action="/?/delete" style="display:inline">
          <input type="hidden" name="id" value={bookmark.id} />
          <button
            type="submit"
            class="link-btn danger"
            onclick={(e) => {
              if (!confirm('Delete this bookmark?')) e.preventDefault();
            }}
          >
            Delete
          </button>
        </form>
      </div>
    {/if}
  </footer>
</article>

<style>
  .card {
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .card.archived {
    background: var(--archived-bg);
    opacity: 0.85;
  }
  .card.unread .title {
    font-weight: 600;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .title {
    color: var(--fg);
    font-size: 15px;
    font-weight: 500;
    word-break: break-word;
  }
  .title:hover {
    color: var(--accent);
    text-decoration: none;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    font-size: 11px;
    color: white;
  }
  .unread-badge {
    background: var(--accent);
  }
  .shared-badge {
    background: var(--success);
  }
  .url {
    color: var(--fg-muted);
    font-size: 12px;
    word-break: break-all;
  }
  .description {
    margin: 0;
    color: var(--fg);
  }
  .notes {
    margin: 0;
    background: var(--code-bg);
    border-radius: 4px;
    padding: 8px 10px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--fg);
  }
  .tags {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .tag {
    background: var(--tag-bg);
    color: var(--tag-fg);
    border: none;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 12px;
    cursor: pointer;
  }
  .tag:hover {
    background: #e0e7ff;
  }
  .foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid var(--border);
    padding-top: 8px;
    margin-top: 4px;
    color: var(--fg-muted);
    font-size: 12px;
  }
  .actions {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .link-btn {
    background: none;
    border: none;
    padding: 0;
    color: var(--accent);
    font-size: 12px;
    cursor: pointer;
  }
  .link-btn:hover {
    text-decoration: underline;
  }
  .link-btn.danger {
    color: var(--danger);
  }
</style>

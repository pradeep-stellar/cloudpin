<script lang="ts">
  type Tag = {
    name: string;
    count: number;
  };

  type Props = {
    tags: Tag[];
    selected?: string | null;
    onSelect?: (tag: string | null) => void;
  };

  let { tags, selected = null, onSelect }: Props = $props();

  const sorted = $derived([...tags].sort((a, b) => b.count - a.count));
  const max = $derived(sorted[0]?.count ?? 1);
</script>

{#if sorted.length === 0}
  <p class="empty">No tags yet.</p>
{:else}
  <ul class="cloud">
    {#each sorted as t (t.name)}
      <li>
        <button
          type="button"
          class="tag"
          class:selected={selected === t.name}
          style:font-size="{Math.max(0.85, Math.min(1.4, 0.85 + (t.count / max) * 0.6))}em"
          onclick={() => onSelect?.(selected === t.name ? null : t.name)}
        >
          #{t.name}
          <span class="count">{t.count}</span>
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .empty {
    color: var(--fg-muted);
    font-style: italic;
    margin: 0;
  }
  .cloud {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .tag {
    background: var(--tag-bg);
    color: var(--tag-fg);
    border: 1px solid transparent;
    padding: 3px 9px;
    border-radius: 999px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .tag:hover {
    background: #e0e7ff;
  }
  .tag.selected {
    background: var(--accent);
    color: var(--accent-fg);
  }
  .count {
    font-size: 0.8em;
    opacity: 0.75;
  }
</style>

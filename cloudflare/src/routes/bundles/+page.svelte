<script lang="ts">
  import { enhance } from '$app/forms';
  import CsrfInput from '$lib/components/CsrfInput.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  let orderedIds = $state<number[]>(data.bundles.map((b) => b.id));

  $effect(() => {
    orderedIds = data.bundles.map((b) => b.id);
  });

  const orderedBundles = $derived(
    orderedIds
      .map((id) => data.bundles.find((b) => b.id === id))
      .filter((b): b is (typeof data.bundles)[number] => b !== undefined)
  );

  function moveUp(index: number) {
    if (index <= 0) return;
    const next = [...orderedIds];
    [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
    orderedIds = next;
  }

  function moveDown(index: number) {
    if (index >= orderedIds.length - 1) return;
    const next = [...orderedIds];
    [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
    orderedIds = next;
  }
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
  <form method="POST" action="?/reorder" class="reorder-form" use:enhance>
    <CsrfInput token={data.csrfToken} />
    <input type="hidden" name="order" value={orderedIds.join(',')} />
    <ul class="bundle-list">
      {#each orderedBundles as b, index (b.id)}
        <li>
          <div class="reorder">
            <button
              type="button"
              class="btn btn-icon"
              aria-label="Move up"
              disabled={index === 0}
              onclick={() => moveUp(index)}
            >
              ↑
            </button>
            <button
              type="button"
              class="btn btn-icon"
              aria-label="Move down"
              disabled={index === orderedBundles.length - 1}
              onclick={() => moveDown(index)}
            >
              ↓
            </button>
            <span class="handle" aria-hidden="true">⋮⋮</span>
          </div>
          <a href={`/bundles/${b.id}/edit`}>{b.name}</a>
          <span class="meta">
            {#if b.search}search: <code>{b.search}</code>{/if}
            {#if b.any_tags}any: <code>{b.any_tags}</code>{/if}
            {#if b.all_tags}all: <code>{b.all_tags}</code>{/if}
            {#if b.excluded_tags}exclude: <code>{b.excluded_tags}</code>{/if}
          </span>
          <button
            class="btn del"
            type="submit"
            formaction="?/delete"
            name="id"
            value={b.id}
            onclick={(e) => {
              if (!confirm(`Delete bundle "${b.name}"?`)) e.preventDefault();
            }}
          >
            Delete
          </button>
        </li>
      {/each}
    </ul>
    <button class="btn btn-primary save" type="submit">Save order</button>
  </form>
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
  .reorder-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
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
  .reorder {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .btn-icon {
    min-width: 32px;
    padding: 4px 8px;
  }
  .handle {
    color: var(--fg-muted);
    font-size: 14px;
    user-select: none;
    cursor: grab;
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
    flex-shrink: 0;
  }
  .save {
    align-self: flex-start;
  }
</style>

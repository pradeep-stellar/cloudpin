<script lang="ts">
  import TagCloud from '$lib/components/TagCloud.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const tagCloudItems = $derived(data.tags.map((t) => ({ name: t.name, count: 1 })));
  let selected = $state<string | null>(null);
</script>

<svelte:head>
  <title>Tags · cloudpin</title>
</svelte:head>

<a class="back" href="/bookmarks">← Back</a>
<h1>Tags</h1>

<p class="meta">{data.total} tags</p>

<TagCloud
  tags={tagCloudItems}
  {selected}
  onSelect={(t) => {
    selected = t;
    if (t) {
      window.location.href = `/bookmarks?tag=${encodeURIComponent(t)}`;
    } else {
      window.location.href = '/bookmarks';
    }
  }}
/>

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
</style>

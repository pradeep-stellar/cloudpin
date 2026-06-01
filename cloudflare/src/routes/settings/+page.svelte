<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const u = $derived(data.user);
  const p = $derived(data.profile);
</script>

<svelte:head>
  <title>Settings · cloudpin</title>
</svelte:head>

<a class="back" href="/bookmarks">← Back</a>
<h1>Settings</h1>

<section class="card">
  <h2>Account</h2>
  <dl>
    <dt>Email</dt>
    <dd>{u?.email}</dd>
    <dt>Username</dt>
    <dd>{u?.username}</dd>
    <dt>Admin</dt>
    <dd>{u?.isAdmin ? 'yes' : 'no'}</dd>
  </dl>
</section>

{#if p}
  <section class="card">
    <h2>Display preferences</h2>
    <dl>
      <dt>Theme</dt>
      <dd>{p.theme}</dd>
      <dt>Bookmark date display</dt>
      <dd>{p.bookmark_date_display}</dd>
      <dt>Bookmark description display</dt>
      <dd>{p.bookmark_description_display}</dd>
      <dt>Bookmark link target</dt>
      <dd>{p.bookmark_link_target}</dd>
      <dt>Items per page</dt>
      <dd>{p.items_per_page}</dd>
      <dt>Tag search</dt>
      <dd>{p.tag_search}</dd>
      <dt>Tag grouping</dt>
      <dd>{p.tag_grouping}</dd>
      <dt>Enable favicons</dt>
      <dd>{p.enable_favicons ? 'yes' : 'no'}</dd>
      <dt>Enable preview images</dt>
      <dd>{p.enable_preview_images ? 'yes' : 'no'}</dd>
    </dl>
    <p class="hint">Editing these preferences lands in Phase 6.</p>
  </section>
{/if}

<style>
  .back {
    color: var(--fg-muted);
    font-size: 13px;
  }
  h1 {
    margin: 6px 0 16px;
    font-size: 20px;
  }
  .card {
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px 20px;
    margin-bottom: 14px;
    max-width: 640px;
  }
  h2 {
    margin: 0 0 10px;
    font-size: 15px;
  }
  dl {
    display: grid;
    grid-template-columns: 220px 1fr;
    gap: 4px 12px;
    margin: 0;
  }
  dt {
    color: var(--fg-muted);
    font-size: 13px;
  }
  dd {
    margin: 0;
  }
  .hint {
    color: var(--fg-muted);
    font-size: 12px;
    margin-top: 10px;
  }
</style>

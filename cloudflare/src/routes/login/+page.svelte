<script lang="ts">
  import { page } from '$app/stores';
</script>

<svelte:head>
  <title>Sign in · cloudpin</title>
</svelte:head>

<div class="card">
  <h1>Sign in</h1>
  <p>This deployment uses Cloudflare Access for authentication.</p>
  <p class="hint">
    In development, the worker accepts a stub identity so you can explore the UI without setting up
    Access. The dev user is <code>dev@cloudpin.local</code>.
  </p>
  <div class="actions">
    <a class="btn btn-primary" href="/bookmarks">Continue to app</a>
  </div>
  {#if $page.url.searchParams.get('reason')}
    <p class="error">{$page.url.searchParams.get('reason')}</p>
  {/if}
</div>

<style>
  .card {
    max-width: 480px;
    margin: 60px auto;
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 24px;
  }
  h1 {
    margin: 0 0 8px;
    font-size: 20px;
  }
  p {
    color: var(--fg);
  }
  .hint {
    color: var(--fg-muted);
    font-size: 13px;
  }
  code {
    background: var(--code-bg);
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 12px;
  }
  .actions {
    margin-top: 16px;
  }
  .error {
    color: var(--danger);
    margin-top: 12px;
  }
</style>

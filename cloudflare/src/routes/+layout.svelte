<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { LayoutData } from './$types';
  import { page } from '$app/stores';

  let { data, children }: { data: LayoutData; children: Snippet } = $props();

  const navItems = [
    { href: '/bookmarks', label: 'All' },
    { href: '/bookmarks/archived', label: 'Archived' },
    { href: '/bookmarks/shared', label: 'Shared' },
    { href: '/tags', label: 'Tags' },
    { href: '/settings', label: 'Settings' }
  ];

  function isActive(href: string, current: string): boolean {
    if (href === '/bookmarks') return current === '/bookmarks' || current.startsWith('/bookmarks?');
    return current === href || current.startsWith(href + '/');
  }
</script>

<div class="app">
  <header class="topbar">
    <a class="brand" href="/bookmarks">{data.appName}</a>
    <nav class="nav">
      {#each navItems as item (item.href)}
        <a href={item.href} class:active={isActive(item.href, $page.url.pathname)}>
          {item.label}
        </a>
      {/each}
    </nav>
    <div class="user">
      {#if data.user}
        <span class="email">{data.user.email}</span>
      {:else}
        <a href="/login">Sign in</a>
      {/if}
    </div>
  </header>
  <main class="content">
    {@render children()}
  </main>
</div>

<style>
  :global(:root) {
    --bg: #fafafa;
    --bg-elev: #ffffff;
    --fg: #1f1f1f;
    --fg-muted: #6b6b6b;
    --border: #e3e3e3;
    --accent: #2563eb;
    --accent-fg: #ffffff;
    --danger: #dc2626;
    --success: #16a34a;
    --tag-bg: #eef2ff;
    --tag-fg: #3730a3;
    --archived-bg: #f3f4f6;
    --code-bg: #f1f5f9;
    --radius: 6px;
    --font: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  }
  :global(body) {
    margin: 0;
    background: var(--bg);
    color: var(--fg);
    font-family: var(--font);
    font-size: 14px;
    line-height: 1.5;
  }
  :global(*) {
    box-sizing: border-box;
  }
  :global(a) {
    color: var(--accent);
    text-decoration: none;
  }
  :global(a:hover) {
    text-decoration: underline;
  }
  :global(button) {
    font: inherit;
    cursor: pointer;
  }
  :global(input[type='text']),
  :global(input[type='url']),
  :global(input[type='search']),
  :global(input[type='email']),
  :global(input[type='password']),
  :global(input[type='number']),
  :global(textarea),
  :global(select) {
    font: inherit;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 8px 10px;
    background: var(--bg-elev);
    color: var(--fg);
    width: 100%;
  }
  :global(input:focus),
  :global(textarea:focus),
  :global(select:focus) {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
  }
  :global(.btn) {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--bg-elev);
    color: var(--fg);
  }
  :global(.btn:hover) {
    background: #f3f4f6;
  }
  :global(.btn-primary) {
    background: var(--accent);
    color: var(--accent-fg);
    border-color: var(--accent);
  }
  :global(.btn-primary:hover) {
    background: #1d4ed8;
  }
  :global(.btn-danger) {
    background: var(--danger);
    color: white;
    border-color: var(--danger);
  }
  :global(.btn-danger:hover) {
    background: #b91c1c;
  }
  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  .topbar {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 20px;
    background: var(--bg-elev);
    border-bottom: 1px solid var(--border);
  }
  .brand {
    font-weight: 600;
    color: var(--fg);
    font-size: 16px;
  }
  .nav {
    display: flex;
    gap: 4px;
    flex: 1;
  }
  .nav a {
    color: var(--fg-muted);
    padding: 6px 10px;
    border-radius: var(--radius);
  }
  .nav a:hover {
    background: #f3f4f6;
    text-decoration: none;
  }
  .nav a.active {
    color: var(--fg);
    background: #eef2ff;
  }
  .user {
    color: var(--fg-muted);
    font-size: 13px;
  }
  .user .email {
    color: var(--fg);
  }
  .content {
    max-width: 1100px;
    width: 100%;
    margin: 0 auto;
    padding: 20px;
  }
</style>

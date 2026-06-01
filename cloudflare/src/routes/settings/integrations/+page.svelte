<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  let newTokenName = $state('');
  let justRevealed = $state<string | null>(null);
  let showRevealed = $state(false);

  $effect(() => {
    if (form && 'rawToken' in form && form.rawToken) {
      justRevealed = form.rawToken;
      showRevealed = true;
    }
  });

  const bookmarklet = $derived(
    `javascript:void(window.open('${data.baseUrl}/bookmarks/new?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title),'_blank'))`
  );
</script>

<svelte:head>
  <title>Integrations · cloudpin</title>
</svelte:head>

<aside class="side">
  <ul>
    <li><a href="/settings">General</a></li>
    <li><a href="/settings/integrations" class="active">Integrations</a></li>
    <li><a href="/settings/import-export">Import &amp; export</a></li>
  </ul>
</aside>

<section class="main">
  <h1>Integrations</h1>

  <h2>API tokens</h2>
  <p class="meta">For third-party clients, scripts, and the mobile app.</p>

  <form
    method="POST"
    action="?/createToken"
    use:enhance={() => {
      return ({ update }) => {
        newTokenName = '';
        update();
      };
    }}
  >
    <label>
      <span>Token name</span>
      <input
        type="text"
        name="name"
        bind:value={newTokenName}
        placeholder="e.g. iPhone, browser extension"
        required
      />
    </label>
    <div class="actions">
      <button class="btn btn-primary" type="submit">Create token</button>
    </div>
  </form>

  {#if showRevealed && justRevealed}
    <div class="reveal">
      <p><strong>Save this token now — you will not see it again.</strong></p>
      <pre>{justRevealed}</pre>
      <button
        class="btn"
        onclick={() => {
          showRevealed = false;
          justRevealed = null;
        }}>I have saved it</button
      >
    </div>
  {/if}

  {#if data.tokens.length > 0}
    <table class="tokens">
      <thead>
        <tr
          ><th>Name</th><th>Prefix</th><th>Created</th><th>Last used</th><th>Status</th><th
          ></th></tr
        >
      </thead>
      <tbody>
        {#each data.tokens as t (t.id)}
          <tr>
            <td>{t.name}</td>
            <td><code>{t.tokenPrefix}…</code></td>
            <td>{new Date(t.createdAt).toLocaleString()}</td>
            <td>{t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : '—'}</td>
            <td>{t.revokedAt ? 'Revoked' : 'Active'}</td>
            <td>
              {#if !t.revokedAt}
                <form method="POST" action="?/revokeToken" use:enhance>
                  <input type="hidden" name="id" value={t.id} />
                  <button class="btn danger" type="submit">Revoke</button>
                </form>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  <h2>Feed tokens</h2>
  <p class="meta">For RSS/Atom readers and public shared links.</p>

  {#if data.feedToken}
    <p>
      Active since {new Date(data.feedToken.createdAt).toLocaleString()}.
    </p>
    <div class="actions">
      <form method="POST" action="?/rotateFeed" use:enhance>
        <button class="btn" type="submit">Rotate</button>
      </form>
      <form method="POST" action="?/deleteFeed" use:enhance>
        <button class="btn danger" type="submit">Delete</button>
      </form>
    </div>

    <h3>Feed URLs</h3>
    <ul class="urls">
      <li>
        <span>All bookmarks:</span>
        <code>{data.baseUrl}/feeds/all?token=&lt;your-token&gt;</code>
      </li>
      <li>
        <span>Shared only:</span>
        <code>{data.baseUrl}/feeds/shared?token=&lt;your-token&gt;</code>
      </li>
    </ul>
    <p class="meta">Use the bookmarklet below to add pages with this feed token.</p>
  {:else}
    <p>No feed token yet.</p>
    <form method="POST" action="?/rotateFeed" use:enhance>
      <button class="btn btn-primary" type="submit">Generate feed token</button>
    </form>
  {/if}

  <h2>Bookmarklet</h2>
  <p class="meta">Drag this link to your bookmarks bar:</p>
  <p>
    <a href={bookmarklet} class="bookmarklet">+ Save to cloudpin</a>
  </p>
</section>

<style>
  .side {
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px 0;
    height: fit-content;
  }
  .side ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .side a {
    display: block;
    padding: 8px 14px;
    color: var(--fg);
  }
  .side a.active {
    background: #eef2ff;
    color: var(--fg);
  }
  .main {
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px 24px;
  }
  h1 {
    margin: 0 0 16px;
    font-size: 20px;
  }
  h2 {
    margin: 24px 0 8px;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fg-muted);
  }
  h3 {
    margin: 16px 0 4px;
    font-size: 13px;
  }
  .meta {
    color: var(--fg-muted);
    font-size: 13px;
    margin: 0 0 12px;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 520px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  label > span {
    font-size: 12px;
    color: var(--fg-muted);
  }
  .actions {
    display: flex;
    gap: 8px;
    flex-direction: row;
  }
  .actions form {
    margin: 0;
  }
  .btn.danger {
    background: var(--danger);
    color: white;
  }
  .reveal {
    margin: 12px 0;
    padding: 12px;
    background: #fff7ed;
    border: 1px solid #fdba74;
    border-radius: var(--radius);
  }
  .reveal pre {
    background: #f3f4f6;
    padding: 8px;
    border-radius: 4px;
    word-break: break-all;
    margin: 8px 0;
  }
  table.tokens {
    width: 100%;
    border-collapse: collapse;
    margin-top: 8px;
  }
  table.tokens th,
  table.tokens td {
    text-align: left;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
  }
  table.tokens th {
    font-weight: 500;
    color: var(--fg-muted);
  }
  .urls {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .urls li {
    margin: 4px 0;
  }
  .urls code {
    font-size: 12px;
  }
  .bookmarklet {
    display: inline-block;
    padding: 8px 14px;
    background: var(--accent);
    color: white;
    border-radius: var(--radius);
  }
  .bookmarklet:hover {
    background: #1d4ed8;
    text-decoration: none;
  }
</style>

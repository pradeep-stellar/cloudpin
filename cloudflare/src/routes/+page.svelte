<script lang="ts">
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<main>
  <h1>{data.appName}</h1>
  <p>Cloudflare-native bookmark manager. Phase 0 scaffold.</p>
</main>

<script lang="ts">
  let { token }: { token: string | null } = $props();
</script>

{#if token}
  <input type="hidden" name="_csrf" value={token} />
{/if}

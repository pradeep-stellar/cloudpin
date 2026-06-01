import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      routes: {
        include: ['/*'],
        exclude: ['<all>']
      }
    }),
    alias: {
      $lib: 'src/lib',
      '$lib/*': 'src/lib/*',
      $db: 'src/db',
      '$db/*': 'src/db/*',
      $domain: 'src/domain',
      '$domain/*': 'src/domain/*',
      $validation: 'src/validation',
      '$validation/*': 'src/validation/*',
      $server: 'src/server',
      '$server/*': 'src/server/*'
    }
  }
};

export default config;

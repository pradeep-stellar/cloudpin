import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ['test/unit/**/*.{test,spec}.ts', 'src/**/*.{test,spec}.ts'],
    environment: 'node'
  },
  server: {
    port: 5173
  }
});

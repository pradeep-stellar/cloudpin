import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const cloudflareRoot = resolve(__dirname, '..', '..');
const repoRoot = resolve(cloudflareRoot, '..');

const shellScripts = [
  resolve(cloudflareRoot, 'tools/bootstrap.sh'),
  resolve(cloudflareRoot, 'tools/terraform-apply.sh'),
  resolve(cloudflareRoot, 'tools/sync-wrangler-from-terraform.sh')
];

describe('cloudflare/tools shell scripts', () => {
  it.each(shellScripts)('%s passes bash -n', (script) => {
    expect(() => execFileSync('bash', ['-n', script], { stdio: 'pipe' })).not.toThrow();
  });
});

describe('terraform layout', () => {
  it('has preview and production environment stacks', () => {
    for (const env of ['preview', 'production'] as const) {
      const mainTf = resolve(repoRoot, 'terraform/environments', env, 'main.tf');
      expect(() => execFileSync('test', ['-f', mainTf], { stdio: 'pipe' })).not.toThrow();
    }
  });
});
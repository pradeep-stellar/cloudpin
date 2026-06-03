import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const repoRoot = resolve(__dirname, '..', '..');

describe('tools/bootstrap.sh', () => {
  it('passes bash -n syntax check', () => {
    expect(() =>
      execFileSync('bash', ['-n', resolve(repoRoot, 'tools/bootstrap.sh')], {
        stdio: 'pipe'
      })
    ).not.toThrow();
  });
});

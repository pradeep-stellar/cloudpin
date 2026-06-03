import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readE2EBypass } from '../../src/hooks.server';

describe('readE2EBypass', () => {
  const originalProcess = globalThis.process;

  beforeEach(() => {
    // @ts-expect-error - we want to control process.env
    delete globalThis.process;
  });

  afterEach(() => {
    globalThis.process = originalProcess;
    vi.restoreAllMocks();
  });

  it('returns true when env binding is "1"', () => {
    expect(readE2EBypass({ CLOUDPIN_E2E_BYPASS_AUTH: '1' })).toBe(true);
  });

  it('returns false when env binding is "0"', () => {
    expect(readE2EBypass({ CLOUDPIN_E2E_BYPASS_AUTH: '0' })).toBe(false);
  });

  it('returns false when env binding is empty string', () => {
    expect(readE2EBypass({ CLOUDPIN_E2E_BYPASS_AUTH: '' })).toBe(false);
  });

  it('returns false when env binding is "true" (strict match)', () => {
    expect(readE2EBypass({ CLOUDPIN_E2E_BYPASS_AUTH: 'true' })).toBe(false);
  });

  it('returns false when env binding is missing', () => {
    expect(readE2EBypass({})).toBe(false);
  });

  it('falls back to globalThis.process.env when binding is missing', () => {
    // @ts-expect-error - simulating Node-like process
    globalThis.process = { env: { CLOUDPIN_E2E_BYPASS_AUTH: '1' } };
    expect(readE2EBypass({})).toBe(true);
  });

  it('falls back to globalThis.process.env when binding is not "1"', () => {
    // @ts-expect-error - simulating Node-like process
    globalThis.process = { env: { CLOUDPIN_E2E_BYPASS_AUTH: '0' } };
    expect(readE2EBypass({ CLOUDPIN_E2E_BYPASS_AUTH: '' })).toBe(false);
  });

  it('returns false when globalThis.process is undefined and binding is missing', () => {
    // @ts-expect-error - explicitly delete
    delete globalThis.process;
    expect(readE2EBypass({})).toBe(false);
  });

  it('returns false when accessing process.env throws (sandboxed runtime)', () => {
    Object.defineProperty(globalThis, 'process', {
      configurable: true,
      get() {
        throw new Error('process not allowed');
      }
    });
    expect(readE2EBypass({})).toBe(false);
    // restore
    // @ts-expect-error restoring after defineProperty stub
    delete globalThis.process;
  });

  it('prefers the env binding over process.env', () => {
    // @ts-expect-error - simulating Node-like process
    globalThis.process = { env: { CLOUDPIN_E2E_BYPASS_AUTH: '0' } };
    expect(readE2EBypass({ CLOUDPIN_E2E_BYPASS_AUTH: '1' })).toBe(true);
  });
});

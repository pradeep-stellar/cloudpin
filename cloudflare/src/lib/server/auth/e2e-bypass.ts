export function readE2EBypass(env: object): boolean {
  const binding =
    'CLOUDPIN_E2E_BYPASS_AUTH' in env
      ? (env as { CLOUDPIN_E2E_BYPASS_AUTH?: unknown }).CLOUDPIN_E2E_BYPASS_AUTH
      : undefined;
  if (binding === '1') return true;
  try {
    return globalThis.process?.env?.CLOUDPIN_E2E_BYPASS_AUTH === '1';
  } catch {
    return false;
  }
}

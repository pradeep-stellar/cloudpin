import { describe, it, expect, vi } from 'vitest';
import { Logger } from '../../src/lib/logger';

describe('Logger', () => {
  it('emits JSON entries with required fields', () => {
    const sink = vi.fn();
    const log = new Logger({ level: 'debug', sink });
    log.info('hello', { userId: 1 });
    const call = sink.mock.calls[0]![0];
    expect(call.level).toBe('info');
    expect(call.message).toBe('hello');
    expect(call.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(call.fields).toEqual({ userId: 1 });
  });

  it('respects level threshold', () => {
    const sink = vi.fn();
    const log = new Logger({ level: 'warn', sink });
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
    expect(sink).toHaveBeenCalledTimes(2);
    expect(sink.mock.calls[0]![0].level).toBe('warn');
    expect(sink.mock.calls[1]![0].level).toBe('error');
  });

  it('child logger merges fields', () => {
    const sink = vi.fn();
    const log = new Logger({ level: 'debug', sink });
    const c = log.child({ requestId: 'r1' });
    c.info('msg', { userId: 7 });
    const call = sink.mock.calls[0]![0];
    expect(call.fields).toEqual({ requestId: 'r1', userId: 7 });
  });
});

import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

type Result = { ok: boolean; error: string | null };
const { createProgressWriter } = createRequire(import.meta.url)('../electron/progress-writer.cjs') as {
  createProgressWriter(o: { write: (name: string, json: string) => Result; backup: (name: string) => void; afterFlush: () => void }): { queue: (name: string, json: string) => void; save: (name: string, json: string) => Promise<Result>; flush: () => void };
};
afterEach(() => vi.useRealTimers());

describe('debounced physical save receipts', () => {
  it('coalesces rapid edits without acknowledging until the latest edit is written', async () => {
    vi.useFakeTimers();
    const write = vi.fn(() => ({ ok: true, error: null }));
    const backup = vi.fn();
    const writer = createProgressWriter({ write, backup, afterFlush: vi.fn() });
    const first = writer.save('progress.json', 'first');
    const second = writer.save('progress.json', 'second');
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(399);
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(write.mock.calls).toEqual([['progress.json', 'second']]);
    expect(await first).toEqual({ ok: true, error: null });
    expect(await second).toEqual({ ok: true, error: null });
    writer.queue('progress.json', 'third');
    writer.flush();
    expect(backup).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenLastCalledWith('progress.json', 'third');
  });
  it('keeps results separate for profiles and flushes at close/load without waiting for the timer', async () => {
    vi.useFakeTimers();
    const writer = createProgressWriter({ write: name => ({ ok: name !== 'progress.json', error: name === 'progress.json' ? 'ENOSPC' : null }), backup: vi.fn(), afterFlush: vi.fn() });
    const main = writer.save('progress.json', 'main');
    const second = writer.save('progress-ab.json', 'second');
    writer.flush();
    expect(await main).toEqual({ ok: false, error: 'ENOSPC' });
    expect(await second).toEqual({ ok: true, error: null });
    await vi.runAllTimersAsync();
  });
});

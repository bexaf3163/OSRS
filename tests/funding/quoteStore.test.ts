import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQuoteStore } from '../../src/lib/funding/quoteStore';
import type { MappingRow, QuoteBoard } from '../../src/services/pricesApi';

const board = (status: QuoteBoard['status'], tag = 0): QuoteBoard => ({ at: 1_000 + tag, hourAt: 1_000 + tag, quotes: new Map(), status });
const mapping = new Map<number, MappingRow>();

function loaderOf(boards: (QuoteBoard | Error)[]) {
  let i = 0;
  const calls = { board: 0, mapping: 0 };
  return {
    calls,
    loader: {
      board: async () => { calls.board++; const b = boards[Math.min(i++, boards.length - 1)]; if (b instanceof Error) throw b; return b; },
      mapping: async () => { calls.mapping++; return mapping; },
    },
  };
}

const flush = async () => { for (let k = 0; k < 6; k++) await Promise.resolve(); };

describe('the shared quote board: one fetch loop for every screen', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('nothing is fetched until a screen asks, and many screens share one request', async () => {
    const { loader, calls } = loaderOf([board('live')]);
    const store = createQuoteStore(loader, 300_000, () => true);
    await flush();
    expect(calls.board).toBe(0);
    const off = [store.subscribe(() => undefined), store.subscribe(() => undefined), store.subscribe(() => undefined)];
    await flush();
    expect(calls.board).toBe(1);
    expect(calls.mapping).toBe(1);
    expect(store.count()).toBe(3);
    expect(store.getState().board?.status).toBe('live');
    off.forEach((f) => f());
  });

  it('refreshes on the interval while somebody listens, and stops when the last one leaves', async () => {
    const { loader, calls } = loaderOf([board('live', 1), board('live', 2), board('live', 3)]);
    const store = createQuoteStore(loader, 300_000, () => true);
    const off = store.subscribe(() => undefined);
    await flush();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(calls.board).toBe(2);
    off();
    await vi.advanceTimersByTimeAsync(3_000_000);
    expect(calls.board).toBe(2);
    // The item reference is not fetched again.
    expect(calls.mapping).toBe(1);
  });

  it('a window that is not visible asks for nothing', async () => {
    const { loader, calls } = loaderOf([board('live')]);
    const store = createQuoteStore(loader, 300_000, () => false);
    const off = store.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(900_000);
    expect(calls.board).toBe(0);
    off();
  });

  it('a failed refresh keeps the earlier prices instead of an empty board', async () => {
    const { loader } = loaderOf([board('live', 1), board('offline', 2)]);
    const store = createQuoteStore(loader, 300_000, () => true);
    const off = store.subscribe(() => undefined);
    await flush();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(store.getState().board?.status).toBe('live');
    expect(store.getState().board?.at).toBe(1_001);
    off();
  });

  it('a loader that throws leaves the state alone and ends the loading mark', async () => {
    const { loader } = loaderOf([new Error('network'), board('live', 5)]);
    const store = createQuoteStore(loader, 300_000, () => true);
    const off = store.subscribe(() => undefined);
    await flush();
    expect(store.getState().loading).toBe(false);
    expect(store.getState().board).toBeNull();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(store.getState().board?.status).toBe('live');
    off();
  });

  it('listeners hear each change', async () => {
    const { loader } = loaderOf([board('live')]);
    const store = createQuoteStore(loader, 300_000, () => true);
    const heard = vi.fn();
    const off = store.subscribe(heard);
    await flush();
    expect(heard).toHaveBeenCalled();
    off();
  });
});

// One shared quote board for the whole app. Many screens may ask for it at once; there is one fetch loop, started when the first of them subscribes and stopped
// when the last one leaves, running no more often than the price service allows (it caches for five minutes, the hourly feed for ten, and backs off on a
// failure). The board and the item reference are plain data here; React reads them through useSyncExternalStore.

import { getMapping, getQuoteBoard, PRICE_TTL_MS, type MappingRow, type QuoteBoard } from '../../services/pricesApi';

export interface BoardState {
  board: QuoteBoard | null;
  mapping: Map<number, MappingRow> | null;
  /** A load is in flight. */
  loading: boolean;
}

type Loader = {
  board(opts: { volumes: boolean }): Promise<QuoteBoard>;
  mapping(): Promise<Map<number, MappingRow>>;
};

const real: Loader = { board: (o) => getQuoteBoard(o), mapping: () => getMapping() };

export function createQuoteStore(loader: Loader = real, ttl = PRICE_TTL_MS, visible: () => boolean = () => typeof document === 'undefined' || document.visibilityState !== 'hidden') {
  let state: BoardState = { board: null, mapping: null, loading: false };
  const listeners = new Set<() => void>();
  let subscribers = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let inflight: Promise<void> | null = null;

  const set = (next: BoardState) => { state = next; for (const l of listeners) l(); };

  function load(): Promise<void> {
    if (inflight) return inflight;
    if (!visible()) return Promise.resolve();
    set({ ...state, loading: true });
    inflight = (async () => {
      const [board, mapping] = await Promise.all([
        loader.board({ volumes: true }),
        state.mapping ? Promise.resolve(state.mapping) : loader.mapping().catch(() => null),
      ]);
      // A failed refresh keeps the earlier board (marked stale by the service) instead of replacing it with an empty one.
      const keep = board.status === 'offline' && state.board && state.board.status !== 'offline' ? state.board : board;
      set({ board: keep, mapping: mapping ?? state.mapping, loading: false });
    })().catch(() => set({ ...state, loading: false })).finally(() => { inflight = null; });
    return inflight;
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      subscribers += 1;
      if (subscribers === 1) {
        void load();
        timer = setInterval(() => void load(), ttl);
      }
      return () => {
        listeners.delete(listener);
        subscribers -= 1;
        if (subscribers === 0 && timer) { clearInterval(timer); timer = null; }
      };
    },
    /** For tests and diagnostics: how many components are listening. */
    count: () => subscribers,
    refresh: load,
  };
}

export const quoteStore = createQuoteStore();

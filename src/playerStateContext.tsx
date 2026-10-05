// The single player state for the screens: one snapshot for everyone (readiness, shopping, preparation, one trip, goals) and
// the session resource journal. Recomputed only when the fingerprint changes — not on every render.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { items } from './data';
import { useBridge } from './bridge';
import { useStore } from './store';
import { useProfiles } from './lib/profiles';
import { ledgerKey, LEDGER_LIMIT, loadLedger, saveLedger, since } from './lib/ledgerStore';
import { nameKey } from './lib/checklist';
import { buildPlayerState, diffPlayerState, type PlayerState, type StateChange } from './lib/playerState';
import { entriesFor, summarize, type LedgerEntry, type LedgerSummary } from './lib/ledger';
import { buildPriceBook, reprice, type PriceBook } from './lib/priceBook';
import { getAllPrices, getMapping, PRICE_TTL_MS } from './services/pricesApi';

interface PlayerStateValue {
  state: PlayerState;
  /** What changed last (levels, items, coins, quests). */
  changes: StateChange[];
  ledger: LedgerEntry[];
  /** Totals of the whole journal (between sessions, up to 30 days) at current prices: the loot estimate is recomputed when prices update. */
  summary: LedgerSummary;
  /** Totals of this session only — since the app was launched. */
  session: LedgerSummary;
  /** The journal start (the first record) and clearing: the journal is kept between sessions, and the player can start over. */
  since: number | null;
  clearLedger: () => void;
  /** Where the prices come from: fresh from the exchange or from the project database. */
  prices: PriceBook;
}

const Ctx = createContext<PlayerStateValue | null>(null);

/** The sell price by name: from the project item database (an estimate, not a fresh exchange price). */
const SELL_PRICE = new Map<string, number>(items.flatMap((i) => (i.gePrice ? [[nameKey(i.nameEn), i.gePrice.sellPrice] as [string, number]] : [])));
const BAKED = buildPriceBook(null, null, SELL_PRICE);

/**
 * Fresh exchange prices: loaded when loot appears in the journal and refreshed every 5 minutes while the window is open. No network — the
 * project database prices stay (with a mark), and earlier fresh prices do not vanish after one failed attempt.
 */
function useLivePrices(needed: boolean): PriceBook {
  const [book, setBook] = useState<PriceBook>(BAKED);
  useEffect(() => {
    // While there is no loot, fresh prices are not needed by anyone: we do not load ~1.5 MB for nothing.
    if (!needed) return;
    let dead = false;
    const load = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const [live, mapping] = await Promise.all([getAllPrices(), getMapping()]);
        if (!dead) setBook(buildPriceBook(live, mapping, SELL_PRICE));
      } catch { /* the exchange is unavailable: the earlier prices stay */ }
    };
    void load();
    const t = setInterval(() => void load(), PRICE_TTL_MS);
    return () => { dead = true; clearInterval(t); };
  }, [needed]);
  return book;
}

const SESSION_START = Date.now();

function ls(): Storage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

export function PlayerStateProvider({ children }: { children: ReactNode }) {
  const { progress, mode } = useStore();
  const { stats, owned, gear, questsDone, player, state: link } = useBridge();
  const profiles = useProfiles();
  const next = useMemo(
    () => buildPlayerState({ mode, stats, progress, owned, gear, questsDone, player, connected: link === 'online' }),
    [mode, stats, progress, owned, gear, questsDone, player, link],
  );
  // The same fingerprint — the same object: consumers do not recompute for nothing.
  const stable = useRef(next);
  if (stable.current.fingerprint !== next.fingerprint) stable.current = next;
  const state = stable.current;

  const [changes, setChanges] = useState<StateChange[]>([]);
  // The journal is bound to the "profile + character" key: a key change loads another journal, and does not append to the earlier one.
  const key = ledgerKey(profiles.active, player);
  const [book, setBook] = useState<{ key: string; entries: LedgerEntry[] }>(() => ({ key, entries: loadLedger(ls(), key, Date.now()) }));
  if (book.key !== key) setBook({ key, entries: loadLedger(ls(), key, Date.now()) });
  const ledger = book.key === key ? book.entries : [];
  const prices = useLivePrices(ledger.some((e) => e.name !== 'Coins' && (e.reason === 'LOOT' || e.reason === 'PICKUP')));
  const priceRef = useRef(prices);
  priceRef.current = prices;
  const prev = useRef<PlayerState | null>(null);
  const prevPlayer = useRef<string | null>(null);
  useEffect(() => {
    // Another character — counting starts over: the "before" snapshot did not belong to them.
    if (prevPlayer.current !== (player ?? null)) {
      prevPlayer.current = player ?? null;
      prev.current = state;
      setChanges([]);
      return;
    }
    const before = prev.current;
    prev.current = state;
    const diff = diffPlayerState(before, state);
    if (!diff.length) return;
    setChanges(diff);
    // Into the journal only while the link is alive: without it there are no "changes", there is missing data.
    if (!before || !before.connected || !state.connected) return;
    const entries = entriesFor(before, state, diff, Date.now(), priceRef.current.priceOf);
    if (!entries.length) return;
    setBook((b) => {
      if (b.key !== key) return b;
      const merged = [...b.entries, ...entries].slice(-LEDGER_LIMIT);
      saveLedger(ls(), b.key, merged);
      return { key: b.key, entries: merged };
    });
  }, [state, player, key]);

  const clearLedger = useCallback(() => {
    saveLedger(ls(), key, []);
    setBook({ key, entries: [] });
  }, [key]);

  const priced = useMemo(() => reprice(ledger, prices), [ledger, prices]);
  const summary = useMemo(() => summarize(priced), [priced]);
  const session = useMemo(() => summarize(since(priced, SESSION_START)), [priced]);
  const first = ledger.length ? ledger[0].timestamp : null;
  const value = useMemo(
    () => ({ state, changes, ledger, summary, session, since: first, clearLedger, prices }),
    [state, changes, ledger, summary, session, first, clearLedger, prices],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlayerState(): PlayerStateValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePlayerState outside PlayerStateProvider');
  return v;
}

// Единое состояние игрока для экранов: один снимок на всех (готовность, закупки, подготовка, одна ходка, цели) и
// журнал ресурсов сеанса. Пересчитывается только когда меняется отпечаток — не на каждый рендер.

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { items } from './data';
import { useBridge } from './bridge';
import { useStore } from './store';
import { nameKey } from './lib/checklist';
import { buildPlayerState, diffPlayerState, type PlayerState, type StateChange } from './lib/playerState';
import { entriesFor, summarize, type LedgerEntry, type LedgerSummary } from './lib/ledger';
import { buildPriceBook, reprice, type PriceBook } from './lib/priceBook';
import { getAllPrices, getMapping, PRICE_TTL_MS } from './services/pricesApi';

interface PlayerStateValue {
  state: PlayerState;
  /** Что изменилось в последний раз (уровни, предметы, монеты, квесты). */
  changes: StateChange[];
  ledger: LedgerEntry[];
  /** Итоги по текущим ценам: оценка добычи пересчитывается при каждом обновлении цен. */
  summary: LedgerSummary;
  /** Откуда цены: свежие с биржи или из базы проекта. */
  prices: PriceBook;
}

const Ctx = createContext<PlayerStateValue | null>(null);

/** Цена продажи по названию: из базы предметов проекта (оценка, не свежая цена биржи). */
const SELL_PRICE = new Map<string, number>(items.flatMap((i) => (i.gePrice ? [[nameKey(i.nameEn), i.gePrice.sellPrice] as [string, number]] : [])));
const BAKED = buildPriceBook(null, null, SELL_PRICE);

/**
 * Свежие цены биржи: загружаются, когда в журнале появилась добыча, и обновляются раз в 5 минут, пока окно открыто. Нет сети — остаются
 * цены из базы проекта (с пометкой), а прежние свежие цены не пропадают от одной неудачной попытки.
 */
function useLivePrices(needed: boolean): PriceBook {
  const [book, setBook] = useState<PriceBook>(BAKED);
  useEffect(() => {
    // Пока добычи нет, свежие цены никому не нужны: не грузим ~1,5 МБ зря.
    if (!needed) return;
    let dead = false;
    const load = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const [live, mapping] = await Promise.all([getAllPrices(), getMapping()]);
        if (!dead) setBook(buildPriceBook(live, mapping, SELL_PRICE));
      } catch { /* биржа недоступна: остаются прежние цены */ }
    };
    void load();
    const t = setInterval(() => void load(), PRICE_TTL_MS);
    return () => { dead = true; clearInterval(t); };
  }, [needed]);
  return book;
}

const LEDGER_LIMIT = 500;

export function PlayerStateProvider({ children }: { children: ReactNode }) {
  const { progress, mode } = useStore();
  const { stats, owned, gear, questsDone, player, state: link } = useBridge();
  const next = useMemo(
    () => buildPlayerState({ mode, stats, progress, owned, gear, questsDone, player, connected: link === 'online' }),
    [mode, stats, progress, owned, gear, questsDone, player, link],
  );
  // Тот же отпечаток — тот же объект: потребители не пересчитываются зря.
  const stable = useRef(next);
  if (stable.current.fingerprint !== next.fingerprint) stable.current = next;
  const state = stable.current;

  const [changes, setChanges] = useState<StateChange[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const prices = useLivePrices(ledger.some((e) => e.name !== 'Coins' && (e.reason === 'LOOT' || e.reason === 'PICKUP')));
  const priceRef = useRef(prices);
  priceRef.current = prices;
  const prev = useRef<PlayerState | null>(null);
  const prevPlayer = useRef<string | null>(null);
  useEffect(() => {
    // Другой персонаж — новая запись: старые прибавки к нему не относятся.
    if (prevPlayer.current !== (player ?? null)) {
      prevPlayer.current = player ?? null;
      prev.current = state;
      setLedger([]);
      setChanges([]);
      return;
    }
    const before = prev.current;
    prev.current = state;
    const diff = diffPlayerState(before, state);
    if (!diff.length) return;
    setChanges(diff);
    // В журнал — только пока связь живая: без неё «изменений» нет, есть пропавшие данные.
    if (!before || !before.connected || !state.connected) return;
    const entries = entriesFor(before, state, diff, Date.now(), priceRef.current.priceOf);
    if (entries.length) setLedger((l) => [...l, ...entries].slice(-LEDGER_LIMIT));
  }, [state, player]);

  const summary = useMemo(() => summarize(reprice(ledger, prices)), [ledger, prices]);
  const value = useMemo(() => ({ state, changes, ledger, summary, prices }), [state, changes, ledger, summary, prices]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlayerState(): PlayerStateValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePlayerState вне PlayerStateProvider');
  return v;
}

// Единое состояние игрока для экранов: один снимок на всех (готовность, закупки, подготовка, одна ходка, цели) и
// журнал ресурсов сеанса. Пересчитывается только когда меняется отпечаток — не на каждый рендер.

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
  /** Что изменилось в последний раз (уровни, предметы, монеты, квесты). */
  changes: StateChange[];
  ledger: LedgerEntry[];
  /** Итоги всего журнала (между сеансами, до 30 дней) по текущим ценам: оценка добычи пересчитывается при обновлении цен. */
  summary: LedgerSummary;
  /** Итоги только за этот сеанс — с момента запуска программы. */
  session: LedgerSummary;
  /** Начало журнала (первая запись) и очистка: журнал хранится между сеансами, и игрок может начать заново. */
  since: number | null;
  clearLedger: () => void;
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
  // Тот же отпечаток — тот же объект: потребители не пересчитываются зря.
  const stable = useRef(next);
  if (stable.current.fingerprint !== next.fingerprint) stable.current = next;
  const state = stable.current;

  const [changes, setChanges] = useState<StateChange[]>([]);
  // Журнал привязан к ключу «профиль + персонаж»: смена ключа загружает чужой журнал, а не дописывает в прежний.
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
    // Другой персонаж — отсчёт заново: снимок «до» принадлежал не ему.
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
    // В журнал — только пока связь живая: без неё «изменений» нет, есть пропавшие данные.
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
  if (!v) throw new Error('usePlayerState вне PlayerStateProvider');
  return v;
}

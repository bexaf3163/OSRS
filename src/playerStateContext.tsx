// Единое состояние игрока для экранов: один снимок на всех (готовность, закупки, подготовка, одна ходка, цели) и
// журнал ресурсов сеанса. Пересчитывается только когда меняется отпечаток — не на каждый рендер.

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { items } from './data';
import { useBridge } from './bridge';
import { useStore } from './store';
import { nameKey } from './lib/checklist';
import { buildPlayerState, diffPlayerState, type PlayerState, type StateChange } from './lib/playerState';
import { entriesFor, summarize, type LedgerEntry, type LedgerSummary } from './lib/ledger';

interface PlayerStateValue {
  state: PlayerState;
  /** Что изменилось в последний раз (уровни, предметы, монеты, квесты). */
  changes: StateChange[];
  ledger: LedgerEntry[];
  summary: LedgerSummary;
}

const Ctx = createContext<PlayerStateValue | null>(null);

/** Цена продажи по названию: из базы предметов проекта (оценка, не свежая цена биржи). */
const SELL_PRICE = new Map<string, number>(items.flatMap((i) => (i.gePrice ? [[nameKey(i.nameEn), i.gePrice.sellPrice] as [string, number]] : [])));
const priceOf = (name: string) => SELL_PRICE.get(nameKey(name));

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
    const entries = entriesFor(before, state, diff, Date.now(), priceOf);
    if (entries.length) setLedger((l) => [...l, ...entries].slice(-LEDGER_LIMIT));
  }, [state, player]);

  const summary = useMemo(() => summarize(ledger), [ledger]);
  const value = useMemo(() => ({ state, changes, ledger, summary }), [state, changes, ledger, summary]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlayerState(): PlayerStateValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePlayerState вне PlayerStateProvider');
  return v;
}

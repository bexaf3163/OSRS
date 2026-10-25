// The single player state for the screens: one snapshot for everyone (readiness, shopping, preparation, one trip, goals) and
// the session resource journal. Recomputed only when the fingerprint changes — not on every render.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { items } from './data';
import { useBridge } from './bridge';
import { useStore } from './store';
import { stepsFor } from './data';
import { useFeatures } from './lib/features';
import { priorityOf, styleOf } from './lib/playStyle';
import { pickMethods } from './lib/methodPick';
import { foodPicks } from './lib/foodPlan';
import { adoptPlan, adoptStorageKey, useAdopted } from './lib/combatRoute/adopt';
import { estimateContext } from './lib/combatRoute/context';
import { evaluatePlans, planWhy, type PlanReport } from './lib/combatRoute/plans';
import { resolvePick, withCombatPlan, type CombatPick } from './lib/combatRoute/pick';
import { selectPlan, type PlanSelection } from './lib/combatRoute/selection';
import { stepGoals } from './lib/combatEstimate';
import { usePriceView } from './lib/funding/usePriceView';
import type { PriceView } from './lib/funding/quotes';
import { itemPrice } from './lib/itemPrice';
import { useTradeRestriction } from './lib/useTradeRestriction';
import type { Step } from './types';
import { isClosed } from './lib/next-step';
import { gateAllows, useProfiles } from './lib/profiles';
import { ledgerKey, LEDGER_LIMIT, loadLedger, saveLedger, since } from './lib/ledgerStore';
import { nameKey } from './lib/checklist';
import { buildPlayerState, diffPlayerState, heldOf, type PlayerState, type StateChange } from './lib/playerState';
import { entriesFor, summarize, type LedgerEntry, type LedgerSummary } from './lib/ledger';
import { buildPriceBook, reprice, type PriceBook } from './lib/priceBook';

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
  /**
   * The combat plan in effect for every open combat training step, with the comparison it was chosen from (2.69). One answer for the step page, the
   * status line, preparation, shopping, the arrow and the game: nothing else evaluates plans.
   */
  combatPlans: Record<string, CombatPlanEntry>;
  /** The player's own choice for a step; null goes back to the guide's recommendation. */
  choosePlan: (stepId: string, key: string | null) => void;
}

export interface CombatPlanEntry {
  report: PlanReport;
  selection: PlanSelection;
  /** The plans were worked out from the last known levels and gear (RuneLite is not connected). */
  lastKnown: boolean;
}

/** A step the combat plans are for: an opponent and a melee XP goal. */
const isCombatTraining = (step: Step) => (step.foes?.length ?? 0) > 0 && stepGoals(step).length > 0;

function foodOf(step: Step) {
  return (step.itemsRequired ?? []).find((i) => typeof i.heals === 'number');
}

function foodPriceOf(step: Step, prices: PriceView): number | null {
  const food = foodOf(step);
  return food ? itemPrice(prices, food.nameEn, food.wikiItemId, 1).unit : null;
}

const Ctx = createContext<PlayerStateValue | null>(null);

const ITEM_IDS = new Map(items.map(i => [nameKey(i.nameEn), i.id]));

/**
 * The journal and travel read the shared board; they do not run a separate refresh loop.
 */
function useLivePrices(needed: boolean): PriceBook {
  const board = usePriceView(needed);
  return useMemo(() => buildPriceBook(board, name => ITEM_IDS.get(nameKey(name))), [board]);
}

const SESSION_START = Date.now();

function ls(): Storage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

export function PlayerStateProvider({ children }: { children: ReactNode }) {
  const { progress, mode, setMethodPicks, setFoodPicks, setCombatPicks } = useStore();
  const features = useFeatures();
  const { stats, owned, gear, questsDone, player, state: link, xp, combatLog, inGame, activeStepId, pacing, lastGears, lastGear, gate, position } = useBridge();
  const profiles = useProfiles();
  const next = useMemo(
    () => buildPlayerState({ mode, stats, progress, owned, gear, questsDone, player, position, connected: link === 'online' && inGame && gateAllows(gate) }),
    [mode, stats, progress, owned, gear, questsDone, player, link, inGame, gate, position],
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
  const prices = useLivePrices(state.connected || ledger.some((e) => e.name !== 'Coins' && (e.reason === 'LOOT' || e.reason === 'PICKUP')));
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

  // The training method of the steps that follow one: the card's own answer, given to the store so the steps ask for that method's tools.
  const style = styleOf(features).style;
  const priority = priorityOf(features);
  const picks = useMemo(() => pickMethods(stepsFor(mode), state, mode, style, priority), [state, mode, style, priority]);
  useEffect(() => { setMethodPicks(picks); }, [picks, setMethodPicks]);

  // The combat plan in effect for every open combat training step (2.69): the guide's recommendation unless the player chose one (lib/combatRoute/
  // selection.ts). It is worked out here once, for every screen and for the game; the step card and the status line only read it.
  const adoptKey = adoptStorageKey(profiles.active, player);
  const adopted = useAdopted(adoptKey);
  const keepDefenceOne = features.keepDefenceOne;
  const base = useMemo(() => stepsFor(mode), [mode]);
  const combatSteps = useMemo(() => base.filter((s) => isCombatTraining(s) && !isClosed(progress, s.id)), [base, progress]);
  const planPrices = usePriceView(combatSteps.length > 0);
  const trade = useTradeRestriction();
  const bound = profiles.list.find((p) => p.id === profiles.active)?.player ?? player ?? null;
  const combatPlans = useMemo(() => {
    const out: Record<string, CombatPlanEntry> = {};
    // RuneLite closed: the last known levels (the profile's, written from the game) and the character's last known gear, so the plan does not fall back
    // to the route's own while the game is away. Marked as such.
    const levels = progress.levels as Partial<Record<string, number>>;
    const lastStats = typeof levels.hitpoints === 'number' && typeof levels.attack === 'number' ? levels : null;
    const knownStats = (stats as Partial<Record<string, number>> | null) ?? lastStats;
    const knownGear = gear ?? (bound ? lastGears[bound.toLowerCase()]?.gear : lastGear?.gear) ?? null;
    const lastKnown = !stats || !gear;
    for (const s of combatSteps) {
      const stored = adopted[s.id];
      const live = { stats: knownStats, xp: xp as Partial<Record<string, number>> | null, gear: knownGear, combatLog };
      const report = evaluatePlans({
        step: s, steps: base, ctx: estimateContext(s, live, base, progress), owned, prices: planPrices, foodPrice: foodPriceOf(s, planPrices), state,
        keepDefenceOne, adopted: stored?.key ?? null, restriction: trade.state, done: (id) => isClosed(progress, id),
      });
      if (!report) continue;
      // In the middle of a trip on this step (fighting it in the game now, with its food in the bag) a better plan waits for the next bank trip.
      const food = foodOf(s);
      const bag = food ? [food.nameEn, ...(food.anyOf ?? [])].reduce((a, n) => a + (heldOf(state, n).bag ?? 0), 0) : 0;
      const inProgress = link === 'online' && inGame && activeStepId === s.id && pacing?.stepId === s.id && pacing.actionsPerMinute !== null && bag > 0;
      out[s.id] = { report, selection: selectPlan(report, stored, { inProgress }), lastKnown };
    }
    return out;
  }, [combatSteps, adopted, base, progress, stats, xp, gear, combatLog, owned, planPrices, keepDefenceOne, trade.state, state, link, inGame, activeStepId, pacing, bound, lastGears, lastGear]);

  // The guide's own choice is remembered, so it stays put unless another plan becomes clearly better (and a change waits for a bank trip). The route's
  // plan needs no entry: it is what a step without one has. The player's own choice is never written over.
  useEffect(() => {
    // Not before the exchange has answered (2.75): without prices the loot is worth nothing, and a choice remembered then would be held against the
    // plans the prices make better. The recommendation applies meanwhile; it is only not remembered.
    if (planPrices.status === 'offline') return;
    for (const [id, e] of Object.entries(combatPlans)) {
      const stored = adopted[id];
      if (stored?.by === 'player' || e.selection.source !== 'auto') continue;
      if (e.selection.key === 'route') { if (stored) adoptPlan(adoptKey, id, null); }
      else if (stored?.key !== e.selection.key) adoptPlan(adoptKey, id, e.selection.key, 'auto');
    }
  }, [combatPlans, adopted, adoptKey, planPrices.status]);
  const choosePlan = useCallback((stepId: string, key: string | null) => adoptPlan(adoptKey, stepId, key, 'player'), [adoptKey]);

  const combat = useMemo(() => {
    const out: Record<string, CombatPick> = {};
    for (const [id, e] of Object.entries(combatPlans)) {
      const { key, source } = e.selection;
      const pick = resolvePick(e.report, key, {
        xp: xp as Partial<Record<'attack' | 'strength' | 'defence', number>> | null,
        held: (name) => { const h = heldOf(state, name); return h.total; },
        state, prices: planPrices,
      }, source, planWhy(e.report, key, source));
      if (pick) out[id] = pick;
    }
    return out;
    // state carries what the player holds.
  }, [combatPlans, xp, state, planPrices]);
  useEffect(() => { setCombatPicks(combat); }, [combat, setCombatPicks]);

  // The food of the combat training steps from this player's estimate: readiness asks for one trip, the shopping list buys the whole goal.
  // It is counted for the step as the adopted plan has it (the cows' food, not the giants').
  const food = useMemo(() => {
    return foodPicks(stepsFor(mode).map((s) => withCombatPlan(s, combat[s.id])), progress, {
      stats: stats as Partial<Record<string, number>> | null, xp: xp as Partial<Record<string, number>> | null, gear, owned, combatLog,
    });
  }, [mode, progress, stats, xp, gear, owned, combatLog, combat]);
  useEffect(() => { setFoodPicks(food); }, [food, setFoodPicks]);

  const priced = useMemo(() => reprice(ledger, prices), [ledger, prices]);
  const summary = useMemo(() => summarize(priced), [priced]);
  const session = useMemo(() => summarize(since(priced, SESSION_START)), [priced]);
  const first = ledger.length ? ledger[0].timestamp : null;
  const value = useMemo(
    () => ({ state, changes, ledger, summary, session, since: first, clearLedger, prices, combatPlans, choosePlan }),
    [state, changes, ledger, summary, session, first, clearLedger, prices, combatPlans, choosePlan],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlayerState(): PlayerStateValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePlayerState outside PlayerStateProvider');
  return v;
}

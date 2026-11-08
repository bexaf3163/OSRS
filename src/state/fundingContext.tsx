// The money plan of the app: the temporary detour that raises the coins a route step is short of, kept for one character, ticked by what the game shows, and
// read by the screens (FundingCard, the Money section) and by the game's panel (FundingSync) through the same view.
//
// What lives here is wiring. The arithmetic is in lib/funding/*: the assessment (assess.ts), the plan's state machine (plan.ts), the earnings and pace
// from the resource journal (session.ts), the shared price board (quoteStore.ts). Nothing here changes the route: the step the plan was started for stays
// open and exactly where it was, and a plan ending only takes down its own arrow.

import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { stepsFor } from '../data';
import { useBridge } from './bridge';
import { FundingPlanProvider, useFunding } from './fundingPlanContext';
export { useFunding } from './fundingPlanContext';
import { tripWindow } from '../domain/prep/oneTrip';
import { useStore } from './store';
import { usePlayerState } from './playerStateContext';
import { levelOf } from '../domain/player/playerState';
import { useReadinessEngine } from './readinessContext';
import { useFeatures } from './hooks/useFeatures';
import { styleOf } from '../domain/persistence/playStyle';
import { useCleanupAdvice } from './hooks/useCleanupAdvice';
import { reachTiles } from '../domain/travel/travel';
import { travelInputOf } from '../domain/travel/travelInput';
import { isClosed } from '../domain/quests/next-step';
import { buildNeed } from '../domain/economy/funding/need';
import { assess, type FundingAssessment } from '../domain/economy/funding/assess';
import { combatPersonaliser } from '../domain/economy/funding/combatAdapter';
import { gatherPersonaliser } from '../domain/economy/funding/gatherAdapter';
import { processPersonaliser } from '../domain/economy/funding/processAdapter';
import type { FundingMethod } from '../domain/economy/funding/types';
import { buildSnapshot, type FundingSnapshot } from '../domain/economy/funding/snapshot';
import { GRAND_EXCHANGE, viewOf, type FundingPlanState, type FundingView } from '../domain/economy/funding/plan';
import { realizedSince, type Realized } from '../domain/economy/funding/session';
import { usePriceView } from './hooks/usePriceView';
import type { EvalContext } from '../domain/economy/funding/evaluate';
import { moneyList, type MoneyList } from '../domain/economy/funding/browse';
import type { PriceView } from '../domain/market/quotes';
import type { Step } from '../types';

/** Refresh position only while a funding screen is active. */
const POSITION_IDLE_MS = 30_000;

// ---------------------------------------------------------------------------
// The snapshot of the player for a step

type Pos = { x: number; y: number; plane: number } | null;

/** The one funding snapshot for a step: the player's state, the account facts and what the steps around it protect. null for no step. */
export function useSnapshotFactory() {
  const engine = useReadinessEngine();
  const { state } = usePlayerState();
  const { progress } = useStore();
  const { questPoints, totalLevel, accountType, questStates } = useBridge();
  const override = progress.sellRestrictions;
  return useCallback((stepId: string | null, position: Pos): FundingSnapshot | null => {
    if (!stepId) return null;
    // Preserve actual occurrences: distinct virtual phases may retain the same saved step ID.
    const window = tripWindow(engine.ctx.steps, progress, stepId);
    return buildSnapshot({ state, window, questPoints, questObservation: questStates, totalLevel,
      ironman: accountType === null ? null : accountType === 'ironman', sellOverride: override, position: state.connected ? position : null });
  }, [engine, state, progress, questPoints, questStates, totalLevel, accountType, override]);
}

function useSnapshotFor(stepId: string | null, position: Pos): FundingSnapshot | null {
  const snapshotFor = useSnapshotFactory();
  return useMemo(() => snapshotFor(stepId, position), [snapshotFor, stepId, position]);
}

/** The same snapshot for the screens; the position is the one the provider last asked the game for. */
export function useFundingSnapshot(stepId: string | null): FundingSnapshot | null {
  return useSnapshotFor(stepId, useFunding().position);
}

// ---------------------------------------------------------------------------
// The running plan

/** Current UI adapter; the persisted local machine has no dependency on Readiness or a page. */
export function FundingProvider({ children }: { children: ReactNode }) {
  const snapshotFor = useSnapshotFactory();
  return <FundingPlanProvider snapshotFor={snapshotFor}>{children}</FundingPlanProvider>;
}

// ---------------------------------------------------------------------------
// What the screens read

/** The running plan of this step and what it asks now. Light: no prices, no assessment. */
export function useFundingView(stepId: string): { plan: FundingPlanState | null; view: FundingView | null } {
  const { plan: running } = useFunding();
  const plan = running && running.sourceStepId === stepId ? running : null;
  const snap = useFundingSnapshot(plan ? stepId : null);
  const view = useMemo(() => (plan && snap ? viewOf(plan, snap) : null), [plan, snap]);
  return { plan, view };
}

export interface FundingScreen {
  assessment: FundingAssessment | null;
  snap: FundingSnapshot | null;
  prices: PriceView;
  /** The running plan, when it belongs to this step. */
  plan: FundingPlanState | null;
  view: FundingView | null;
  realized: Realized | null;
  /** A spare-items list was read from the bag (the cleanup advice), so "sell" is a real option. */
  live: boolean;
}

/** The first melee skill an open combat step trains: the player's style, which a detour for money does not change. */
function trainingSkill(steps: readonly Step[], progress: Parameters<typeof isClosed>[0], from: Step): 'attack' | 'strength' | 'defence' | null {
  const MELEE = new Set(['attack', 'strength', 'defence']);
  const ahead = steps.slice(Math.max(0, steps.findIndex((s) => s.id === from.id)));
  for (const s of ahead) {
    if (isClosed(progress, s.id)) continue;
    const skill = s.pacing?.skill;
    if (skill && MELEE.has(skill) && (s.foes?.length ?? 0) > 0) return skill as 'attack' | 'strength' | 'defence';
  }
  return null;
}

type EvalBase = Omit<EvalContext, 'cash' | 'mode' | 'target' | 'needItems'>;

/**
 * What the evaluator needs besides the money and the target, for one step: the walk with the player's teleports, the combat model from the live levels
 * and gear, the player's own pace. The coin card and the Money section take it from here, so the two never judge a method differently. null - no step or
 * no snapshot.
 */
export function useEvalBase(step: Step | null, snap: FundingSnapshot | null, prices: PriceView): EvalBase | null {
  const baseFor = useEvalBaseFactory();
  return useMemo(() => baseFor(step, snap, prices), [baseFor, step, snap, prices]);
}

/** The same evaluation base as a function, for a caller that builds it only when it needs it. */
export function useEvalBaseFactory() {
  const { state } = usePlayerState();
  const { progress, mode } = useStore();
  const bridge = useBridge();
  const { observed } = useFunding();
  return useCallback((step: Step | null, snap: FundingSnapshot | null, prices: PriceView): EvalBase | null => {
    if (!step || !snap) return null;
    const route = stepsFor(mode);
    const reach = (from: { x: number; y: number; plane: number } | null, to: { x: number; y: number; plane: number }) => {
      if (!from) return null;
      const inp = travelInputOf({ from, to, levels: progress.levels, stats: bridge.stats, gear: bridge.gear, owned: state.owned, mode });
      return reachTiles(inp, to).tiles;
    };
    const live = {
      stats: bridge.stats as Partial<Record<string, number>> | null,
      xp: bridge.xp as Partial<Record<string, number>> | null,
      gear: bridge.gear,
      fights: bridge.combatLog?.foes ?? null,
      train: trainingSkill(route, progress, step),
    };
    const combat = combatPersonaliser(live, prices);
    const gather = gatherPersonaliser(state);
    const process = processPersonaliser(state);
    const personalise = (m: FundingMethod, tool?: string | null) => combat(m) ?? gather(m, tool) ?? process(m);
    return { now: Date.now(), prices, snap, reach, exchange: GRAND_EXCHANGE, personalise, observed, active: { foes: step.foes } };
  }, [mode, progress, state, bridge.stats, bridge.xp, bridge.gear, bridge.combatLog, observed]);
}

/**
 * The funding answer for one step: what it needs in coins, what the player has, and what to do about a shortage. Prices are loaded only while `wanted` -
 * a step that costs nothing never asks the exchange for anything.
 */
export function useFundingScreen(step: Step | null, wanted: boolean): FundingScreen {
  const engine = useReadinessEngine();
  const { state, ledger } = usePlayerState();
  const { progress } = useStore();
  const bridge = useBridge();
  const { plan: running, refreshPosition } = useFunding();
  const prices = usePriceView(wanted && step !== null);
  const snap = useFundingSnapshot(wanted && step ? step.id : null);
  const cleanup = useCleanupAdvice(wanted && step !== null);
  // The same window of steps ahead as the list the player is reading, so the two never disagree about what is needed.
  const ahead = styleOf(useFeatures()).lookAhead;
  const plan = running && running.sourceStepId === step?.id ? running : null;

  // Without a running plan the walk to a place is part of the estimate: the game is asked now and then where the player is.
  useEffect(() => {
    if (!wanted || !step || plan) return undefined;
    refreshPosition();
    const t = window.setInterval(refreshPosition, POSITION_IDLE_MS);
    return () => window.clearInterval(t);
  }, [wanted, step?.id, plan, refreshPosition]);

  // The way last shown for this step stays on top while another is not clearly better, so the card does not change its mind with every price tick.
  const shown = useRef<{ stepId: string; id: string } | null>(null);
  // A running plan shows its own step in hand; the advice is not recomputed under it.
  const base = useEvalBase(wanted && !plan ? step : null, snap, prices);
  const hitpoints = levelOf(state, 'hitpoints');
  const assessment = useMemo(() => {
    if (!wanted || !step || !snap || plan || !base) return null;
    const prep = engine.plan(step, { ahead });
    const manual = Object.fromEntries(Object.entries(progress.ownedManual ?? {}).map(([k, v]) => [k, v.count]));
    const need = buildNeed({ step, prep, prices, owned: state.owned, manual, hitpoints });
    const keep = shown.current?.stepId === step.id ? shown.current.id : null;
    const out = assess({
      step, need, snap, prices, recs: cleanup.live ? cleanup.result.recs : [], bankValue: bridge.gear?.bankValue ?? null, base, activeId: keep,
    });
    shown.current = out.recommendation ? { stepId: step.id, id: out.recommendation.id } : null;
    return out;
  }, [wanted, snap, plan, base, engine, step, progress, state.owned, hitpoints, prices, bridge.gear, cleanup.live, cleanup.result.recs, ahead]);

  const { view } = useFundingView(step?.id ?? '');
  const realized = useMemo(() => (plan ? realizedSince(ledger, plan.startedAt) : null), [plan, ledger]);
  return { assessment, snap, prices, plan, view, realized, live: cleanup.live };
}

// ---------------------------------------------------------------------------
// The Money section (2.71)

export interface MoneyScreen extends MoneyList {
  snap: FundingSnapshot | null;
  prices: PriceView;
  /** The plan that runs or waits, whichever step it was started from. */
  plan: FundingPlanState | null;
}

/**
 * The Money section's list for the step the player is on: every method of the catalogue judged with the same snapshot, prices, walk and combat model as
 * the coin card, ranked by the same rule. Browsing reads; it never starts, changes or closes anything.
 */
export function useMoneyScreen(step: Step): MoneyScreen {
  const { plan } = useFunding();
  const { assessment: a, snap, prices } = useFundingScreen(step, true);
  const base = useEvalBase(step, snap, prices);
  const activeId = plan?.methodId ?? null;
  const list = useMemo((): MoneyList => (base ? moneyList(base, a, { activeId }) : {
    evals: [], ranking: { best: null, list: [], needsAttention: [], cannotReach: [], kept: false }, rankedFor: { coins: 0, stepId: null }, shortfall: null,
  }), [base, a, activeId]);
  return { ...list, snap, prices, plan };
}

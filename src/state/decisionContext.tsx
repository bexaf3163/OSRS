// The one committed Decision for the whole app (v14): every page, the prep sync and the RuneLite bridge read what to do now
// from here. It is recomputed only when the facts it reads change (levels, items, quests, prices, marks, the owner's goal), and
// the previous decision is kept so a running objective stays sticky instead of being re-ranked from scratch.
import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createWalkingCosts } from '../domain/planning/trip';
import { acceptsDecision, type DecisionStamp } from '../domain/planning/scope';
import type { WorldPoint } from '../domain/player/playerState';
import type { PlanningSnapshot } from '../domain/planning/contracts';
import { requestTripRoutes } from '../services/tripRoutes';
import type { RouteBatch } from '../services/worldRoutes';
import { itemById } from '../data';
import { useStore } from './store';
import { useBridge } from './bridge';
import { usePlayerState } from './playerStateContext';
import { usePriceView } from './hooks/usePriceView';
import { useTradeRestriction } from './hooks/useTradeRestriction';
import { usePlanningIntent } from './planningIntent';
import { buildPlanningSnapshot, manualMarks } from '../domain/planning/snapshot';
import { questCatalogue } from '../domain/planning/catalogue';
import { runtimeDecision } from '../domain/planning/runtime';
import { planningWindow } from '../domain/planning/window';
import type { CommittedDecision } from '../domain/planning/contracts';
import { DecisionCtx, PlanWindowCtx, decisionStep, type DecisionValue } from './decision';
import type { Step } from '../types';
import { bestEarnRate, earnAction, gatherTime, levelledEarnRates, type EarnRate, type LevelledRate, type SupplyBase } from '../domain/planning/earn';
import { liquidOf } from '../domain/economy/funding/snapshot';
import { useEvalBaseFactory, useFunding, useSnapshotFactory } from './fundingContext';
import { levelForXp } from '../domain/player/xp';
import type { Minutes } from '../domain/planning/contracts';
import { travelInputOf } from '../domain/travel/travelInput';

/** Holds the Decision's window above the providers that prepare for it (readiness, funding, the bridge). */
export function PlanWindowProvider({ children }: { children: ReactNode }) {
  const [window, setWindow] = useState<readonly Step[]>([]);
  const value = useMemo(() => ({ window, setWindow }), [window]);
  return <PlanWindowCtx.Provider value={value}>{children}</PlanWindowCtx.Provider>;
}

export function DecisionProvider({ children }: { children: ReactNode }) {
  const { progress, steps } = useStore();
  const { state } = usePlayerState();
  const bridge = useBridge();
  const prices = usePriceView(true);
  const trade = useTradeRestriction();
  const { intent, readOnly } = usePlanningIntent();
  const previous = useRef<CommittedDecision | undefined>(undefined);
  const revision = useRef(0);
  const levelsKey = Object.entries(bridge.xp ?? {}).map(([skill, xp]) => `${skill}${levelForXp(xp ?? 0)}`).join() + JSON.stringify(progress.levels);
  // Planning is event driven: XP inside a level, walking and item pickups are applied together at most every 2 s, while a
  // new level, quest, bank read, character or mode replans at once. A RuneLite tick never runs the planner by itself.
  const structure = `${state.player}|${state.mode}|${state.connected}|${levelsKey}|${state.quests.known ? state.quests.value.length : -1}|${state.owned?.bankSeen}|${state.owned?.bankSavedAt ?? ''}`;
  const [heldState, heldXp, heldGear, heldStats] = useHeld([state, bridge.xp, bridge.gear, bridge.stats] as const, structure);
  // The snapshot changes only with the facts, so routes requested for it stay valid until the facts move on.
  const snapshot = useMemo(() => {
    const observation = bridge.questStates ?? null;
    const scope = {
      characterId: heldState.player ?? 'offline', mode: heldState.mode,
      gameSessionId: observation?.sessionId ?? (heldState.connected ? 'live' : 'offline'),
      snapshotRevision: ++revision.current,
    };
    return buildPlanningSnapshot({
      scope, player: heldState, catalogue: questCatalogue, observation, xp: heldXp, questPoints: bridge.questPoints,
      instruction: bridge.questInstruction, gear: heldGear, steps, manual: manualMarks(questCatalogue, progress.tasksDone),
    });
  }, [heldState, bridge.questStates, heldXp, bridge.questPoints, bridge.questInstruction, heldGear, steps, progress.tasksDone]);
  const [routes, setRoutes] = useState<readonly RouteBatch[]>([]);
  // The teleports this character can cast now; the from/to of the shared travel input are filled per leg by the planner.
  const teleports = useMemo(() => {
    const here = { x: 0, y: 0, plane: 0 };
    const { from, to, ...rest } = travelInputOf({ from: here, to: here, levels: progress.levels, stats: heldStats, gear: heldGear, owned: heldState.owned, mode: heldState.mode });
    return rest;
  }, [progress.levels, heldStats, heldGear, heldState.owned, heldState.mode]);
  // shortcut: the funding rate is ranked at the previous Decision's step (else the step the game shows; none before either, never
  // the old guide's first open step) because the method barely depends on the step; replace when Money ranks per objective.
  const rateStep = decisionStep(previous.current ?? null, steps) ?? steps.find(s => s.id === bridge.activeStepId) ?? null;
  const snapshotFor = useSnapshotFactory();
  const baseFor = useEvalBaseFactory();
  const { position } = useFunding();
  const cash = liquidOf(heldState).amount;
  // The Money ranking and the gathering estimates are heavy, so they run only when the plan first asks for them, and are
  // redone only on a material change (step, levels, mode, restriction, a price fetch, thousands of coins).
  const material = `${rateStep?.id ?? '-'}|${levelsKey}|${heldState.mode}|${trade.state}|${prices.at}|${cash === null ? '-' : Math.round(cash / 1000)}`;
  const { rate, levelled, gather } = useMemo(() => {
    let supply: SupplyBase | null | undefined;
    const base = () => (supply === undefined ? (supply = baseFor(rateStep, snapshotFor(rateStep?.id ?? null, position), prices)) : supply);
    const known = new Map<string, Minutes | null>();
    const gatherOne = (name: string, count: number) => {
      const key = `${name}:${count}`;
      if (!known.has(key)) { const b = base(); known.set(key, b ? gatherTime(b, new Map([[name, count]]), cash) : null); }
      return known.get(key) ?? null;
    };
    let best: EarnRate | null | undefined;
    const rate = () => { if (best === undefined) { const b = base(); best = b ? bestEarnRate(b, cash) : null; } return best; };
    let unlocks: LevelledRate[] | undefined;
    const levelled = () => (unlocks ??= base() ? levelledEarnRates(base()!, cash) : []);
    return { rate, levelled, gather: gatherOne };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material]);
  const value = useMemo((): DecisionValue & { missed: readonly Leg[] } => {
    if (!snapshot) return { decision: null, window: [], missed: [] };
    // Every leg the planner asks for and the worker has not answered is recorded, so the next pass can ask for exactly those.
    const known = createWalkingCosts(snapshot.scope, routes);
    const missed = new Map<string, Leg>();
    const walk = (from: WorldPoint | null, to: WorldPoint) => {
      const minutes = known(from, to);
      if (minutes === null && from) missed.set(legKey(from, to), { from, to });
      return minutes;
    };
    const decision = runtimeDecision({
      snapshot, intent: readOnly ? null : intent, previous: previous.current, progress, prices, steps,
      detail: id => itemById.get(id), ironman: bridge.accountType === 'ironman', restriction: trade.state, walk, teleports, gather,
      earn: (step, gp, _budget, goalId, train) => earnAction(snapshot, step, goalId, gp, rate(), train ? { levelled: levelled(), train } : undefined),
    });
    const current = decisionStep(decision, steps);
    return {
      decision, missed: [...missed.values()],
      window: decision && current ? planningWindow({ snapshot, decision, current, catalogue: questCatalogue, steps }) : [],
    };
  }, [snapshot, routes, rate, levelled, teleports, gather, bridge.accountType, steps, progress, prices, trade.state, intent, readOnly]);
  useEffect(() => { if (value.decision) previous.current = value.decision; }, [value.decision]);
  // Published upward only when its steps change: a new array of the same steps must not recompute readiness.
  const { setWindow } = useContext(PlanWindowCtx);
  const windowKey = value.window.map(s => `${s.id}:${s.type}`).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setWindow(value.window), [windowKey, setWindow]);
  useLegRoutes(snapshot, value.missed, setRoutes);
  return <DecisionCtx.Provider value={value}>{children}</DecisionCtx.Provider>;
}

interface Leg { from: WorldPoint; to: WorldPoint }
const legKey = (from: WorldPoint, to: WorldPoint) => `${from.x},${from.y},${from.plane}>${to.x},${to.y},${to.plane}`;

/** Asks the shared route worker once per snapshot for each walking leg the planner could not cost. A reply for an older
 * snapshot is refused, and a leg without a route stays UNKNOWN rather than a straight line. */
function useLegRoutes(snapshot: PlanningSnapshot | null, missed: readonly Leg[], setRoutes: (update: (prev: readonly RouteBatch[]) => readonly RouteBatch[]) => void) {
  const latest = useRef<DecisionStamp | null>(null);
  const asked = useRef({ revision: -1, legs: new Set<string>() });
  useEffect(() => {
    latest.current = snapshot ? { ...snapshot.scope, revision: snapshot.scope.snapshotRevision } : null;
  }, [snapshot]);
  useEffect(() => {
    if (!snapshot || !missed.length) return;
    const scope = snapshot.scope;
    if (asked.current.revision !== scope.snapshotRevision) asked.current = { revision: scope.snapshotRevision, legs: new Set() };
    const fresh = missed.filter(leg => !asked.current.legs.has(legKey(leg.from, leg.to)));
    if (!fresh.length) return;
    for (const leg of fresh) asked.current.legs.add(legKey(leg.from, leg.to));
    void requestTripRoutes({ ...scope, revision: scope.snapshotRevision }, fresh.map(leg => ({ origin: leg.from, stops: [{ at: leg.to }] })), () => latest.current)
      .then(batches => { if (batches?.length) setRoutes(prev => [...prev.filter(batch => acceptsDecision(scope, batch.scope)), ...batches]); });
  }, [snapshot, missed, setRoutes]);
}

/** A tuple that follows `key` at once, while its other changes are applied together at most every `settleMs`. */
function useHeld<T extends readonly unknown[]>(value: T, key: string, settleMs = 2000): T {
  const [held, setHeld] = useState({ value, key });
  const latest = useRef({ value, key });
  latest.current = { value, key };
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moved = held.key !== key || value.some((item, index) => item !== held.value[index]);
  useEffect(() => {
    if (!moved) return;
    if (held.key !== key) { setHeld(latest.current); return; }
    if (pending.current) return;
    pending.current = setTimeout(() => { pending.current = null; setHeld(latest.current); }, settleMs);
  });
  useEffect(() => () => { if (pending.current) clearTimeout(pending.current); }, []);
  return held.key === key ? held.value : value;
}

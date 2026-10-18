// The money plan of the app: the temporary detour that raises the coins a route step is short of, kept for one character, ticked by what the game shows, and
// read by the screens (FundingCard) and by the game's panel (FundingSync) through the same view.
//
// What lives here is wiring. The arithmetic is in lib/funding/*: the assessment (assess.ts), the plan's state machine (plan.ts), the earnings and pace
// from the resource journal (session.ts), the shared price board (quoteStore.ts). Nothing here changes the route: the step the plan was started for stays
// open and exactly where it was, and a plan ending only takes down its own arrow.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { stepById, stepsFor } from './data';
import { useBridge } from './bridge';
import { checkStatus } from './services/runeliteBridge';
import { useStore } from './store';
import { usePlayerState } from './playerStateContext';
import { useReadinessEngine } from './readinessContext';
import { useProfiles } from './lib/profiles';
import { useFeatures } from './lib/features';
import { styleOf } from './lib/playStyle';
import { useCleanupAdvice } from './lib/useCleanupAdvice';
import { reachTiles } from './lib/travel';
import { travelInputOf } from './lib/travelInput';
import { isClosed } from './lib/next-step';
import { buildNeed } from './lib/funding/need';
import { assess, type FundingAssessment, type FundingOption } from './lib/funding/assess';
import { combatPersonaliser } from './lib/funding/combatAdapter';
import { buildSnapshot, type FundingSnapshot } from './lib/funding/snapshot';
import {
  cancel as cancelPlan, confirm as confirmPlan, GRAND_EXCHANGE, loadPlan, mainOutputOf, NEAR_TILES, pause as pausePlan, planKey,
  resume as resumePlan, savePlan, startPlan, tick, viewOf, type FundingPlanState, type FundingView,
} from './lib/funding/plan';
import { addWork, loadRates, observedRates, ratesKey, realizedSince, saveRates, unitsOf, type RateBook, type Realized } from './lib/funding/session';
import { methodById } from './lib/funding/methods';
import { usePriceView } from './lib/funding/usePriceView';
import type { ObservedRate } from './lib/funding/evaluate';
import type { PriceView } from './lib/funding/quotes';
import type { Step } from './types';

/** The arrow of a funding plan carries this prefix, so it is only ever taken down by the plan that set it. */
export const FUNDING_ARROW = 'Funding: ';

const TICK_MS = 10_000;
/** How often the game is asked where the player is while a plan runs. */
const POSITION_MS = 4_000;
/** ...and while a card is open and no plan runs (only for the walking time in the estimate). */
const POSITION_IDLE_MS = 30_000;
/** A saved plan is rewritten at least this often while it runs; a change of sub-step is written at once. */
const SAVE_EVERY_MS = 60_000;
/** A cancelled plan with at least this much work still teaches the pace. */
const MIN_CREDIT_SECONDS = 120;
const ENDED_SHOWN_MS = 90_000;

function ls(): Storage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

const shape = (p: FundingPlanState): string => `${p.id}|${p.version}|${p.status}|${p.active}|${p.subSteps.map((s) => (s.done ? 1 : 0)).join('')}`;

// ---------------------------------------------------------------------------
// The snapshot of the player for a step

type Pos = { x: number; y: number; plane: number } | null;

/** The one funding snapshot for a step: the player's state, the account facts and what the steps around it protect. null for no step. */
function useSnapshotFor(stepId: string | null, position: Pos): FundingSnapshot | null {
  const engine = useReadinessEngine();
  const { state } = usePlayerState();
  const { progress } = useStore();
  const { questPoints, totalLevel, accountType } = useBridge();
  const override = progress.sellRestrictions;
  return useMemo(() => {
    if (!stepId) return null;
    const window = engine.trip(stepId).stepIds.map((id) => stepById.get(id)).filter((s): s is Step => Boolean(s));
    return buildSnapshot({
      state, window, questPoints, totalLevel, ironman: accountType === null ? null : accountType === 'ironman', sellOverride: override, position,
    });
  }, [engine, state, stepId, questPoints, totalLevel, accountType, override, position]);
}

/** The same snapshot for the screens; the position is the one the provider last asked the game for. */
export function useFundingSnapshot(stepId: string | null): FundingSnapshot | null {
  return useSnapshotFor(stepId, useFunding().position);
}

// ---------------------------------------------------------------------------
// The running plan

interface FundingValue {
  /** The plan that runs or waits (active or paused) for this character; null — none. */
  plan: FundingPlanState | null;
  /** A plan that has just been finished: one line is shown and then forgotten. */
  ended: { title: string; at: number; stepId: string } | null;
  dismissEnded: () => void;
  /** Where the game last said the player stands; null - not known. The app does not track it: it asks while a plan runs or a card is open. */
  position: Pos;
  /** Ask the game where the player is now (one small request). */
  refreshPosition: () => void;
  /** The pace the player really worked at, for methods with enough work behind them. */
  observed: ReadonlyMap<string, ObservedRate>;
  /** The player cleared the arrow by hand: the plan does not set it again until asked. */
  arrowOff: boolean;
  showArrow: () => void;
  start: (assessment: FundingAssessment, option: FundingOption, snap: FundingSnapshot) => void;
  pause: () => void;
  resume: (snap: FundingSnapshot) => void;
  cancel: () => void;
  confirm: (subStepId: string, snap: FundingSnapshot) => void;
}

const Ctx = createContext<FundingValue | null>(null);

export function FundingProvider({ children }: { children: ReactNode }) {
  const { state, ledger } = usePlayerState();
  const profiles = useProfiles();
  const { navTarget, navigate, releaseNav, userClearedAt } = useBridge();
  const character = state.player;
  const key = planKey(profiles.active, character);

  const [held, setHeld] = useState<{ key: string; plan: FundingPlanState | null }>(() => ({ key, plan: loadPlan(ls(), key, character, Date.now()) }));
  // Another character or profile: that one's plan is loaded and the earlier one is left alone (it is saved under its own key).
  if (held.key !== key) setHeld({ key, plan: loadPlan(ls(), key, character, Date.now()) });
  const plan = held.key === key ? held.plan : null;

  const planRef = useRef<FundingPlanState | null>(plan);
  planRef.current = plan;
  const keyRef = useRef(key);
  keyRef.current = key;
  const savedAt = useRef(0);
  const savedShape = useRef(plan ? shape(plan) : '');

  const [rates, setRates] = useState<{ key: string; book: RateBook }>(() => {
    const k = ratesKey(profiles.active, character);
    return { key: k, book: loadRates(ls(), k) };
  });
  const rKey = ratesKey(profiles.active, character);
  if (rates.key !== rKey) setRates({ key: rKey, book: loadRates(ls(), rKey) });
  const rateBook = rates.key === rKey ? rates.book : {};
  const rateRef = useRef({ key: rKey, book: rateBook });
  rateRef.current = { key: rKey, book: rateBook };
  const observed = useMemo(() => observedRates(rateBook), [rateBook]);

  const [ended, setEnded] = useState<FundingValue['ended']>(null);
  // The line "you have the coins" says its piece and goes.
  useEffect(() => {
    if (!ended) return undefined;
    const t = window.setTimeout(() => setEnded(null), ENDED_SHOWN_MS);
    return () => window.clearTimeout(t);
  }, [ended]);
  const ledgerRef = useRef(ledger);
  ledgerRef.current = ledger;

  // Where the player stands: asked of the game every few seconds while a plan runs (the sub-steps are "get to the place"), and once per card by the screens.
  const { enabled, state: link, inGame } = useBridge();
  const [position, setPosition] = useState<Pos>(null);
  const live = enabled && link === 'online' && inGame;
  const refreshPosition = useCallback(() => {
    if (!live) { setPosition((p) => (p === null ? p : null)); return; }
    void checkStatus().then((st) => {
      const next = st.online && st.inGame ? st.pos : null;
      // The same tile is the same value: nothing downstream recomputes for a player standing still.
      setPosition((p) => (p === next || (p && next && p.x === next.x && p.y === next.y && p.plane === next.plane) ? p : next));
    }).catch(() => undefined);
  }, [live]);
  const running = plan?.status === 'ACTIVE';
  useEffect(() => {
    if (!running) return undefined;
    refreshPosition();
    const t = window.setInterval(refreshPosition, POSITION_MS);
    return () => window.clearInterval(t);
  }, [running, refreshPosition]);

  const sourceStep = plan?.sourceStepId ?? null;
  const snap = useSnapshotFor(sourceStep, position);
  const snapRef = useRef(snap);
  snapRef.current = snap;

  /** Put a plan in place. A change of shape (a sub-step done, a pause) is saved at once; time worked is saved now and then. */
  const commit = useCallback((next: FundingPlanState | null, force = false) => {
    planRef.current = next;
    const sig = next ? shape(next) : '';
    const now = Date.now();
    if (force || sig !== savedShape.current || now - savedAt.current >= SAVE_EVERY_MS) {
      savePlan(ls(), keyRef.current, next);
      savedAt.current = now;
    }
    if (sig !== savedShape.current) {
      savedShape.current = sig;
      setHeld({ key: keyRef.current, plan: next });
    }
  }, []);

  /** A plan ends: what it taught about the pace is kept, its arrow comes down, the saved copy goes. */
  const finish = useCallback((p: FundingPlanState, status: 'DONE' | 'CANCELLED') => {
    const m = p.methodId ? methodById(p.methodId) : undefined;
    const main = m ? mainOutputOf(m) : null;
    if (m && main && main.perUnit > 0 && p.workSeconds >= MIN_CREDIT_SECONDS) {
      const items = unitsOf(ledgerRef.current, p.startedAt, [main.name]);
      const book = addWork(rateRef.current.book, m.id, items / main.perUnit, p.workSeconds);
      if (book !== rateRef.current.book) {
        saveRates(ls(), rateRef.current.key, book);
        setRates({ key: rateRef.current.key, book });
      }
    }
    savePlan(ls(), keyRef.current, null);
    savedShape.current = '';
    planRef.current = null;
    setHeld({ key: keyRef.current, plan: null });
    if (status === 'DONE') setEnded({ title: p.title, at: Date.now(), stepId: p.sourceStepId });
  }, []);

  const tickWith = useCallback((s: FundingSnapshot) => {
    const cur = planRef.current;
    if (!cur || cur.status !== 'ACTIVE') return;
    const next = tick(cur, s, Date.now());
    if (next === cur) return;
    if (next.status === 'DONE') finish(next, 'DONE');
    else commit(next);
  }, [commit, finish]);

  // The game reported something new.
  useEffect(() => { if (snap) tickWith(snap); }, [snap, tickWith]);
  // Time passes with nothing new to report (a long kill, a long walk): the work seconds still count.
  useEffect(() => {
    if (!plan || plan.status !== 'ACTIVE') return undefined;
    const t = window.setInterval(() => { if (snapRef.current) tickWith(snapRef.current); }, TICK_MS);
    return () => window.clearInterval(t);
  }, [plan?.id, plan?.status, tickWith]); // eslint-disable-line react-hooks/exhaustive-deps

  // The latest time-worked figure is written once more when the window closes.
  useEffect(() => {
    const onHide = () => { if (planRef.current) savePlan(ls(), keyRef.current, planRef.current); };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  // --- The arrow -------------------------------------------------------------
  const [arrowOff, setArrowOff] = useState(false);
  const seenClear = useRef(userClearedAt);
  const claimed = useRef(new Set<string>());
  const tries = useRef(new Map<string, number>());
  useEffect(() => {
    if (userClearedAt === seenClear.current) return;
    seenClear.current = userClearedAt;
    // The player took the arrow down on purpose while a plan was leading them: the plan does not put it back.
    if (planRef.current?.status === 'ACTIVE' && navTarget === null) setArrowOff(true);
  }, [userClearedAt, navTarget]);
  useEffect(() => { setArrowOff(false); }, [plan?.id]);

  useEffect(() => {
    const standingOurs = navTarget?.label.startsWith(FUNDING_ARROW) ?? false;
    const sub = plan && plan.status === 'ACTIVE' ? plan.subSteps[Math.min(plan.active, plan.subSteps.length - 1)] : null;
    const place = sub && sub.kind !== 'resume' ? sub.place : undefined;
    const pos = snap?.position ?? null;
    const there = Boolean(place && pos && pos.plane === place.plane && Math.max(Math.abs(pos.x - place.x), Math.abs(pos.y - place.y)) <= NEAR_TILES);
    if (!plan || !sub || !place || there || arrowOff || !snap?.connected) {
      // The plan ended, paused, or the player is where it wants them: its own arrow comes down, nobody else's.
      if (standingOurs) void releaseNav();
      return;
    }
    // The route's or the player's own arrow stands: the plan takes it once, when started, and leaves it alone after that.
    if (navTarget && !standingOurs && claimed.current.has(plan.id)) return;
    if (standingOurs && navTarget!.x === place.x && navTarget!.y === place.y && navTarget!.plane === place.plane) return;
    const k = `${plan.id}:${sub.id}`;
    const n = (tries.current.get(k) ?? 0) + 1;
    tries.current.set(k, n);
    // No more than three times per sub-step: if the game clears it at once, the plan does not loop.
    if (n > 3) return;
    claimed.current.add(plan.id);
    const label = `${FUNDING_ARROW}${sub.text}`.slice(0, 60);
    void navigate({ label, x: place.x, y: place.y, plane: place.plane });
  }, [plan, snap, navTarget, arrowOff, navigate, releaseNav]);

  const start = useCallback((assessment: FundingAssessment, option: FundingOption, s: FundingSnapshot) => {
    const method = option.evaluation?.method;
    const made = startPlan(assessment, option, s, method, Date.now());
    if (!made) return;
    setEnded(null);
    setArrowOff(false);
    if (made.status === 'DONE') { finish(made, 'DONE'); return; }
    commit(made, true);
  }, [commit, finish]);

  const pause = useCallback(() => {
    const cur = planRef.current;
    if (cur) commit(pausePlan(cur, Date.now()), true);
  }, [commit]);
  const resume = useCallback((s: FundingSnapshot) => {
    const cur = planRef.current;
    if (!cur) return;
    setArrowOff(false);
    commit(resumePlan(cur, s, Date.now()), true);
  }, [commit]);
  const cancel = useCallback(() => {
    const cur = planRef.current;
    if (cur) finish(cancelPlan(cur, Date.now()), 'CANCELLED');
  }, [finish]);
  const confirm = useCallback((id: string, s: FundingSnapshot) => {
    const cur = planRef.current;
    if (!cur) return;
    const next = confirmPlan(cur, id, s, Date.now());
    if (next === cur) return;
    if (next.status === 'DONE') finish(next, 'DONE');
    else commit(next, true);
  }, [commit, finish]);

  const value = useMemo<FundingValue>(() => ({
    plan, ended, dismissEnded: () => setEnded(null), position, refreshPosition, observed, arrowOff, showArrow: () => { tries.current.clear(); setArrowOff(false); },
    start, pause, resume, cancel, confirm,
  }), [plan, ended, position, refreshPosition, observed, arrowOff, start, pause, resume, cancel, confirm]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFunding(): FundingValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFunding outside FundingProvider');
  return v;
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

/**
 * The funding answer for one step: what it needs in coins, what the player has, and what to do about a shortage. Prices are loaded only while `wanted` -
 * a step that costs nothing never asks the exchange for anything.
 */
export function useFundingScreen(step: Step, wanted: boolean): FundingScreen {
  const engine = useReadinessEngine();
  const { state, ledger } = usePlayerState();
  const { progress, mode } = useStore();
  const bridge = useBridge();
  const { plan: running, observed, refreshPosition } = useFunding();
  const prices = usePriceView(wanted);
  const snap = useFundingSnapshot(wanted ? step.id : null);
  const cleanup = useCleanupAdvice();
  // The same window of steps ahead as the list the player is reading, so the two never disagree about what is needed.
  const ahead = styleOf(useFeatures()).lookAhead;
  const plan = running && running.sourceStepId === step.id ? running : null;

  // Without a running plan the walk to a place is part of the estimate: the game is asked now and then where the player is.
  useEffect(() => {
    if (!wanted || plan) return undefined;
    refreshPosition();
    const t = window.setInterval(refreshPosition, POSITION_IDLE_MS);
    return () => window.clearInterval(t);
  }, [wanted, plan, refreshPosition]);

  // The way last shown for this step stays on top while another is not clearly better, so the card does not change its mind with every price tick.
  const shown = useRef<{ stepId: string; id: string } | null>(null);
  const assessment = useMemo(() => {
    // A running plan shows its own step in hand; the advice is not recomputed under it.
    if (!wanted || !snap || plan) return null;
    const prep = engine.plan(step, { ahead });
    const manual = Object.fromEntries(Object.entries(progress.ownedManual ?? {}).map(([k, v]) => [k, v.count]));
    const need = buildNeed({ step, prep, prices, owned: state.owned, manual });
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
    const keep = shown.current?.stepId === step.id ? shown.current.id : null;
    const out = assess({
      step, need, snap, prices, recs: cleanup.live ? cleanup.result.recs : [], bankValue: bridge.gear?.bankValue ?? null,
      base: { now: Date.now(), prices, snap, reach, exchange: GRAND_EXCHANGE, personalise: combatPersonaliser(live, prices), observed, active: { foes: step.foes } },
      activeId: keep,
    });
    shown.current = out.recommendation ? { stepId: step.id, id: out.recommendation.id } : null;
    return out;
  }, [wanted, snap, plan, engine, step, progress, state.owned, prices, mode, bridge.stats, bridge.xp, bridge.gear, bridge.combatLog, cleanup.live, cleanup.result.recs, observed, ahead]);

  const { view } = useFundingView(step.id);
  const realized = useMemo(() => (plan ? realizedSince(ledger, plan.startedAt) : null), [plan, ledger]);
  return { assessment, snap, prices, plan, view, realized, live: cleanup.live };
}

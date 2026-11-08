// Persisted funding intent and its subordinate observation machine. Global selection stays outside this provider.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useBridge } from './bridge';
import { usePlayerState } from './playerStateContext';
import { useProfiles } from './profiles';
import { checkStatus } from '../services/runeliteBridge';
import type { FundingAssessment, FundingOption } from '../domain/economy/funding/assess';
import type { FundingSnapshot } from '../domain/economy/funding/snapshot';
import type { MoneyGoal } from '../domain/economy/funding/browse';
import type { MethodEvaluation, ObservedRate } from '../domain/economy/funding/evaluate';
import { cancel as cancelPlan, confirm as confirmPlan, loadPlan, mainOutputOf, NEAR_TILES, pause as pausePlan, planKey,
  resume as resumePlan, savePlan, startMethodPlan, startPlan, tick, type FundingPlanState } from '../domain/economy/funding/plan';
import { addWork, loadRates, observedRates, ratesKey, saveRates, unitsOf, type RateBook } from '../domain/economy/funding/session';
import { methodById } from '../domain/economy/funding/methods';

type Pos = { x: number; y: number; plane: number } | null;

/** The arrow of a funding plan carries this prefix, so it is only ever taken down by the plan that set it. */
const FUNDING_ARROW = 'Funding: ';

const TICK_MS = 10_000;
/** How often the game is asked where the player is while a plan runs. */
const POSITION_MS = 4_000;
/** A saved plan is rewritten at least this often while it runs; a change of sub-step is written at once. */
const SAVE_EVERY_MS = 60_000;
/** A cancelled plan with at least this much work still teaches the pace. */
const MIN_CREDIT_SECONDS = 120;
const ENDED_SHOWN_MS = 90_000;
/** One empty rate book for every render while another one loads, so the memos below keep their inputs. */
const NO_RATES: RateBook = {};

function ls(): Storage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

const shape = (p: FundingPlanState): string => `${p.id}|${p.version}|${p.status}|${p.active}|${p.subSteps.map((s) => (s.done ? 1 : 0)).join('')}`;

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
  /**
   * One earning method toward the goal the player chose (the Money section). A plan that runs or waits is ended first (an explicit switch); the route step
   * is not touched. false - it cannot start now (lib/funding/plan.ts goalBlocker says why).
   */
  startMethod: (e: MethodEvaluation, goal: MoneyGoal, stepId: string, snap: FundingSnapshot) => boolean;
  pause: () => void;
  resume: (snap: FundingSnapshot) => void;
  cancel: () => void;
  confirm: (subStepId: string, snap: FundingSnapshot) => void;
}

const Ctx = createContext<FundingValue | null>(null);

export function FundingPlanProvider({ children, snapshotFor }: { children: ReactNode; snapshotFor: (stepId: string | null, position: Pos) => FundingSnapshot | null }) {
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
  const rateBook = rates.key === rKey ? rates.book : NO_RATES;
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
  const live = enabled && link === 'online' && inGame && state.connected;
  const positionOwner = useRef({ live, character, generation: 0, request: 0 });
  if (positionOwner.current.live !== live || positionOwner.current.character !== character) {
    positionOwner.current = { live, character, generation: positionOwner.current.generation + 1, request: 0 };
  }
  useEffect(() => { setPosition(null); }, [live, character]);
  useEffect(() => () => { positionOwner.current.generation++; }, []);
  const refreshPosition = useCallback(() => {
    if (!live) { setPosition((p) => (p === null ? p : null)); return; }
    const generation = positionOwner.current.generation;
    const request = ++positionOwner.current.request;
    void checkStatus().then((st) => {
      const owner = positionOwner.current;
      if (generation !== owner.generation || request !== owner.request || !owner.live) return;
      if (character && st.player && character.toLowerCase() !== st.player.toLowerCase()) return;
      const next = st.online && st.inGame ? st.pos : null;
      // The same tile is the same value: nothing downstream recomputes for a player standing still.
      setPosition((p) => (p === next || (p && next && p.x === next.x && p.y === next.y && p.plane === next.plane) ? p : next));
    }).catch(() => undefined);
  }, [live, character]);
  const running = plan?.status === 'ACTIVE';
  useEffect(() => {
    if (!running) return undefined;
    refreshPosition();
    const t = window.setInterval(refreshPosition, POSITION_MS);
    return () => window.clearInterval(t);
  }, [running, refreshPosition]);

  const sourceStep = plan?.sourceStepId ?? null;
  const snap = useMemo(() => snapshotFor(sourceStep, position), [snapshotFor, sourceStep, position]);
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

  /** A new plan replaces the one that runs or waits: what that one taught about the pace is kept, its arrow comes down, its route step stays as it was. */
  const replaceRunning = useCallback(() => {
    const cur = planRef.current;
    if (cur) finish(cancelPlan(cur, Date.now()), 'CANCELLED');
  }, [finish]);

  const start = useCallback((assessment: FundingAssessment, option: FundingOption, s: FundingSnapshot) => {
    const method = option.evaluation?.method;
    const made = startPlan(assessment, option, s, method, Date.now());
    if (!made) return;
    replaceRunning();
    setEnded(null);
    setArrowOff(false);
    if (made.status === 'DONE') { finish(made, 'DONE'); return; }
    commit(made, true);
  }, [commit, finish, replaceRunning]);

  const startMethod = useCallback((e: MethodEvaluation, goal: MoneyGoal, stepId: string, s: FundingSnapshot) => {
    const made = startMethodPlan(e, goal, stepId, s, Date.now());
    if (!made) return false;
    replaceRunning();
    setEnded(null);
    setArrowOff(false);
    if (made.status === 'DONE') finish(made, 'DONE');
    else commit(made, true);
    return true;
  }, [commit, finish, replaceRunning]);

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
    start, startMethod, pause, resume, cancel, confirm,
  }), [plan, ended, position, refreshPosition, observed, arrowOff, start, startMethod, pause, resume, cancel, confirm]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFunding(): FundingValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFunding outside FundingProvider');
  return v;
}


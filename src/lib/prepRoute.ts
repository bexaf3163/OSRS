// The preparation route for a step: what exactly to do before leaving, in what order, and the return to the step when all is ready.
// Built from readiness (readiness.ts): one state, no checks of its own. Preparation does not break the main
// route: every trip for preparation is a "detour" (DetourFrame) with a return condition; the depth of detours is at most three,
// repeating the same detour is forbidden, and what was done does not send the player there again. It buys nothing.

import type { Step } from '../types';
import type { ReadinessAction, RequirementStatus, StepReadiness } from './readiness';

/** How urgent: now, soon (the next steps), later. */
export type Urgency = 'NOW' | 'SOON' | 'LATER';
/** Mandatory, recommended, optional: the player cannot be forced to do the optional. */
export type Need = 'REQUIRED' | 'RECOMMENDED' | 'OPTIONAL';

export type TaskKind = 'block' | 'quest' | 'stat' | 'buy' | 'money' | 'bank';

export interface PrepTask {
  /** A stable key: the same task has the same id at any recount. */
  id: string;
  kind: TaskKind;
  label: string;
  detail?: string;
  /** The lower the earlier: 1 closed, 2 survival, 3 mandatory gear and items, 4 levels, 5 time saving, 6 convenience, 7 optional. */
  priority: number;
  need: Need;
  urgency: Urgency;
  action?: ReadinessAction;
  /** For a "reach the level" task: the skill and the goal, by which a training method is chosen. */
  stat?: { skill: string; min: number };
  /** For the "collect" and "buy" tasks: the English item names in order. */
  items?: string[];
  /** Which readiness lines the task is made of. */
  from: RequirementStatus[];
}

export interface PrepRoute {
  stepId: string;
  /** All the tasks in order of doing. */
  tasks: PrepTask[];
  /** The main thing now: one. */
  primary: PrepTask | null;
  /** No more than two next ones: the rest is collapsed. */
  next: PrepTask[];
  hidden: number;
  /** Where we return when all is done. */
  returnTo: string;
  /** No preparation: the step is ready (no problems among the mandatory). */
  ready: boolean;
}

const BLOCK = new Set(['mode', 'step', 'qp']);

/** Whether the requirement is mandatory: "needed during the quest" (hard=false) does not prevent starting the step. */
const needOf = (r: RequirementStatus): Need => (r.hard ? 'REQUIRED' : 'OPTIONAL');

function priorityOf(r: RequirementStatus): number {
  if (!r.hard) return 6;
  if (BLOCK.has(r.kind) || r.kind === 'quest') return 1;
  if (r.kind === 'item' || r.kind === 'coins') return 3;
  if (r.kind === 'skill') return 4;
  return 5;
}

export function buildPrepRoute(r: StepReadiness, step: Pick<Step, 'id'>): PrepRoute {
  const tasks: PrepTask[] = [];
  const bank: RequirementStatus[] = [];
  const buy: RequirementStatus[] = [];
  for (const p of r.problems) {
    if (p.state === 'BANK') {
      bank.push(p);
    } else if (p.kind === 'item' && p.hard) {
      buy.push(p);
    } else if (p.kind === 'coins') {
      tasks.push({ id: 'money', kind: 'money', label: `Coins: ${p.label}`, detail: p.detail, priority: 3, need: 'REQUIRED', urgency: 'NOW', ...(p.action ? { action: p.action } : {}), from: [p] });
    } else if (p.kind === 'skill') {
      tasks.push({ id: `stat:${p.label.toLowerCase()}`, kind: 'stat', label: p.label, detail: p.detail, priority: priorityOf(p), need: needOf(p), urgency: p.hard ? 'NOW' : 'LATER', ...(p.action ? { action: p.action } : {}), ...(p.stat ? { stat: p.stat } : {}), from: [p] });
    } else if (p.kind === 'quest' || p.kind === 'step' || p.kind === 'qp' || p.kind === 'mode') {
      tasks.push({ id: `${p.kind}:${p.label.toLowerCase()}`, kind: p.kind === 'quest' ? 'quest' : 'block', label: p.label, detail: p.detail, priority: priorityOf(p), need: needOf(p), urgency: 'NOW', ...(p.action ? { action: p.action } : {}), from: [p] });
    } else {
      tasks.push({ id: `${p.kind}:${p.label.toLowerCase()}`, kind: 'buy', label: p.label, detail: p.detail, priority: priorityOf(p), need: needOf(p), urgency: p.hard ? 'NOW' : 'LATER', ...(p.action ? { action: p.action } : {}), from: [p] });
    }
  }
  // Everything that is in the bank is one trip: "take from the bank: A, B, coins".
  if (bank.length) {
    const nav = bank.find((b) => b.action?.kind === 'nav')?.action;
    tasks.push({
      id: 'bank', kind: 'bank', label: `Take from the bank: ${bank.map((b) => b.label).join(', ')}`, priority: 3, need: 'REQUIRED', urgency: 'NOW',
      ...(nav ? { action: nav } : {}), items: bank.flatMap((b) => (b.item ? [b.item] : [])), from: bank,
    });
  }
  // Everything that must be bought is one purchase.
  if (buy.length) {
    tasks.push({
      id: 'buy', kind: 'buy', label: `Buy: ${buy.map((b) => b.label).join(', ')}`, priority: 3, need: 'REQUIRED', urgency: 'NOW',
      action: { kind: 'link', label: '🛒 To shopping', href: '#/shopping' }, items: buy.flatMap((b) => (b.item ? [b.item] : [])), from: buy,
    });
  }
  tasks.sort((a, b) => a.priority - b.priority || (a.id < b.id ? -1 : 1));
  const required = tasks.filter((t) => t.need === 'REQUIRED');
  const shown = required.length ? tasks : [];
  return {
    stepId: step.id,
    tasks: shown,
    primary: shown[0] ?? null,
    next: shown.slice(1, 3),
    hidden: Math.max(0, shown.length - 3),
    returnTo: step.id,
    ready: required.length === 0,
  };
}

/**
 * Which preparation tasks are not yet done: both those surely not done and those that cannot be checked. A detour is cleared
 * only when the task is done by data, not when the data disappeared (the connection dropped, the page reloaded):
 * "unknown" is not "done".
 */
export function openTaskIds(r: StepReadiness, step: Pick<Step, 'id'>): Set<string> {
  const ids = new Set(buildPrepRoute(r, step).tasks.map((t) => t.id));
  for (const u of r.unknown) {
    if (u.kind === 'skill') ids.add(`stat:${u.label.toLowerCase()}`);
    else if (u.kind === 'item') { ids.add('buy'); ids.add('bank'); }
    else if (u.kind === 'coins') { ids.add('money'); ids.add('bank'); }
    else ids.add(`${u.kind}:${u.label.toLowerCase()}`);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Detours: a stack with a return condition. Kept between launches (one record per profile).

export const MAX_DETOUR_DEPTH = 3;

export interface DetourFrame {
  sourceStepId: string;
  /** The id of the preparation task (PrepTask.id) for which the detour was started. */
  detourId: string;
  reason: string;
  startedAt: number;
  /** A human-readable return condition: "Fishing 20 reached". */
  returnCondition: string;
  /** The player removed the arrow themselves: auto-prepare no longer sets it until they press "Continue". */
  paused?: boolean;
}

export interface PrepState {
  stack: DetourFrame[];
  /** The completed detours "step:task": we do not offer them a second time ourselves. */
  done: string[];
}

export const emptyPrep = (): PrepState => ({ stack: [], done: [] });

const doneKey = (stepId: string, detourId: string) => `${stepId}:${detourId}`;

export type StartResult =
  | { ok: true; state: PrepState }
  /** The detour did not start: depth or a loop: the tasks stay as a list on the screen. */
  | { ok: false; state: PrepState; reason: 'DEPTH' | 'CYCLE' | 'DONE_BEFORE' };

export function startDetour(state: PrepState, frame: DetourFrame): StartResult {
  if (state.stack.some((f) => f.detourId === frame.detourId && f.sourceStepId === frame.sourceStepId)) return { ok: false, state, reason: 'CYCLE' };
  if (state.done.includes(doneKey(frame.sourceStepId, frame.detourId))) return { ok: false, state, reason: 'DONE_BEFORE' };
  if (state.stack.length >= MAX_DETOUR_DEPTH) return { ok: false, state, reason: 'DEPTH' };
  return { ok: true, state: { ...state, stack: [...state.stack, frame] } };
}

/**
 * Checking against readiness: a detour whose task is no longer open is done: it is removed from the stack, and what was done
 * is remembered. It returns the step to go back to (the source of the top detour if one is left, otherwise
 * the source of the last one removed).
 */
export function reconcile(state: PrepState, openTasks: (stepId: string) => Set<string> | null): { state: PrepState; returnTo: string | null } {
  const stack = [...state.stack];
  const done = new Set(state.done);
  let returnTo: string | null = null;
  while (stack.length) {
    const top = stack[stack.length - 1];
    const open = openTasks(top.sourceStepId);
    // The step's readiness is unknown (the step is gone, no data): we keep the detour: nothing is lost silently.
    if (open === null) break;
    if (open.has(top.detourId)) break;
    done.add(doneKey(top.sourceStepId, top.detourId));
    stack.pop();
    returnTo = top.sourceStepId;
  }
  return { state: { stack, done: [...done].slice(-200) }, returnTo: stack.length ? stack[stack.length - 1].sourceStepId : returnTo };
}

export const PREP_KEY = 'osrs-put:prep';

/** Broken data in storage means an empty state: nothing crashes. */
export function parsePrep(raw: string | null): PrepState {
  try {
    const d = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const stack = Array.isArray(d.stack)
      ? d.stack.filter((f): f is DetourFrame => !!f && typeof f === 'object'
        && typeof (f as DetourFrame).sourceStepId === 'string' && typeof (f as DetourFrame).detourId === 'string'
        && typeof (f as DetourFrame).reason === 'string' && typeof (f as DetourFrame).startedAt === 'number'
        && typeof (f as DetourFrame).returnCondition === 'string').slice(0, MAX_DETOUR_DEPTH)
      : [];
    const done = Array.isArray(d.done) ? d.done.filter((x): x is string => typeof x === 'string').slice(-200) : [];
    return { stack, done };
  } catch {
    return emptyPrep();
  }
}

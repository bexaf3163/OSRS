// The auto-queue for preparation: it lines up what to do before the step and leads the arrow first to the first thing, then to the second,
// until nothing is left, and then returns to the step. The player does not need to press "Start preparing".
//
// Safety rules:
//  - the arrow is set only when the task has a place (a bank, a shop, a training place) and the player has no other target;
//  - if the player removed the arrow themselves, the queue is paused until they press "Continue";
//  - "unknown" starts nothing and closes nothing (no data: we stay silent);
//  - repeats and loops are forbidden by the same detour rules (prepRoute.startDetour); what was done is not offered again;
//  - nothing is bought and nothing is done in the game for the player: an arrow and a hint, they decide.

import type { GameMode } from '../types';
import type { ReadinessAction } from './readiness';
import { startDetour, type DetourFrame, type PrepRoute, type PrepState, type PrepTask } from './prepRoute';
import type { PlayerState } from './playerState';
import { adviseTraining } from './trainingRouter';
import { exchangeNav, trainingNav } from './trainingNav';
import type { PlayStyle } from './playStyle';

export interface QueueTask extends PrepTask {
  /** Where to lead the arrow; null means there is no place (a quest, a step, coins): only a hint. */
  guide: ReadinessAction | null;
  /** The training method's name, for the "reach the level" tasks. */
  method?: string;
}

export interface PrepQueue {
  stepId: string;
  tasks: QueueTask[];
  ready: boolean;
}

export interface QueueContext {
  state: PlayerState;
  mode: GameMode;
  style: PlayStyle;
}

/** Adds "where to lead" to the preparation route: a bank as is, a level is the method's place, a purchase is the Grand Exchange. */
export function buildQueue(route: PrepRoute, ctx: QueueContext): PrepQueue {
  const tasks = route.tasks.map((t): QueueTask => {
    if (t.action?.kind === 'nav') return { ...t, guide: t.action };
    if (t.kind === 'stat' && t.stat) {
      const advice = adviseTraining({ skill: t.stat.skill, target: t.stat.min, state: ctx.state, mode: ctx.mode, style: ctx.style });
      const best = advice.best;
      if (best) {
        const nav = trainingNav(best.method);
        return { ...t, method: best.method.name, guide: nav ? { kind: 'nav', label: `🧭 Go to: ${nav.label}`, target: nav } : null };
      }
      return { ...t, guide: null };
    }
    if (t.kind === 'buy' && t.items?.length) {
      const nav = exchangeNav(t.items[0]);
      return { ...t, guide: nav ? { kind: 'nav', label: `🧭 To the exchange: ${t.items[0]}`, target: nav } : null };
    }
    return { ...t, guide: null };
  });
  return { stepId: route.stepId, tasks, ready: route.ready };
}

// ---------------------------------------------------------------------------
// Decision: what the queue does now

export interface AutoInput {
  queue: PrepQueue | null;
  stepId: string;
  prep: PrepState;
  /** Auto-prepare is on in the settings. */
  enabled: boolean;
  /** There is a live connection to the game: without it "lacking" may turn out to be "unknown". */
  online: boolean;
  /** Some arrow target is already set in the game. */
  navActive: boolean;
  announce: 'quiet' | 'full';
  now: number;
  /** When this task was last retargeted: key to time. Not more than once a minute. */
  recent: ReadonlyMap<string, number>;
  /** The player's refusals in this session: "step:task". */
  declined: ReadonlySet<string>;
}

export type AutoDecision =
  /** Start a detour and set the arrow. */
  | { kind: 'start'; task: QueueTask; frame: DetourFrame; state: PrepState }
  /** A detour is going on and the plugin cleared the arrow (the item was taken, the place reached), the task is not done yet: set it to the next. */
  | { kind: 'renav'; task: QueueTask; key: string }
  /** The next task without a place: just say what is next. */
  | { kind: 'announce'; task: QueueTask; key: string };

export const RENAV_GAP_MS = 60_000;

const targetKey = (a: ReadinessAction | null): string => (a?.kind === 'nav' ? `${a.target.x},${a.target.y},${a.target.itemName ?? ''}` : '');

export function decideAuto(i: AutoInput): AutoDecision | null {
  const { queue, stepId } = i;
  if (!i.enabled || !i.online || !queue || queue.stepId !== stepId || queue.ready) return null;
  const mine = i.prep.stack.filter((f) => f.sourceStepId === stepId);
  if (mine.some((f) => f.paused)) return null;

  if (mine.length) {
    // A detour is going on: we retarget only if there is no arrow while the task is still open and has a place.
    const top = mine[mine.length - 1];
    const task = queue.tasks.find((t) => t.id === top.detourId);
    if (!task || i.navActive || task.guide?.kind !== 'nav') return null;
    const key = `${stepId}:${task.id}:${targetKey(task.guide)}`;
    const last = i.recent.get(key);
    if (last !== undefined && i.now - last < RENAV_GAP_MS) return null;
    return { kind: 'renav', task, key };
  }

  const task = queue.tasks.find((t) => t.need === 'REQUIRED');
  if (!task || i.declined.has(`${stepId}:${task.id}`)) return null;
  if (i.navActive) return null;
  if (task.guide?.kind === 'nav') {
    const frame: DetourFrame = {
      sourceStepId: stepId, detourId: task.id, reason: task.label, startedAt: i.now,
      returnCondition: `${task.label} - done`,
    };
    const res = startDetour(i.prep, frame);
    return res.ok ? { kind: 'start', task, frame, state: res.state } : null;
  }
  return i.announce === 'full' ? { kind: 'announce', task, key: `${stepId}:${task.id}` } : null;
}

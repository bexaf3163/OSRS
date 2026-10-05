// Time splits: how long the route took, stage by stage. The time of each step is the time since the previous step was marked done, so it is the
// real pace, including the walking between the steps.
//
// What is not known is not invented. Only steps marked done by the player or by the game while the app ran have a time (Progress.doneAt); the steps marked
// in bulk from the game (account sync) and those done before splits existed have none, and are counted apart. The first timed step has no start,
// so it has no duration. A gap longer than BREAK_SECONDS is a break (dinner, a night), not play time: it is shown, but left out of the active time.

import type { Progress, Step } from '../types';

export const BREAK_SECONDS = 30 * 60;

export interface Completion { id: string; stage: number; at: number }
export interface Split extends Completion {
  /** Seconds since the previous timed completion; null for the first one. */
  seconds: number | null;
  kind: 'first' | 'active' | 'break';
}
export interface StageSplit {
  stage: number;
  steps: Split[];
  /** Active seconds: the sum of the step times that are not breaks. */
  activeSeconds: number;
  breaks: number;
}
export interface SplitsReport {
  stages: StageSplit[];
  /** The slowest steps by active time, longest first. */
  slowest: Split[];
  activeSeconds: number;
  /** Done steps that have no time: marked in bulk from the game, or before splits existed. */
  untimed: number;
}

/** The timed completions in the order they happened. */
export function completions(steps: readonly Step[], progress: Pick<Progress, 'steps' | 'doneAt'>): Completion[] {
  const out: Completion[] = [];
  for (const s of steps) {
    if (progress.steps[s.id] !== 'done') continue;
    const at = Date.parse(progress.doneAt?.[s.id] ?? '');
    if (Number.isFinite(at)) out.push({ id: s.id, stage: s.stage, at });
  }
  return out.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

export function computeSplits(steps: readonly Step[], progress: Pick<Progress, 'steps' | 'doneAt'>, slowestCount = 3): SplitsReport {
  const list = completions(steps, progress);
  const splits: Split[] = list.map((c, i) => {
    if (i === 0) return { ...c, seconds: null, kind: 'first' };
    const seconds = Math.max(0, Math.round((c.at - list[i - 1].at) / 1000));
    return { ...c, seconds, kind: seconds > BREAK_SECONDS ? 'break' : 'active' };
  });
  const byStage = new Map<number, StageSplit>();
  for (const s of splits) {
    const g = byStage.get(s.stage) ?? { stage: s.stage, steps: [], activeSeconds: 0, breaks: 0 };
    g.steps.push(s);
    if (s.kind === 'active') g.activeSeconds += s.seconds!;
    if (s.kind === 'break') g.breaks++;
    byStage.set(s.stage, g);
  }
  const done = steps.filter((s) => progress.steps[s.id] === 'done').length;
  return {
    stages: [...byStage.values()].sort((a, b) => a.stage - b.stage),
    slowest: splits.filter((s) => s.kind === 'active').sort((a, b) => b.seconds! - a.seconds!).slice(0, slowestCount),
    activeSeconds: splits.reduce((sum, s) => sum + (s.kind === 'active' ? s.seconds! : 0), 0),
    untimed: done - list.length,
  };
}

/** "45 s", "12 min", "1 h 05 min". */
export function durationText(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 90) return `${s} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

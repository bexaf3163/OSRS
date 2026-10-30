// Which training method a step that follows one (Step.followsMethod) is on now: the same answer the "What to train with" card gives, computed from
// the shared player state, so the step's requirements, the arrow and the card never disagree. The result is a map step id -> method id, small and
// stable: the store applies it to the steps (lib/methodStep.ts).
//
// Unknown stays unknown: the first unread skill retains its fallback; an unread skill after a completed one clears the obsolete destination.
// Only reaching every declared goal releases the step's training supplies.

import type { GameMode, Step } from '../types';
import { followedGoals, GOAL_REACHED, UNKNOWN_GOAL_PREFIX, type TrainingPick } from './methodStep';
import { levelOf, type PlayerState } from './playerState';
import type { MethodPriority, PlayStyle } from './playStyle';
import { adviseTraining, preparationNeeds, type TrainingMethod } from './trainingRouter';
import { alongRate, type AlongRate } from './skillingRates';
import { xpForLevel } from './xp';
import type { Market } from './methodRates';

export function pickMethods(steps: readonly Step[], state: PlayerState, mode: GameMode, style: PlayStyle, priority?: MethodPriority, market: Market = {}): Record<string, TrainingPick> {
  const picks: Record<string, TrainingPick> = {};
  for (const step of steps) {
    const goals = followedGoals(step);
    if (!goals.length) continue;
    const remaining = goals.filter(g => { const level = levelOf(state, g.skill); return level === undefined || level < g.target; });
    const goal = remaining[0];
    if (!goal) { picks[step.id] = GOAL_REACHED; continue; }
    const level = levelOf(state, goal.skill);
    if (level === undefined) {
      if (goal.skill !== step.followsMethod) picks[step.id] = `${UNKNOWN_GOAL_PREFIX}${goal.skill}`;
      continue;
    }
    const advice = adviseTraining({ skill: goal.skill, target: goal.target, state, mode, style, priority, ...market });
    const best = advice.best;
    const along = best ? alongPlan(step, goal, best.method, state, mode, style, priority, market) : null;
    const spot = along?.spot ?? best?.method.spot;
    // A model can resolve recipe supplies without a named kit or station (for example bank-side processing).
    if (best) picks[step.id] = best.method.kit || spot || best.method.needs.length || advice.actionTarget !== null ? {
      methodId: best.method.id, modelled: best.method.rateSource === 'model', untilLevel: advice.actionTarget ?? goal.target, goalNeeds: remaining.length === 1 ? advice.goalNeeds : undefined, needs: preparationNeeds(advice, state, market.prices), name: best.method.name,
      ...(spot ? { spot: { label: spot.label, x: spot.place.x, y: spot.place.y, plane: spot.place.plane, ...(spot.waypoints ? { waypoints: spot.waypoints } : {}) }, where: best.method.where } : {}),
      ...(best.method.rateWarning ? { warning: best.method.rateWarning } : {}),
      ...(along ? { along: { skill: along.skill, station: along.station, products: along.products, how: along.spot.how } } : {}),
    } : best.method.id;
  }
  return picks;
}

/**
 * Whether the step's next goal is reached sooner by processing each catch beside the spot (cooking the fish on the fire by the fishing spots) while the
 * gathering goal is trained: the hours to both goals that way — the gathering at its slower pace, the processing XP it brings, then the processing
 * left at its own best method — against the two one after the other. Time only: the catches cooked on the spot also spare buying raw food later, so a
 * tie is not counted against it. The levels are today's (the forecast does not move them). null — no such station, or a level or rate is unknown.
 */
function alongPlan(step: Step, goal: { skill: string; target: number }, m: TrainingMethod, state: PlayerState, mode: GameMode, style: PlayStyle,
  priority: MethodPriority | undefined, market: Market): (AlongRate & { skill: string }) | null {
  const next = followedGoals(step).find((g) => g.skill !== goal.skill && (levelOf(state, g.skill) ?? Infinity) < g.target);
  const now = (skill: string) => xpForLevel(levelOf(state, skill)!);
  const along = next ? alongRate(m, goal.skill, next.skill, state, market) : null;
  const later = next ? adviseTraining({ skill: next.skill, target: next.target, state, mode, style, priority, ...market }).best?.method.xph : null;
  if (!next || !along || !later || !m.xph) return null;
  const mid = (x: readonly [number, number]) => (x[0] + x[1]) / 2;
  const leftGather = xpForLevel(goal.target) - now(goal.skill);
  const leftProcess = xpForLevel(next.target) - now(next.skill);
  const apart = leftGather / mid(m.xph) + leftProcess / mid(later);
  const hours = leftGather / mid(along.gather);
  const together = hours + Math.max(0, leftProcess - hours * mid(along.process)) / mid(later);
  return together <= apart ? { ...along, skill: next.skill } : null;
}

/** The same picks, same content: the store keeps its steps (and everything built on them) while nothing changed. */
export function samePicks(a: Readonly<Record<string, TrainingPick>>, b: Readonly<Record<string, TrainingPick>>): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k] || JSON.stringify(a[k]) === JSON.stringify(b[k]));
}

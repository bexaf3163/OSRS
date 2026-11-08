// Which training method a step that follows one (Step.followsMethod) is on now: the same answer the "What to train with" card gives, computed from
// the shared player state, so the step's requirements, the arrow and the card never disagree. The result is a map step id -> method id, small and
// stable: the store applies it to the steps (lib/methodStep.ts).
//
// Unknown stays unknown: the first unread skill retains its fallback; an unread skill after a completed one clears the obsolete destination.
// Only reaching every declared goal releases the step's training supplies.

import type { GameMode, Step } from '../../types';
import { followedGoals, GOAL_REACHED, UNKNOWN_GOAL_PREFIX, type TrainingPick } from './methodStep';
import { levelOf, type PlayerState } from '../player/playerState';
import type { MethodPriority, PlayStyle } from '../persistence/playStyle';
import { adviseTraining, preparationNeeds, type TrainingMethod } from './trainingRouter';
import { alongRate, type AlongRate } from './skillingRates';
import { xpForLevel } from '../player/xp';
import type { Market } from './methodRates';
import type { TrainingAdvice } from './trainingRouter';

/** The picked execution data and its estimate come from one advice calculation. */
export function pickTraining(step: Step, state: PlayerState, mode: GameMode, style: PlayStyle, priority?: MethodPriority,
  market: Market = {}, xp?: Readonly<Record<string, number>>): { pick?: TrainingPick; advice: TrainingAdvice | null } {
  const goals = followedGoals(step);
  if (!goals.length) return { advice: null };
  const remaining = goals.filter(g => { const level = levelOf(state, g.skill); return level === undefined || level < g.target; });
  const goal = remaining[0];
  if (!goal) return { pick: GOAL_REACHED, advice: null };
  if (levelOf(state, goal.skill) === undefined) return { advice: null,
    ...(goal.skill !== step.followsMethod ? { pick: `${UNKNOWN_GOAL_PREFIX}${goal.skill}` } : {}) };
  const advice = adviseTraining({ skill: goal.skill, target: goal.target, state, mode, style, priority, ...market,
    ...(xp?.[goal.skill] !== undefined ? { xp: xp[goal.skill] } : {}) });
  const best = advice.best;
  if (!best) return { advice };
  const along = alongPlan(step, goal, best.method, state, mode, style, priority, market);
  const spot = along?.spot ?? best.method.spot;
  const pick = best.method.kit || spot || best.method.needs.length || advice.actionTarget !== null ? {
    methodId: best.method.id, modelled: best.method.rateSource === 'model', untilLevel: advice.actionTarget ?? goal.target,
    goalNeeds: remaining.length === 1 ? advice.goalNeeds : undefined, stockNeeds: remaining.length === 1 ? advice.stockNeeds : undefined,
    needs: preparationNeeds(advice, state, market.prices), name: best.method.name,
    ...(spot ? { spot: { label: spot.label, x: spot.place.x, y: spot.place.y, plane: spot.place.plane,
      ...(spot.objectNames ? { objectNames: [...spot.objectNames] } : {}), ...(spot.waypoints ? { waypoints: spot.waypoints } : {}) }, where: best.method.where } : {}),
    ...(best.method.rateWarning ? { warning: best.method.rateWarning } : {}),
    ...(along ? { along: { skill: along.skill, station: along.station, products: along.products, how: along.spot.how } } : {}),
  } : best.method.id;
  return { pick, advice };
}

export function pickMethods(steps: readonly Step[], state: PlayerState, mode: GameMode, style: PlayStyle, priority?: MethodPriority, market: Market = {}): Record<string, TrainingPick> {
  return Object.fromEntries(steps.flatMap(step => {
    const { pick } = pickTraining(step, state, mode, style, priority, market);
    return pick === undefined ? [] : [[step.id, pick]];
  }));
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

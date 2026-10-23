// Which training method a step that follows one (Step.followsMethod) is on now: the same answer the "What to train with" card gives, computed from
// the shared player state, so the step's requirements, the arrow and the card never disagree. The result is a map step id -> method id, small and
// stable: the store applies it to the steps (lib/methodStep.ts).
//
// Unknown stays unknown: the first unread skill retains its fallback; an unread skill after a completed one clears the obsolete destination.
// Only reaching every declared goal releases the step's training supplies.

import type { GameMode, Step } from '../types';
import { followedGoals, GOAL_REACHED, UNKNOWN_GOAL_PREFIX } from './methodStep';
import { levelOf, type PlayerState } from './playerState';
import type { MethodPriority, PlayStyle } from './playStyle';
import { adviseTraining } from './trainingRouter';

export function pickMethods(steps: readonly Step[], state: PlayerState, mode: GameMode, style: PlayStyle, priority?: MethodPriority): Record<string, string> {
  const picks: Record<string, string> = {};
  for (const step of steps) {
    const goals = followedGoals(step);
    if (!goals.length) continue;
    const goal = goals.find(g => { const level = levelOf(state, g.skill); return level === undefined || level < g.target; });
    if (!goal) { picks[step.id] = GOAL_REACHED; continue; }
    const level = levelOf(state, goal.skill);
    if (level === undefined) {
      if (goal.skill !== step.followsMethod) picks[step.id] = `${UNKNOWN_GOAL_PREFIX}${goal.skill}`;
      continue;
    }
    const best = adviseTraining({ skill: goal.skill, target: goal.target, state, mode, style, priority }).best;
    if (best) picks[step.id] = best.method.id;
  }
  return picks;
}

/** The same picks, same content: the store keeps its steps (and everything built on them) while nothing changed. */
export function samePicks(a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

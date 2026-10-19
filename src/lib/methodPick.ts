// Which training method a step that follows one (Step.followsMethod) is on now: the same answer the "What to train with" card gives, computed from
// the shared player state, so the step's requirements, the arrow and the card never disagree. The result is a map step id -> method id, small and
// stable: the store applies it to the steps (lib/methodStep.ts).
//
// Unknown stays unknown: a level that is not known leaves the step on its own list; a skill whose goal is reached asks for no tool of that skill.

import type { GameMode, Step } from '../types';
import { followedGoal, GOAL_REACHED } from './methodStep';
import { levelOf, type PlayerState } from './playerState';
import type { MethodPriority, PlayStyle } from './playStyle';
import { adviseTraining } from './trainingRouter';

export function pickMethods(steps: readonly Step[], state: PlayerState, mode: GameMode, style: PlayStyle, priority?: MethodPriority): Record<string, string> {
  const picks: Record<string, string> = {};
  for (const step of steps) {
    const goal = followedGoal(step);
    if (!goal) continue;
    const level = levelOf(state, goal.skill);
    if (level === undefined) continue;
    if (level >= goal.target) {
      picks[step.id] = GOAL_REACHED;
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

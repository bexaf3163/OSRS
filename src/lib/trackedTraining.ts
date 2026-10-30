// A followed skill is an ordinary training step: selection, preparation and funding use the existing engines.
import type { GameMode, Step } from '../types';
import type { PlayerState } from './playerState';
import { levelOf } from './playerState';
import { SKILL_NAMES } from './skillGuide';
import type { TrackedSkill } from './skillTrack';
import { trackedTrainingContext } from './skillTrack';
import { f2pAdviceFor } from './f2pSkillAdvice';
import { methodsFor } from './trainingRouter';
import { pickMethods } from './methodPick';
import { withTrainingMethod } from './methodStep';
import type { MethodPriority, PlayStyle } from './playStyle';
import type { Market } from './methodRates';

export interface TrackedTraining { step: Step; target: number; complete: boolean }

export function trackedTraining(tracked: TrackedSkill | null, observed: PlayerState, mode: GameMode,
  style: PlayStyle, priority: MethodPriority, market: Market = {}): TrackedTraining | null {
  if (!tracked || !methodsFor(tracked.skill).length) return null;
  const context = trackedTrainingContext(tracked, tracked.skill, observed, mode);
  const state = context.state, free = context.mode === 'f2p';
  const target = tracked.target ?? (free ? f2pAdviceFor(tracked.skill)?.target : 99);
  // A passive/prefer-members marker is not an instruction to grind to 99.
  if (target == null || !Number.isInteger(target) || target < 2 || target > 99) return null;
  const skill = tracked.skill, name = skill[0].toUpperCase() + skill.slice(1);
  const facts = ['attack', 'strength', 'defence'].includes(skill) ? ['attack', 'strength', 'defence', 'hitpoints']
    : ['ranged', 'magic'].includes(skill) ? [skill, 'defence', 'hitpoints'] : [skill];
  const id = `S0-${String(SKILL_NAMES.indexOf(skill) + 1).padStart(2, '0')}`;
  const base: Step = {
    id, stage: 0, type: 'skill', title: `${name} to ${target}`, requires: [], followsMethod: skill,
    doneWhen: `${name} reaches ${target}.`, bondBranch: free,
    requirements: facts.map(skill => ({ type: 'skill', skill, min: 1 })),
    how: `Check your ${skill} level before choosing a training stage.`,
    inGame: { completionTrigger: { type: 'SKILL_LEVEL', levels: [{ skill, level: target }] } },
  };
  const pick = pickMethods([base], state, context.mode, style, priority, market)[id];
  const step = withTrainingMethod(base, pick);
  if (typeof pick === 'object' && step.inGame) step.inGame = { ...step.inGame, goal: `${pick.name ?? name}: train ${skill} to ${pick.untilLevel ?? target}` };
  const method = typeof pick === 'object' ? methodsFor(skill).find(method => method.id === pick.methodId) : null;
  const combat = method?.npcNames?.length && (['attack', 'strength', 'defence'].includes(skill) || method.kit === 'f2p-bow' || method.kit === 'strike-spell');
  if (combat && typeof pick === 'object' && !pick.modelled) {
    const warning = 'Combat preparation is not checked for this setup. Read your stats and equipment in RuneLite; unsupported gear or mechanics need manual review.';
    step.warning = warning;
    step.mapLocation = undefined;
    step.resourceSpots = [];
    step.how = warning;
    step.quickSteps = [warning];
    step.inGame = { ...step.inGame, goal: 'Check combat preparation before training', worldPoint: undefined, groundTiles: [], pathWaypoints: undefined, npcNames: [], npcIds: [], objectNames: [], objectIds: [] };
  }
  return { step, target, complete: (levelOf(state, skill) ?? -1) >= target };
}

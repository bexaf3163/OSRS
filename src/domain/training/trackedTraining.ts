// A followed skill is an ordinary training step: selection, preparation and funding use the existing engines.
import type { GameMode, Step } from '../../types';
import type { PlayerState } from '../player/playerState';
import { levelOf } from '../player/playerState';
import { SKILL_NAMES, type SkillName } from './skillTrack';
import type { TrackedSkill } from './skillTrack';
import { freeOnlyOf, trackedTrainingContext } from './skillTrack';
import { f2pAdviceFor, f2pPhaseOf, F2P_ORDER } from './f2pSkillAdvice';
import { adviseTraining, methodsFor, priceKeyOf, trainingItemScope } from './trainingRouter';
import { pickTraining } from './methodPick';
import type { TimeEstimate, TrainingAdvice } from './trainingRouter';
import { withTrainingMethod } from './methodStep';
import { scopedMemo, scopedRateKeyOf, type Market } from './methodRates';

export interface TrackedTraining { step: Step; target: number; complete: boolean; advice?: TrainingAdvice | null }

// Every observation asks again for each quest's skill requirements; a chopped log or another quest's item changes nothing here.
// Whole advice is large, so at most 2,000 are kept.
const tracks = new Map<string, { out: TrackedTraining | null; state?: PlayerState }>();
export function trackedTraining(tracked: TrackedSkill | null, observed: PlayerState, mode: GameMode,
  market: Market = {}, xp?: Readonly<Record<string, number>>): TrackedTraining | null {
  if (!tracked || !methodsFor(tracked.skill).length) return null;
  const key = [JSON.stringify(tracked), scopedRateKeyOf(observed, trainingItemScope(tracked.skill)), observed.connected ? 1 : 0, mode,
    priceKeyOf(market.prices), market.restriction ?? '-', xp ? JSON.stringify(xp) : '-'].join('|');
  return scopedMemo(tracks, key, observed, `${tracked.skill} followed`, () => trackedTrainingFresh(tracked, observed, mode, market, xp), 2_000);
}
function trackedTrainingFresh(tracked: TrackedSkill, observed: PlayerState, mode: GameMode,
  market: Market, xp?: Readonly<Record<string, number>>): TrackedTraining | null {
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
  const { pick, advice } = pickTraining(base, state, context.mode, market, xp);
  const step = withTrainingMethod(base, pick);
  if (typeof pick === 'object' && step.inGame) step.inGame = { ...step.inGame, goal: `${pick.name ?? name}: train ${skill} to ${pick.untilLevel ?? target}` };
  const method = typeof pick === 'object' ? methodsFor(skill).find(method => method.id === pick.methodId) : null;
  const combat = method?.npcNames?.length && (['attack', 'strength', 'defence'].includes(skill) || method.kit === 'f2p-bow' || method.kit === 'strike-spell');
  if (combat && typeof pick === 'object' && !pick.modelled) {
    const warning = 'Combat preparation is not checked for this setup. Read your stats and equipment in RuneLite; unsupported gear or mechanics need manual review.';
    step.stockItems = undefined;
    step.goalItemsRequired = undefined;
    step.warning = warning;
    step.mapLocation = undefined;
    step.resourceSpots = [];
    step.how = warning;
    step.quickSteps = [warning];
    step.inGame = { ...step.inGame, goal: 'Check combat preparation before training', worldPoint: undefined, groundTiles: [], pathWaypoints: undefined, npcNames: [], npcIds: [], objectNames: [], objectIds: [] };
  }
  return { step, target, complete: (levelOf(state, skill) ?? -1) >= target, advice };
}

export interface SkillCheckpoint {
  skill: SkillName; level: number; target: number; priority: 'good' | 'optional'; phase: number; method: string | null; time: TimeEstimate | null;
  /** Coins the plan earns (+) or spends (-) on the way, [worst, best]; null or missing when a leg's price is unknown. */
  coins?: [number, number] | null;
}

/** The coin balance after each checkpoint, done in list order from `start`, by each plan's worst case; a row with unknown coins adds nothing. */
export function cashFlow(rows: readonly SkillCheckpoint[], start: number): number[] {
  let balance = start;
  return rows.map((r) => (balance += r.coins?.[0] ?? 0));
}

/**
 * What to train once the F2P quests are done: the unfinished F2P checkpoints in the owner's phase order (F2P_PHASES),
 * one skill at a time, each with the training engine's own forecast for this character. A list to choose from, not a forced grind (S105).
 */
export function f2pCheckpoints(observed: PlayerState, market: Market = {}): SkillCheckpoint[] {
  return F2P_ORDER.flatMap((skill): SkillCheckpoint[] => {
    const advice = f2pAdviceFor(skill), level = levelOf(observed, skill);
    if (!advice?.target || (advice.priority !== 'good' && advice.priority !== 'optional') || level === undefined || level >= advice.target) return [];
    const plan = adviseTraining({ skill, target: advice.target, state: observed, mode: 'f2p', ...market });
    return [{ skill, level, target: advice.target, priority: advice.priority, phase: f2pPhaseOf(skill), method: plan.best?.method.name ?? null, time: plan.time, coins: plan.coins ?? null }];
  });
}

/** A followed goal that is reached hands over by itself. While the route still has open steps it goes back to the
 *  route (null); after it, a free-only goal goes on to the next unfinished F2P checkpoint (the list's own order). */
/**
 * Members (owner, 2026-11-23: earn, then spend): the skill levels the open quests still need, each with the training engine's own
 * forecast, the plans that earn coins first so the ones that spend are paid from them; a plan with unknown coins counts as spending.
 */
export function membersCheckpoints(observed: PlayerState, needs: ReadonlyMap<string, number>, market: Market = {}): SkillCheckpoint[] {
  const rows = [...needs].flatMap(([skill, target]): SkillCheckpoint[] => {
    const level = levelOf(observed, skill);
    if (level === undefined || level >= target || !methodsFor(skill).length) return [];
    const plan = adviseTraining({ skill, target, state: observed, mode: 'members', ...market });
    return [{ skill: skill as SkillName, level, target, priority: 'good', phase: 0, method: plan.best?.method.name ?? null, time: plan.time, coins: plan.coins ?? null }];
  });
  const earns = (r: SkillCheckpoint) => (r.coins?.[0] ?? -1) >= 0;
  return [...rows.filter(earns), ...rows.filter((r) => !earns(r))];
}

export function nextAfterReached(tracked: TrackedSkill, rows: readonly SkillCheckpoint[], routeOpen: boolean): TrackedSkill | null {
  const next = !routeOpen && freeOnlyOf(tracked) ? rows.find((row) => row.skill !== tracked.skill) : undefined;
  return next ? { skill: next.skill, mode: 'fast', freeOnly: true, target: next.target } : null;
}

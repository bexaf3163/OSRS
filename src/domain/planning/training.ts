import type { Step } from '../../types';
import type { PriceView } from '../market/quotes';
import type { MethodPriority, PlayStyle } from '../persistence/playStyle';
import type { TradeRestriction } from '../market/tradeRestriction';
import { SKILL_NAMES } from '../training/skillGuide';
import type { SkillName } from '../training/skillGuide';
import { trackedTraining } from '../training/trackedTraining';
import { trackedPriority, trackedTrainingContext } from '../training/skillTrack';
import type { TrackedSkill } from '../training/skillTrack';
import { levelOf } from '../player/playerState';
import { coherentSkillXp, levelForXp, xpForLevel } from '../player/xp';
import { processingGoalFlows } from '../training/processingGoal';
import { adviseTraining } from '../training/trainingRouter';
import type { CandidateAction, Minutes, PlanningSnapshot, Projection, ResourceChange } from './contracts';
import { noTime, validMinutes } from './cost';
import { acceptsDecision } from './scope';
import { projectedTrainingState } from './resources';

export interface TrainingCandidate {
  step: Step | null;
  action: CandidateAction;
  remaining: Minutes | null;
  target: number | null;
  /** What the whole goal consumes; null leaves consumption UNKNOWN (no metadata never proves zero inputs). */
  consumption: ResourceChange | null;
}

export interface TrainingOptions {
  prices?: PriceView | null; style?: PlayStyle; priority?: MethodPriority; restriction?: TradeRestriction['state'];
  selection?: TrackedSkill;
}

/** Adapt the shared training engine; no copied rates, per-skill routes or hypothetical gear become observed facts. */
export function prerequisiteTraining(input: TrainingOptions & {
  snapshot: PlanningSnapshot; goalId: string; skill: string;
} & ({ target: number } | { target?: number; selection: TrackedSkill })): TrainingCandidate | null {
  const { snapshot, goalId, skill } = input, target = input.target ?? input.selection?.target;
  const level = levelOf(snapshot.player, skill);
  const evidence = [{ source: 'Observed skill level', snapshotRevision: snapshot.scope.snapshotRevision,
    predicate: target === undefined ? `${skill} selected target is observed` : `${skill} >= ${target}` }];
  const verify = (reason: string): TrainingCandidate => ({ step: null, remaining: null, consumption: null, target: Number.isInteger(target) && target! >= 1 && target! <= 99 ? target! : null,
    action: { id: `${goalId}:VERIFY:training:${skill}:${target}`, kind: 'VERIFY', goalId, title: reason, feasibility: 'UNKNOWN',
      prerequisites: [], completionEvidence: evidence, expectedEffects: [], time: null, gpCost: null, sourceIds: ['trainingRouter'], reasons: [reason] } });
  if (!SKILL_NAMES.includes(skill as SkillName) || (input.selection && input.selection.skill !== skill)
    || (target !== undefined && (!Number.isInteger(target) || target < 1 || target > 99))) return verify('Verify the supported skill and training target');
  if (target !== undefined && level !== undefined && level >= target) return null;
  if (level === undefined) return verify(`Read your ${skill} level before training`);
  const observedXp = snapshot.xp[skill];
  const exactXp = observedXp?.known && coherentSkillXp(observedXp.value, level)
    ? { [skill]: observedXp.value } : undefined;
  const selection = input.selection ? { ...input.selection, ...(target !== undefined ? { target } : {}) }
    : { skill: skill as SkillName, mode: 'fast' as const, freeOnly: snapshot.scope.mode === 'f2p', target };
  const training = trackedTraining(selection, snapshot.player, snapshot.scope.mode, input.style ?? 'chill',
    trackedPriority(selection, skill, input.priority ?? 'balanced'), { prices: input.prices, restriction: input.restriction }, exactXp);
  if (training?.complete) return null;
  const advice = training?.advice;
  if (!training || !advice?.best || !training.step.mapLocation) return verify('Verify a supported training method and its preparation');
  const time = advice.time;
  const remaining = time && time.minHours >= 0 && time.maxHours >= time.minHours ? {
    fast: time.minHours * 60, typical: (time.minHours + time.maxHours) * 30, slow: time.maxHours * 60,
    source: `Shared trainingRouter ${time.source} estimate: ${advice.best.method.id}`,
  } : null;
  const phase = advice.actionTarget ?? training.target;
  // Processing ingredients retire their lower bounds: failures, partial doses and refills make the exact count uncertain.
  const flows = processingGoalFlows(advice.path, level, advice.target, exactXp?.[skill] ?? xpForLevel(level));
  const consumption: ResourceChange | null = flows
    ? { unknownItems: [...new Set(flows.materials.flatMap(m => [m.name, ...(m.anyOf ?? [])]))], items: [], gp: 0, source: `Shared processing forecast for ${skill} ${advice.target}` }
    : null;
  return { step: training.step, target: training.target, remaining, consumption, action: {
    id: `${goalId}:TRAIN:${skill}:${phase}:${advice.best.method.id}`, goalId, kind: 'TRAIN',
    title: `${advice.best.method.name}: ${skill} to ${phase}`, stepId: training.step.id,
    // The tactical resolver must first verify the generated step's actual kit/skill/access/safety requirements.
    feasibility: 'PREP_REQUIRED', prerequisites: [], completionEvidence: [{ ...evidence[0], predicate: `${skill} >= ${phase}` }],
    expectedEffects: [{ kind: 'skill-floor', skill, level: phase, afterSuccessOnly: true }],
    time: phase === training.target ? remaining : null, gpCost: null, sourceIds: ['trainingRouter', advice.best.method.url], reasons: [advice.reason],
    destination: { x: training.step.mapLocation.x, y: training.step.mapLocation.y, plane: training.step.mapLocation.plane },
  } };
}

/** Search-only costs reuse trainingRouter's complete phased forecast. Conditional stats never become execution evidence. */
export function createTrainingCost(snapshot: PlanningSnapshot, options: TrainingOptions = {}) {
  const cache = new WeakMap<Projection, Map<string, Minutes | null>>();
  return (skill: string, target: number, projection: Projection): Minutes | null => {
    if (!projection.scope || !acceptsDecision(snapshot.scope, projection.scope) || projection.invalidResources
      || !SKILL_NAMES.includes(skill as SkillName) || !Number.isInteger(target) || target < 1 || target > 99) return null;
    const key = `${skill}:${target}`, cached = cache.get(projection);
    if (cached?.has(key)) return cached.get(key)!;
    const exact = projection.xp[skill], bounds = projection.xpBounds?.[skill], rawLevel = projection.levels?.[skill] ?? levelOf(snapshot.player, skill);
    const level = rawLevel !== undefined && Number.isInteger(rawLevel) && rawLevel >= 1 && rawLevel <= 99 ? rawLevel : undefined;
    const min = exact ?? bounds?.min ?? (level === undefined ? undefined : xpForLevel(level));
    const max = exact ?? bounds?.max ?? (level === undefined ? undefined : level === 99 ? 200_000_000 : xpForLevel(level + 1) - 1);
    let result: Minutes | null = null;
    if (min !== undefined && max !== undefined && coherentSkillXp(min) && coherentSkillXp(max) && min <= max) {
      const at = (xp: number): Minutes | null => {
        if (xp >= xpForLevel(target)) return noTime();
        const stock = projectedTrainingState(snapshot, projection);
        if (!stock) return null;
        // Private calculator input only; it is never returned as PlayerState or readiness for the current action.
        const state = { ...stock, levels: { ...stock.levels,
          [skill]: { known: true as const, value: levelForXp(xp), source: 'profile' as const } },
        };
        const context = trackedTrainingContext(options.selection ?? null, skill, state, snapshot.scope.mode);
        const advice = adviseTraining({ skill, target, state: context.state, mode: context.mode, xp, style: options.style ?? 'chill',
          priority: trackedPriority(options.selection ?? null, skill, options.priority ?? 'balanced'), prices: options.prices, restriction: options.restriction });
        const time = advice.time;
        if (!time || !advice.path.length || advice.path[advice.path.length - 1].toLevel !== target) return null;
        const estimate = { fast: time.minHours * 60, typical: (time.minHours + time.maxHours) * 30, slow: time.maxHours * 60,
          source: `Shared phased trainingRouter ${time.source} forecast; conditional ${skill} XP ${xp}` };
        return validMinutes(estimate) ? estimate : null;
      };
      const low = at(min), high = min === max ? low : at(max);
      if (low && high) {
        const fast = Math.min(low.fast, high.fast), slow = Math.max(low.slow, high.slow);
        const unknownOvershoot = exact === undefined && max === 200_000_000 && min < xpForLevel(target);
        result = { fast, typical: unknownOvershoot ? low.typical : (fast + slow) / 2, slow,
          source: unknownOvershoot ? `${low.source}; overshoot unknown, typical uses only the guaranteed XP floor`
            : min === max ? low.source : `${low.source}; starting XP is a range` };
      }
    }
    const values = cached ?? new Map<string, Minutes | null>();
    values.set(key, result);
    cache.set(projection, values);
    return result;
  };
}

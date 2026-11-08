import type { Progress, Step } from '../../types';
import type { PriceView } from '../market/quotes';
import type { TradeRestriction } from '../market/tradeRestriction';
import type { MethodPriority, PlayStyle } from '../persistence/playStyle';
import { createReadinessEngine } from '../readiness/readinessEngine';
import type { StepReadiness } from '../readiness/readiness';
import { safetyBlockers } from '../prep/prepPlan';
import type { PrepPlan } from '../prep/prepPlan';
import { buildNeed } from '../economy/funding/need';
import { buildBudget } from '../economy/funding/budget';
import type { Budget } from '../economy/funding/budget';
import { buildSnapshot } from '../economy/funding/snapshot';
import { levelOf } from '../player/playerState';
import { noTime } from './cost';
import type { CandidateAction, Minutes, PlanningSnapshot } from './contracts';
import { resolvePreparation } from './preparation';
import { prerequisiteTraining } from './training';
import type { TrainingCandidate } from './training';
import { assessStepReadiness } from '../readiness/stepAssessment';
import { combatPlanView } from '../combat/combatPlan';
import { stepAtQuestCursor } from '../quests/questCursor';
import { PLANNING_WINDOW_SIZE } from './window';

export interface TacticalFrame {
  step: Step;
  plan: PrepPlan;
  readiness: StepReadiness;
  budget: Budget;
  action: CandidateAction | null;
  /** Acquisition/setup only: training work is owned by the training estimator. */
  preparationMinutes: Minutes | null;
}
export interface TacticalInput {
  snapshot: PlanningSnapshot;
  progress: Progress;
  prices: PriceView;
  /** Current committed action and at most two successors. Never an authored global route slice. */
  window: readonly Step[];
  style?: PlayStyle;
  priority?: MethodPriority;
  restriction?: TradeRestriction['state'];
  ironman: boolean | null;
  /** The runtime adds the shared training time, so a skill unlock can be weighed against earning now (S61). */
  earn(step: Step, requiredLiquidGp: number, budget: Budget, goalId: string, train?: (skill: string, level: number) => Minutes | null): CandidateAction | null;
  /** Minutes to gather pieces of an item yourself; absent or null keeps that gathering UNKNOWN. */
  gather?: (name: string, count: number) => Minutes | null;
  /** A shared route/trip estimate, when available. An unresolved setup never defaults to zero minutes. */
  preparationTime?(frame: Omit<TacticalFrame, 'preparationMinutes'>): Minutes | null;
}

/** One current-facts pipeline for quest, training and funding preparation; it never selects the global objective. */
export function createTacticalResolver(input: TacticalInput) {
  const { snapshot } = input;
  const frames = new Map<Step, Map<string, TacticalFrame>>();
  const training = new Map<string, TrainingCandidate | null>();
  function check(step: Step, goalId: string, title: string): CandidateAction {
    return { id: `${goalId}:VERIFY:${step.id}`, goalId, stepId: step.id, kind: 'VERIFY', title, feasibility: 'UNKNOWN',
      prerequisites: [], completionEvidence: [{ source: 'Shared preparation', snapshotRevision: snapshot.scope.snapshotRevision, predicate: title }],
      expectedEffects: [], time: null, gpCost: null, sourceIds: ['readinessEngine', 'prepPlan'], reasons: [title] };
  }
  function resolve(step: Step, goalId: string, ancestors: ReadonlySet<string> = new Set()): TacticalFrame {
    const cached = frames.get(step)?.get(goalId);
    if (cached) return cached;
    const execution = { ...stepAtQuestCursor(step, snapshot.instruction ?? null), requires: [] }; // Global DAG/stage evidence is validated first.
    // A virtual skill step may reuse an ID at another target. Give each candidate its own immutable engine context.
    const suppliedAt = input.window.indexOf(step);
    const replaceAt = suppliedAt >= 0 ? suppliedAt : input.window[0]?.id === step.id ? 0 : -1;
    const window = [execution, ...input.window.filter((_, index) => index !== replaceAt)].slice(0, PLANNING_WINDOW_SIZE);
    // Validated stage/DAG evidence chooses the current action. Saved route marks never prove its game prerequisites.
    const progress = { ...input.progress, steps: {} };
    const engine = createReadinessEngine({ steps: window, window, progress, qp: snapshot.questPoints.known ? snapshot.questPoints.value : 0,
      mode: snapshot.scope.mode, state: snapshot.player, prices: input.prices, questInstruction: snapshot.instruction });
    const plan = engine.plan(execution, { ahead: 2 }), readiness = engine.readiness(execution);
    const need = buildNeed({ step: execution, prep: plan, prices: input.prices, owned: snapshot.player.owned, manual: snapshot.player.manual,
      hitpoints: levelOf(snapshot.player, 'hitpoints') });
    const snap = buildSnapshot({ state: snapshot.player, window, questPoints: snapshot.questPoints.known ? snapshot.questPoints.value : null,
      ironman: input.ironman, position: snapshot.player.position.known ? snapshot.player.position.value : null });
    const budget = buildBudget({ snap, need, prices: input.prices, recs: [], bankValue: null, committedWindow: true });
    const chain = new Set(ancestors);
    const trace = `${goalId}:${step.id}`;
    chain.add(trace);
    let nested: TacticalFrame | null = null;
    let action = resolvePreparation({ snapshot, goalId, step: execution, plan, readiness, budget, ironman: input.ironman, coinsRequired: need.fees.now,
      reservedPurchases: plan.lines.filter(line => (line.timing === 'NOW' || line.timing === 'SOON') && line.where === 'MISSING')
        .map(line => ({ fee: line.action?.purchase?.fee })),
      train(skill, target) {
        const key = `${goalId}:${skill}:${target}`;
        if (!training.has(key)) training.set(key, prerequisiteTraining({ snapshot, goalId, skill, target, prices: input.prices,
          style: input.style, priority: input.priority, restriction: input.restriction }));
        const candidate = training.get(key);
        if (!candidate) return null;
        if (!candidate.step) return candidate.action;
        if (chain.size >= 4 || chain.has(`${goalId}:${candidate.step.id}`)) return check(step, goalId, 'Review circular or unsupported training prerequisites');
        const prepared = resolve(candidate.step, goalId, chain);
        nested = prepared;
        return prepared.action ?? { ...candidate.action, feasibility: 'READY' };
      },
      earn: required => input.earn(step, required, budget, goalId), gather: input.gather,
    });
    if (!action && safetyBlockers(plan.safety ?? [], plan.lines).length) action = check(step, goalId, 'Verify the mandatory protection for this activity');
    if (!action && !snapshot.questPoints.known && (step.minQp ?? 0) > 0) action = check(step, goalId, 'Read your quest points before starting');
    if (!action) {
      const live = snapshot.combat ?? { stats: null, gear: null };
      const view = combatPlanView(execution, { ...live, owned: snapshot.player.owned });
      const assessment = assessStepReadiness({ step: execution, plan, connected: snapshot.player.connected, owned: snapshot.player.owned, ...live, view });
      if (assessment.unassessedFights.length) action = check(step, goalId, `Review the combat strategy for ${assessment.unassessedFights.join(', ')}`);
      else if (!['READY', 'READY_CAUTIONS'].includes(assessment.verdict.level)) action = check(step, goalId, assessment.verdict.headline);
    }
    // A detour carries its own kit, stock and budget, not the parent quest's shopping card.
    const child = nested as TacticalFrame | null;
    const base = child ? { step: child.step, plan: child.plan, readiness: child.readiness, budget: child.budget, action }
      : { step: execution, plan, readiness, budget, action };
    const frame: TacticalFrame = { ...base, preparationMinutes: child ? child.preparationMinutes
      : action ? input.preparationTime?.(base) ?? null : noTime() };
    const byGoal = frames.get(step) ?? new Map<string, TacticalFrame>();
    byGoal.set(goalId, frame);
    frames.set(step, byGoal);
    return frame;
  }
  return { resolve };
}

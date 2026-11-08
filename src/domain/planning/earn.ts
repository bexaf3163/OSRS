// The planner's earn adapter: a coin shortfall becomes one EARN action timed by the character's best dependable earning
// method (the Money section's own ranking). The local funding machine still runs the method; this only prices the wait.
import type { Step } from '../../types';
import { evaluate, type EvalContext, type Range3 } from '../economy/funding/evaluate';
import { METHODS } from '../economy/funding/methods';
import type { FundingMethod } from '../economy/funding/types';
import type { Minutes } from './contracts';
import { sumMinutes } from './cost';
import { rankMethods } from '../economy/funding/rank';
import { BROWSE_TARGET } from '../economy/funding/browse';
import type { CandidateAction, PlanningSnapshot } from './contracts';

export interface EarnRate { methodId: string; title: string; netPerHour: Range3 }

/** A better earning method one skill's levels away, judged as if the level were reached (S61). */
export interface LevelledRate extends EarnRate { skill: string; level: number }

/** Training time to a level, from the shared training cost the quest planner uses. */
export interface TrainFirst { levelled: readonly LevelledRate[]; train: (skill: string, level: number) => Minutes | null }

/** Coins for a shortfall: earn now with the best open method, or train a skill first when the method it unlocks gets the
 * coins sooner in total wall-clock time (S61). */
export function earnAction(snapshot: PlanningSnapshot, step: Step, goalId: string, requiredGp: number, rate: EarnRate | null, first?: TrainFirst): CandidateAction | null {
  const now = earnNow(snapshot, step, goalId, requiredGp, rate);
  const trained = first ? trainThenEarn(snapshot, step, goalId, requiredGp, first) : null;
  return trained && (!now?.time || trained.time!.typical < now.time.typical) ? trained : now;
}

function trainThenEarn(snapshot: PlanningSnapshot, step: Step, goalId: string, requiredGp: number, { levelled, train }: TrainFirst): CandidateAction | null {
  const best = levelled.flatMap(alt => {
    const training = train(alt.skill, alt.level), time = sumMinutes([training, earnNow(snapshot, step, goalId, requiredGp, alt)?.time ?? null]);
    return training && time ? [{ alt, training, time }] : [];
  }).sort((a, b) => a.time.typical - b.time.typical || (a.alt.methodId < b.alt.methodId ? -1 : 1))[0];
  if (!best) return null;
  const { alt, training, time } = best, gp = Math.ceil(requiredGp);
  return {
    id: `${goalId}:TRAIN-TO-EARN:${step.id}:${alt.methodId}`, goalId, kind: 'TRAIN', title: `Train ${alt.skill} to ${alt.level}, then earn ${gp} gp: ${alt.title}`, stepId: step.id,
    feasibility: 'READY', prerequisites: [],
    completionEvidence: [{ source: 'Observed skill level', snapshotRevision: snapshot.scope.snapshotRevision, predicate: `${alt.skill} >= ${alt.level}` }],
    expectedEffects: [], gpCost: null, sourceIds: [`funding:${alt.methodId}`, 'trainingRouter'], time,
    reasons: [`Short of ${gp} gp for ${step.title}`, `Training ${alt.skill} to ${alt.level} first (about ${Math.round(training.typical)} min) unlocks ${alt.title}, which gets the coins sooner than any method open now`],
  };
}

function earnNow(snapshot: PlanningSnapshot, step: Step, goalId: string, requiredGp: number, rate: EarnRate | null): CandidateAction | null {
  if (!rate || !Number.isFinite(requiredGp) || requiredGp <= 0) return null;
  const rates = [rate.netPerHour.fast, rate.netPerHour.typical, rate.netPerHour.slow];
  if (rates.some(perHour => !Number.isFinite(perHour) || perHour <= 0)) return null;
  const minutes = (perHour: number) => requiredGp / perHour * 60;
  const gp = Math.ceil(requiredGp);
  return {
    id: `${goalId}:EARN:${step.id}:${rate.methodId}`, goalId, kind: 'EARN', title: `Earn ${gp} gp: ${rate.title}`, stepId: step.id,
    feasibility: 'READY', prerequisites: [],
    completionEvidence: [{ source: 'Observed liquid GP', snapshotRevision: snapshot.scope.snapshotRevision, predicate: `Liquid GP covers ${gp}` }],
    expectedEffects: [], gpCost: null, sourceIds: [`funding:${rate.methodId}`],
    time: { fast: minutes(Math.max(...rates)), typical: minutes(rate.netPerHour.typical), slow: minutes(Math.min(...rates)), source: `${rate.title}: net coins an hour from the Money ranking` },
    reasons: [`Short of ${gp} gp for ${step.title}`, 'Earning time from the best dependable method for this character'],
  };
}

/** The character's best dependable earning method, ranked as the Money section ranks it (rankMethods over the earn mode). */
export function bestEarnRate(base: Omit<EvalContext, 'cash' | 'mode' | 'target' | 'needItems'>, cash: number | null): EarnRate | null {
  const best = rankMethods(METHODS.map(m => evaluate(m, { ...base, cash, mode: 'earn', target: BROWSE_TARGET })), {}).best;
  return best?.netPerHour ? { methodId: best.method.id, title: best.method.title, netPerHour: best.netPerHour } : null;
}

// Gathering quest items yourself, timed by the Money engine's supply mode (the same evaluator, walk and combat model as the
// Money section's "Gather it yourself"). Each item takes the fastest eligible method that yields it; an item no method
// yields keeps the whole gathering UNKNOWN for the planner.
export type SupplyBase = Omit<EvalContext, 'cash' | 'mode' | 'target' | 'needItems'>;

function gatherOne(base: SupplyBase, name: string, count: number, cash: number | null, methods: readonly FundingMethod[]): Minutes | null {
  const best = methods.filter(m => m.outputs.some(out => out.item.name === name))
    .map(m => evaluate(m, { ...base, cash, mode: 'supply', target: 0, needItems: new Map([[name, count]]) }))
    .filter(e => e.eligible && e.minutes)
    .sort((a, b) => a.minutes!.slow - b.minutes!.slow || (a.method.id < b.method.id ? -1 : 1))[0];
  return best ? { ...best.minutes!, source: `${best.method.title} for ${name} (Money engine, supply mode)` } : null;
}

// shortcut: each item is its own trip, so two items from one spot are counted twice; replace with a joint supply plan.
export function gatherTime(base: SupplyBase, items: ReadonlyMap<string, number>, cash: number | null, methods: readonly FundingMethod[] = METHODS): Minutes | null {
  return items.size ? sumMinutes([...items].map(([name, count]) => gatherOne(base, name, count, cash, methods))) : null;
}

/** Methods blocked only by levels in one skill, each re-judged as if that level were reached. */
export function levelledEarnRates(base: SupplyBase, cash: number | null): LevelledRate[] {
  const ctx = { ...base, cash, mode: 'earn' as const, target: BROWSE_TARGET };
  return METHODS.flatMap(m => {
    const e = evaluate(m, ctx), levels = e.blockers.map(b => b.levels);
    if (e.eligible || !levels.length || levels.some(l => !l) || new Set(levels.map(l => l!.skill)).size !== 1) return [];
    const skill = levels[0]!.skill, current = base.snap.level(skill);
    if (current === undefined) return [];
    const level = current + Math.max(...levels.map(l => l!.missing));
    const raised = evaluate(m, { ...ctx, snap: { ...base.snap, level: (s: string) => (s === skill ? level : base.snap.level(s)) } });
    return raised.eligible && raised.netPerHour && raised.netPerHour.slow > 0 ? [{ methodId: m.id, title: m.title, netPerHour: raised.netPerHour, skill, level }] : [];
  });
}

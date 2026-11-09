// The one committed Decision as the pages, syncs and hooks read it (v14). Only the provider (decisionContext.tsx) writes it;
// readers import this module so they never pull in the provider's funding and route dependencies.
import { createContext, useContext, useMemo } from 'react';
import type { Progress, Step } from '../types';
import type { QuestObservation } from '../domain/player/questObservation';
import type { QuestInstruction } from '../services/runeliteBridge';
import type { CandidateRow, CommittedDecision } from '../domain/planning/contracts';
import { isClosed } from '../domain/quests/next-step';
import { questCatalogue } from '../domain/planning/catalogue';

export interface DecisionValue { decision: CommittedDecision | null; window: readonly Step[] }

export const DecisionCtx = createContext<DecisionValue>({ decision: null, window: [] });

/** The committed Decision; null while the facts cannot support one (the pages then show that it waits for data). */
export function useDecision(): CommittedDecision | null {
  return useContext(DecisionCtx).decision;
}

/** The levels the committed Decision's current action needs (its skill-floor effects), with that action as the reason.
 * Skills, combat range hints and the calculator take their goals from here, never from the old guide's stages. */
export function plannerSkillGoals(decision: CommittedDecision | null): ReadonlyMap<string, { level: number; why: string }> {
  const out = new Map<string, { level: number; why: string }>();
  for (const effect of decision?.activeAction.expectedEffects ?? []) {
    if (effect.kind === 'skill-floor' && effect.level > (out.get(effect.skill)?.level ?? 0)) out.set(effect.skill, { level: effect.level, why: decision!.activeAction.title });
  }
  return out;
}

export function usePlannerSkillGoals(): ReadonlyMap<string, { level: number; why: string }> {
  const decision = useDecision();
  return useMemo(() => plannerSkillGoals(decision), [decision]);
}

/** The steps the Decision runs next: its current step and at most two successors (planningWindow). Empty without one. */
export function useDecisionWindow(): readonly Step[] {
  return useContext(DecisionCtx).window;
}

/** The Decision's window for the providers above it (readiness, funding, the bridge): the provider publishes it here,
 * so preparation looks ahead along the planner's road, never the guide's next steps (2.82.2). */
export const PlanWindowCtx = createContext<{ window: readonly Step[]; setWindow: (window: readonly Step[]) => void }>({ window: [], setWindow: () => {} });

/** The planner's window as the providers above the Decision read it; empty before the first Decision. */
export function usePlanWindow(): readonly Step[] {
  return useContext(PlanWindowCtx).window;
}

/** The authored step the Decision's current action runs on, or null (a VERIFY action, or a step outside these steps). */
/** The steps of the Decision's objective (a quest's own steps), or none for a training or unresolved objective. */
export function objectiveSteps(decision: CommittedDecision | null): ReadonlySet<string> {
  return new Set(questCatalogue.find(quest => quest.id === decision?.objectiveId)?.stepIds ?? []);
}

/**
 * The steps the game may show instead of the Decision's: its objective's own steps, plus the game's step when it is a quest
 * step, carries that quest's instruction, or the plugin reports no quest states. A leftover training step of the old route
 * order (S0-04 in the 2026-11-04 telemetry) is not among them.
 */
export function followedSteps(decision: CommittedDecision | null, gameStepId: string | null, quests: QuestObservation | null, instruction: QuestInstruction | null): ReadonlySet<string> {
  const steps = new Set(objectiveSteps(decision));
  if (!gameStepId) return steps;
  // An open quest step in the game may be one the player pointed there (Show in game, Start the step), and a quest instruction
  // means its guide is open, so both stay. A non-quest step stays only when no quest states are known (an older plugin).
  const quest = questCatalogue.some(q => q.stepIds.includes(gameStepId));
  if (quest || instruction?.stepId === gameStepId || quests === null) steps.add(gameStepId);
  return steps;
}

export interface PlannerRow extends CandidateRow { stepId: string | null; title: string }

/** A readable name for an objective: quests are named already; "training:ranged:40" reads "Train Ranged to 40". */
export function objectiveTitle(id: string): string {
  const m = /^training:([a-z]+):(\d+)$/.exec(id);
  return m ? `Train ${m[1][0].toUpperCase()}${m[1].slice(1)} to ${m[2]}` : id;
}

/** The planner's live order of open objectives, each with the step it opens: the chosen one at its current action, the rest at their first open step. */
export function plannerOrder(decision: CommittedDecision | null, progress: Progress): PlannerRow[] {
  return (decision?.candidates ?? []).map(row => {
    const own = row.id === decision!.objectiveId ? decision!.activeAction.stepId : undefined;
    return { ...row, title: objectiveTitle(row.id), stepId: own ?? questCatalogue.find(quest => quest.id === row.id)?.stepIds.find(id => !isClosed(progress, id)) ?? null };
  });
}

export function decisionStep(decision: CommittedDecision | null, steps: readonly Step[]): Step | null {
  const id = decision?.activeAction.stepId;
  return id ? (decision?.activeAction.executionStep?.id === id ? decision.activeAction.executionStep : steps.find(step => step.id === id)) ?? null : null;
}

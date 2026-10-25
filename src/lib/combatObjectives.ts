// One combat objective projection for plan comparison, food preparation and shopping.
import type { Step } from '../types';
import { nameKey, type OwnedState } from './checklist';
import { estimateStep, foeVariants, stepGoals, xpPerKill, type CombatEstimate, type StepEstimateContext } from './combatEstimate';
import { GUARANTEED_DROPS } from './combatRoute/spots';
import { heldExact } from './playerState';
import { levelForXp, xpForLevel } from './xp';

type Goal = ReturnType<typeof stepGoals>[number];
type EstimatedStep = Pick<Step, 'pacing' | 'foes' | 'itemsRequired'>;

export function asked(step: EstimatedStep, foe: string, goals: readonly Goal[]): EstimatedStep {
  const [first, ...rest] = goals;
  return {
    foes: [foe],
    ...(step.itemsRequired ? { itemsRequired: step.itemsRequired } : {}),
    pacing: {
      skill: first.skill, targetLevel: levelForXp(first.exp), targetExp: first.exp, actionName: 'kill', expPerAction: 1,
      ...(rest.length ? { also: rest.map(g => g.skill), goals: Object.fromEntries(rest.map(g => [g.skill, { level: levelForXp(g.exp), exp: g.exp }])) } : {}),
    },
  };
}

export function currentXp(ctx: StepEstimateContext, skill: Goal['skill']): number {
  return Math.max(ctx.xp?.[skill] ?? xpForLevel(ctx.stats?.[skill] ?? 1), ctx.assume?.xp?.[skill] ?? 0);
}

/** Collection needs a whole-fight estimate even when the route's XP target is already reached. */
export function dropEstimates(step: EstimatedStep, foe: string, count: number, skill: Goal['skill'], ctx: StepEstimateContext): CombatEstimate[] {
  if (count <= 0) return [];
  return foeVariants(foe).flatMap(v => estimateStep(asked(step, foe, [{ skill, exp: currentXp(ctx, skill) + count * xpPerKill(v) }]), ctx)
    .filter(e => e.foe.combat === v.combat && e.foe.version === v.version));
}

/** Preserve the full-fight health buffer; never multiply a one-kill estimate into fifty free kills. */
export function objectiveEstimates(step: EstimatedStep, foe: string, goals: Goal[], count: number, ctx: StepEstimateContext): CombatEstimate[] {
  if (!goals.length) return [];
  const base = estimateStep(asked(step, foe, goals), ctx);
  if (count <= 0) return base;
  return foeVariants(foe).flatMap(v => {
    const first = base.find(e => e.foe.combat === v.combat && e.foe.version === v.version);
    if (first && first.kills >= count) return [first];
    const extra = Math.max(0, count - (first?.kills ?? 0));
    const main = goals[0];
    const extended = [{ ...main, exp: Math.max(main.exp, currentXp(ctx, main.skill)) + extra * xpPerKill(v) }, ...goals.slice(1)];
    return estimateStep(asked(step, foe, extended), ctx).filter(e => e.foe.combat === v.combat && e.foe.version === v.version);
  });
}

/** Existing one-guaranteed-drop-per-kill route contract; unknown stock remains a disclosed collection ceiling. */
export function itemGoal(step: Pick<Step, 'foes' | 'inGame'>, owned: OwnedState | null): { name: string; count: number; missing: number; held: number | null; unread: boolean } | null {
  const foe = step.foes?.[0];
  const trig = step.inGame?.completionTrigger?.items;
  if (!foe || !trig?.length) return null;
  const drops = GUARANTEED_DROPS[foe] ?? [];
  for (const it of trig) {
    const name = it.names.find(n => drops.some(d => nameKey(d) === nameKey(n)));
    if (!name) continue;
    const stock = heldExact({ owned, bankSeen: owned?.bankSeen === true, equipment: {}, manual: {} }, name);
    // Positive known stock reduces the ceiling; only this row's known bank count completes the observation.
    const held = stock.total;
    return { name, count: it.count, missing: Math.max(0, it.count - (held ?? 0)), held, unread: stock.bank === null };
  }
  return null;
}

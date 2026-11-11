import type { Step } from '../../../types';
import type { TacticalFrame, TacticalInput } from '../tactical';
import type { CandidateAction, Minutes, PlanningSnapshot } from '../contracts';
import { createReadinessEngine } from '../../readiness/readinessEngine';
import { buildNeed } from '../../economy/funding/need';
import { buildSnapshot } from '../../economy/funding/snapshot';
import { buildBudget } from '../../economy/funding/budget';
import { resolvePreparation } from '../preparation';
import { preparationTime } from '../preparationTime';
import { sumMinutes } from '../cost';
import { levelOf } from '../../player/playerState';
import { xpForLevel } from '../../player/xp';
import type { TrainingCandidate } from '../training';
import { encounterSetups, encounterWork, type EncounterSetup } from './setups';
import { estimateStepFights } from '../../combat/fightEstimate';
import { safetyBlockers } from '../../prep/prepPlan';

export interface EncounterFrame extends TacticalFrame {
  encounter: { work: Minutes; baseline: Minutes; reasons: readonly string[]; uncertain: boolean };
}

/** Cost alternative preparations of this encounter through the SAME engines used for ordinary requirements.
 * Hypothetical stats never leave the estimator; the executable frame always has observed inventory/equipment/levels. */
export function chooseEncounter(input: TacticalInput, step: Step, goalId: string,
  resolveTraining: (step: Step) => TacticalFrame,
  trainingCandidate: (skill: string, target: number) => TrainingCandidate | null, committedReserve: number): EncounterFrame | null {
  const { snapshot } = input;
  const origin = snapshot.player.position.known ? snapshot.player.position.value : null;
  const finish = step.mapLocation ? { x: step.mapLocation.x, y: step.mapLocation.y, plane: step.mapLocation.plane } : null;
  const walk = input.walk ?? (() => null);
  function context(execution: Step, facts: PlanningSnapshot = snapshot) {
    const window = [execution]; // Price this encounter only; the committed window's fees are retained separately below.
    const engine = createReadinessEngine({ steps: window, window, progress: { ...input.progress, steps: {} }, qp: snapshot.questPoints.known ? snapshot.questPoints.value : 0,
      mode: snapshot.scope.mode, state: facts.player, prices: input.prices, questInstruction: null });
    const plan = engine.plan(execution), readiness = engine.readiness(execution);
    const need = buildNeed({ step: execution, prep: plan, prices: input.prices, owned: facts.player.owned, manual: facts.player.manual });
    const snap = buildSnapshot({ state: facts.player, window: input.window, questPoints: snapshot.questPoints.known ? snapshot.questPoints.value : null,
      ironman: input.ironman, position: origin });
    const baseBudget = buildBudget({ snap, need, prices: input.prices, recs: [], bankValue: null, committedWindow: true });
    const reserve = Math.max(baseBudget.reserve, committedReserve);
    const budget = { ...baseBudget, reserve, spendable: baseBudget.liquid.amount === null ? null : Math.max(0, baseBudget.liquid.amount - reserve) };
    return { step: execution, plan, readiness, budget, need };
  }
  function prepare(execution: Step, facts: PlanningSnapshot = snapshot) {
    const frame = context(execution, facts);
    const action = resolvePreparation({ snapshot: facts, goalId, ...frame, coinsRequired: frame.need.fees.now, ironman: input.ironman,
      train: () => null, gather: input.gather, earn: required => input.earn(execution, required, frame.budget, goalId) });
    return { ...frame, action };
  }
  function evaluate(setup: EncounterSetup) {
    // Raising only the planned skills enables their later purchase; the copied state still owns/wears ONLY real items.
    const future = setup.targets.length ? { ...snapshot, player: { ...snapshot.player, levels: { ...snapshot.player.levels,
      ...Object.fromEntries(setup.targets.map(t => [t.skill, { known: true as const, value: t.level, source: 'profile' as const }])) } } } : snapshot;
    const supplies = prepare(setup.step, future);
    if (safetyBlockers(supplies.plan.safety ?? [], supplies.plan.lines, true).length || supplies.plan.slots.over > 0) return null;
    const { need, budget } = supplies;
    const priced = need.minimum.unpriced === 0 && need.unknown === 0;
    // Price the whole kit, not just whichever missing line happened to be first. Never spend unsold loot or unread bank GP.
    const required = priced ? need.minimum.cost + budget.reserve : null;
    const gap = required !== null && budget.liquid.amount !== null ? Math.max(0, required - budget.liquid.amount) : null;
    const earning = gap && budget.liquid.complete ? input.earn(setup.step, required!, budget, goalId) : null;
    if (gap && budget.liquid.complete && !earning) return null;
    let action = earning ?? supplies.action;
    let active: TacticalFrame | null = null, from = origin, unmeasuredXp = 0;
    const parts: (Minutes | null)[] = [];
    for (const target of setup.targets) {
      const candidate = trainingCandidate(target.skill, target.level);
      if (!candidate?.step || !candidate.combatXp) return null;
      // XP work comes from trainingRouter; actual current-kit preparation and every walking leg are separate.
      const at = candidate.step.mapLocation, spot = at ? { x: at.x, y: at.y, plane: at.plane } : null;
      if (!active) {
        active = resolveTraining(candidate.step);
        if (active.action?.kind === 'VERIFY' || active.action?.kind === 'MANUAL_WAIT') return null;
        action = active.action ?? { ...candidate.action, feasibility: 'READY' as const };
        parts.push(spot ? preparationTime(active, origin, walk, input.gather, spot) : null);
      } else parts.push(spot ? walk(from, spot) : null);
      parts.push(candidate.remaining);
      if (!candidate.remaining) unmeasuredXp += xpForLevel(target.level) - xpForLevel(levelOf(snapshot.player, target.skill) ?? 1);
      from = spot;
    }
    const pricedFrame = { ...supplies, action: earning ?? supplies.action };
    parts.push(finish ? preparationTime(pricedFrame, from, walk, input.gather, finish) : null);
    const preparation = sumMinutes(parts);
    const total = sumMinutes([preparation, setup.fight]);
    const actual = active ?? supplies;
    return { setup, action, actual, preparation, total, gp: required, unmeasuredXp, unknown: parts.filter(part => !part).length,
      known: setup.fight.typical + parts.reduce((sum, part) => sum + (part?.typical ?? 0), 0) };
  }
  const baseline = encounterSetups(step, snapshot, input.prices, input.ironman, { currentOnly: true });
  // Already safe and supplied: do not spend money or start training just for a marginal faster kill.
  const current = baseline[0];
  const ready = current && evaluate(current);
  const rows = ready && !ready.action ? [ready] : encounterSetups(step, snapshot, input.prices, input.ironman, { keepDefenceOne: input.keepDefenceOne }).flatMap(setup => {
    const row = !setup.kit.length && !setup.targets.length ? ready : evaluate(setup);
    return row ? [row] : [];
  });
  // Complete rows compare by total time. An incomplete row never wins by what it leaves out: an unknown part is not zero
  // minutes. Something the player can do now comes before a check, then the smallest unmeasured training (its XP is known),
  // then fewer unknown parts, then known minutes.
  const check = (row: typeof rows[number]) => Number(row.action?.kind === 'VERIFY' || row.action?.kind === 'MANUAL_WAIT');
  rows.sort((a, b) => Number(!a.total) - Number(!b.total) || check(a) - check(b) || a.unmeasuredXp - b.unmeasuredXp || a.unknown - b.unknown
    || (a.total?.typical ?? a.known) - (b.total?.typical ?? b.known)
    || (a.gp ?? Infinity) - (b.gp ?? Infinity) || a.setup.label.localeCompare(b.setup.label));
  const chosen = rows[0];
  if (!chosen) return null;
  const describe = (row: typeof chosen) => `${row.setup.label}: ${row.preparation ? `${row.preparation.fast.toFixed(1)}–${row.preparation.slow.toFixed(1)} min preparation/travel` : 'preparation/travel time unknown'} + ${row.setup.fight.fast.toFixed(1)}–${row.setup.fight.slow.toFixed(1)} min combat${row.gp === null ? '; cost unknown' : `; ${row.gp} gp required including reserves`}`;
  const unknown = rows.filter(r => !r.total);
  const reasons = [`Combat strategy: ${chosen.setup.label}. ${chosen.total ? 'Lowest estimated complete time among costed safe alternatives.' : 'Time comparison incomplete; verify the unpriced parts.'}`,
    ...(!current ? ['Current equipment: the conservative food estimate does not fit the encounter inventory.'] : []),
    describe(chosen), ...rows.filter(r => r !== chosen).slice(0, 3).map(describe),
    ...(chosen.setup.targets.length ? ['Training pace and later kit changes are phased forecasts; each phase is checked again against observed levels and possessions.'] : []),
    ...(unknown.length && chosen.total ? [`Not fully compared: ${unknown.slice(0, 3).map(r => r.setup.label).join('; ')}; missing travel, supply or earning time.`] : [])];
  const action: CandidateAction | null = chosen.action ? { ...chosen.action, executionStep: chosen.actual.step,
    reasons: [...chosen.action.reasons, ...reasons] } : null;
  return { ...chosen.actual, action, preparationMinutes: chosen.preparation, encounter: { work: chosen.setup.fight, reasons,
    baseline: encounterWork(estimateStepFights(step, snapshot.combat?.stats ?? null, snapshot.combat?.gear ?? null)), uncertain: unknown.length > 0 || chosen.setup.targets.length > 0 } };
}

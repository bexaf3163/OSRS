import { nameKey } from '../items/itemKey';
import type { Step, StepItemRequirement, StepRequirement } from '../../types';
import { healsOf } from '../combat/combatEstimate';
import { questOf } from '../player/playerState';
import type { MethodEvaluation } from '../economy/funding/evaluate';
import type { FundingPlanState, FundingView } from '../economy/funding/plan';
import type { CandidateAction, PlanningSnapshot } from './contracts';

export interface FundingActionInput {
  snapshot: PlanningSnapshot;
  goalId: string;
  plan: FundingPlanState;
  /** Built by viewOf from this exact plan and the current funding snapshot. */
  view: FundingView;
  evaluation: MethodEvaluation | null;
  ironman: boolean | null;
  /** Shared tactical preparation of the funding method, not the parent quest's kit. */
  preparation: { ready: boolean; action: CandidateAction | null; unresolved?: readonly string[] };
}

/** Use the evaluator's actual first batch and chosen tools. The parent quest's kit is not a funding kit. */
export function fundingKit(evaluation: MethodEvaluation, stepId: string, snapshot: PlanningSnapshot): { step: Step; unresolved: string[] } {
  const { method, preparation } = evaluation;
  const unresolved: string[] = [];
  const itemsRequired: StepItemRequirement[] = [];
  const references = [...method.inputs.map(flow => flow.item), ...method.requirements.flatMap(req => req.kind === 'item' ? req.any : [])];
  const add = (name: string, amount: number) => {
    if (!name.trim() || !Number.isSafeInteger(amount) || amount < 1) { unresolved.push('A valid physical funding supply quantity'); return; }
    const id = references.find(ref => nameKey(ref.name) === nameKey(name))?.id;
    const heals = healsOf(name);
    itemsRequired.push({ nameEn: name, amount, howToGet: `For ${method.title}; current batch only.`,
      ...(id && id > 0 ? { wikiItemId: id } : {}), ...(heals !== null ? { heals } : {}) });
  };
  const toolRequirements = method.requirements.filter(req => req.kind === 'item' && req.role === 'tool');
  if (!preparation || !Number.isSafeInteger(preparation.units) || preparation.units < 1) unresolved.push('The executable funding batch');
  else {
    if (preparation.tools.length !== toolRequirements.length) unresolved.push('Every required funding tool');
    for (const tool of preparation.tools) {
      if (tool.unknown || !tool.name) unresolved.push('The selected usable funding tool');
      else add(tool.name, 1);
    }
    for (const input of preparation.inputs) add(input.name, input.qty);
    // A changed or incomplete evaluator projection cannot silently omit a recipe input.
    for (const flow of method.inputs.filter(flow => flow.item.id !== 995 && flow.qty > 0)) {
      if (!preparation.inputs.some(input => nameKey(input.name) === nameKey(flow.item.name))) unresolved.push(`The current ${flow.item.name} batch`);
    }
  }
  // Catalogue gear alternatives need a real usability/loadout projection before they can be declared ready.
  if (method.requirements.some(req => req.kind === 'item' && req.role === 'gear')) unresolved.push('The usable funding equipment alternatives');
  const fares = method.requirements.reduce((total, req) => total + (req.kind === 'fare'
    && !(req.unlessQuest && questOf(snapshot.player, req.unlessQuest) === 'DONE') ? req.coins : 0), 0);
  let payments = fares;
  for (const flow of method.inputs.filter(flow => flow.item.id === 995)) {
    if (flow.chance || !preparation) unresolved.push('The current funding trip payments');
    else payments += flow.qty * preparation.units;
  }
  if (payments > 0) add('Coins', Math.ceil(payments));
  for (const req of method.requirements) if (req.kind === 'quest' && req.state === 'started') {
    const state = snapshot.quests[req.quest]?.state;
    if (state !== 'IN_PROGRESS' && state !== 'COMPLETED') unresolved.push(`Observed started-quest access for ${req.quest}`);
  }
  return { unresolved, step: { id: stepId, type: 'prep', stage: 0, title: method.title, requires: [],
    membersOnly: method.access === 'members', itemsRequired,
    requirements: method.requirements.flatMap<StepRequirement>(req => req.kind === 'level' ? [{ type: 'skill' as const, skill: req.skill, min: req.level }]
      : req.kind === 'quest' && req.state === 'complete' ? [{ type: 'quest' as const, quest: req.quest }] : []),
    minQp: Math.max(0, ...method.requirements.flatMap(req => req.kind === 'qp' ? [req.points] : [])),
    ...(method.combat ? { foes: [method.combat.foe] } : {}),
    mapLocation: { ...method.spot }, doneWhen: 'Observe the existing funding plan phase; preparation never completes the parent activity.' } };
}

/** Project the existing local machine. This adapter never advances it, starts another plan or credits expected proceeds. */
export function fundingAction(input: FundingActionInput): CandidateAction | null {
  const { snapshot, goalId, plan, view, evaluation, preparation } = input;
  if (!snapshot.player.connected || !snapshot.player.player || nameKey(snapshot.player.player) !== nameKey(plan.character)
    || view.planId !== plan.id || view.version !== plan.version || view.status !== plan.status
    || view.sourceStepId !== plan.sourceStepId || plan.status === 'DONE' || plan.status === 'CANCELLED') return null;
  const substep = plan.subSteps[plan.active];
  if (!substep || substep.done || view.stepIndex !== plan.active + 1 || view.stepCount !== plan.subSteps.length
    || view.kind !== substep.kind || view.action !== substep.text) return null;
  if (preparation.action && (preparation.action.goalId !== goalId
    || preparation.action.completionEvidence.some(evidence => evidence.snapshotRevision !== snapshot.scope.snapshotRevision))) return null;
  const method = evaluation?.method;
  const sourceIds = ['funding/plan', ...(method?.sources.map(source => source.url) ?? [])];
  const base = (kind: CandidateAction['kind'], title: string, predicate: string): CandidateAction => ({
    // Repeated trips reuse substep IDs. Keep their execution identity distinct without tying it to every inventory update.
    id: `${goalId}:funding:${plan.id}:${plan.version}:${plan.trips ?? 1}:${substep.id}:${kind}`,
    goalId, kind, title, stepId: plan.sourceStepId,
    feasibility: kind === 'VERIFY' ? 'UNKNOWN' : kind === 'MANUAL_WAIT' ? 'PREP_REQUIRED' : 'READY',
    prerequisites: [], completionEvidence: [{ source: `Funding plan ${plan.id}:${plan.version}:${substep.id}`,
      snapshotRevision: snapshot.scope.snapshotRevision, predicate }],
    expectedEffects: [], time: null, gpCost: null, sourceIds,
    reasons: [plan.kind === 'SELF_GATHER' ? 'Supply the selected activity without assuming a sale' : 'Fund the selected activity; loot value is not spendable GP'],
    ...(substep.place ? { destination: { x: substep.place.x, y: substep.place.y, plane: substep.place.plane } } : {}),
  });
  if (plan.status === 'PAUSED') return base('MANUAL_WAIT', 'Your funding plan is paused', 'Owner explicitly resumes or cancels the funding plan');
  // The saved plan is evidence of intent, never proof that the method is still feasible under current facts.
  if (plan.methodId && (!method || method.id !== plan.methodId)) return base('VERIFY', 'Check the current funding method', 'Current method evaluation matches the saved plan');
  if (['prepare', 'restock', 'travel', 'perform'].includes(substep.kind) && preparation.unresolved?.length) {
    return base('VERIFY', `Check ${preparation.unresolved[0].toLowerCase()}`, 'Funding batch, access, payments and protection resolved');
  }
  if (substep.kind === 'prepare' || substep.kind === 'restock') {
    return preparation.action ?? base('MANUAL_WAIT', substep.text, 'Required supplies observed or preparation explicitly confirmed');
  }
  if (substep.kind === 'resume') return base('VERIFY', 'Check preparation and return to your selected activity', 'Required usable supplies and liquid GP observed');
  if (substep.kind === 'travel' || substep.kind === 'perform') {
    if (plan.kind !== 'SELF_GATHER' && input.ironman === null) return base('VERIFY', 'Check whether this account can trade', 'Observed account trading mode');
    if (plan.kind !== 'SELF_GATHER' && input.ironman) return base('MANUAL_WAIT', 'This account cannot use the Grand Exchange', 'Select an accessible self-supply method');
    if (evaluation) {
      const unknown = evaluation.checks.find(check => check.status === 'unknown');
      if (unknown) return base('VERIFY', unknown.text, 'Funding requirement verified against current observations');
      if (!evaluation.eligible) return base('MANUAL_WAIT', evaluation.blockers[0]?.text ?? 'Resolve the funding method requirements', 'Current funding method is eligible');
      const manual = method!.requirements.findIndex((requirement, index) => requirement.kind === 'check' && requirement.hard !== false
        && snapshot.manual[`funding:${method!.id}:requirement:${index}`] !== true);
      if (manual >= 0) {
        const requirement = method!.requirements[manual];
        return base('MANUAL_WAIT', requirement.kind === 'check' ? requirement.text : 'Verify the funding method', 'Manual funding condition confirmed');
      }
    }
    if (preparation.action) return preparation.action;
    if (!preparation.ready) return base('VERIFY', 'Check the funding method supplies and protection', 'Shared preparation and safety requirements met');
  }
  if (substep.kind === 'travel') return base('TRAVEL', substep.text, 'Funding state machine observes arrival on the correct floor');
  if (substep.kind === 'perform') return base(plan.kind === 'SELF_GATHER' ? 'GATHER' : 'EARN', substep.text, 'Funding state machine observes the required output or explicit confirmation');
  // Banking and selling remain parts of earning: neither depositing loot nor its estimate creates money.
  if (substep.kind === 'bank' || substep.kind === 'sell') return base('EARN', substep.text, substep.kind === 'sell'
    ? 'Comparable liquid coins rise or the owner confirms the sale' : 'Output leaves the inventory at the bank or the owner confirms');
  return base('VERIFY', 'Review the saved funding action', 'Supported local funding phase');
}

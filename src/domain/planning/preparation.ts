import type { Step } from '../../types';
import type { PrepLine, PrepPlan } from '../prep/prepPlan';
import type { StepReadiness } from '../readiness/readiness';
import type { Budget } from '../economy/funding/budget';
import { purchaseCost, purchaseFees } from '../items/purchaseCost';
import { nameKey } from '../items/itemKey';
import type { PurchaseFee } from '../items/purchaseCost';
import type { CandidateAction, Minutes, PlanningSnapshot } from './contracts';

export interface PreparationInput {
  snapshot: PlanningSnapshot;
  goalId: string;
  step: Step;
  plan: PrepPlan;
  readiness: StepReadiness;
  budget: Pick<Budget, 'liquid' | 'reserve' | 'spendable'>;
  /** Unknown account mode cannot establish Grand Exchange eligibility. Shops remain available to Ironmen. */
  ironman: boolean | null;
  /** Acquisition fees already inside budget.reserve. A selected purchase must not charge its own reserved fee again. */
  reservedPurchases?: readonly { fee?: PurchaseFee }[];
  /** Carried payments for the current action; future reserved payments stay in the bank. */
  coinsRequired?: number;
  /** Owned model defines real minimum versus suggested supply range; never inferred from arbitrary item names. */
  minimum?: ReadonlyMap<string, number>;
  train: (skill: string, target: number) => CandidateAction | null;
  earn: (requiredGp: number) => CandidateAction | null;
  /** Minutes to gather these pieces yourself (the Money engine's supply mode); null when no method yields them. */
  gather?: (name: string, count: number) => Minutes | null;
  /** The step's fights are prepared by the encounter strategy, which puts the protection on after any training: not asked for here. */
  encounter?: boolean;
}

/** Project existing physical allocations into one subaction. Never select another overall goal here. */
export function resolvePreparation(input: PreparationInput): CandidateAction | null {
  const { snapshot, goalId, step, plan } = input;
  function action(kind: CandidateAction['kind'], key: string, title: string, predicate: string, line?: PrepLine): CandidateAction {
    const destination = line?.action?.nav;
    return { id: `${goalId}:${kind}:${key}`, goalId, kind, title, stepId: step.id,
      feasibility: kind === 'VERIFY' ? 'UNKNOWN' : kind === 'MANUAL_WAIT' ? 'PREP_REQUIRED' : 'READY',
      prerequisites: [], completionEvidence: [{ source: 'Shared readiness and physical stock allocation', snapshotRevision: snapshot.scope.snapshotRevision, predicate }],
      expectedEffects: [], time: null, gpCost: null, sourceIds: ['readinessEngine', 'prepPlan'],
      reasons: [line?.why ?? 'Resolve a prerequisite of the selected objective'],
      ...(destination ? { destination: { x: destination.x, y: destination.y, plane: destination.plane ?? 0 } } : {}) };
  }
  if (!snapshot.player.connected) return action('VERIFY', 'connection', 'Connect RuneLite to check the current preparation', 'Current character and usable possessions observed');
  const structural = input.readiness.requirements.filter(req => req.hard && req.kind !== 'item' && req.kind !== 'coins' && req.state !== 'OK');
  const unknown = structural.find(req => req.state === 'UNKNOWN');
  if (unknown) return action('VERIFY', unknown.kind + unknown.label, `Check ${unknown.label}`, `${unknown.label} verified`);
  const skill = structural.find(req => req.kind === 'skill' && req.stat);
  if (skill?.stat) return input.train(skill.stat.skill, skill.stat.min)
    ?? action('VERIFY', skill.label, `Choose a supported method for ${skill.label}`, 'Training prerequisites and method verified');
  const blocked = structural.find(req => req.kind !== 'skill');
  if (blocked) return action('MANUAL_WAIT', blocked.label, blocked.label, `${blocked.label} resolved`);
  if (plan.slots.over > 0) return action('WITHDRAW', 'bag-space', `Bank extras to free ${plan.slots.over} inventory slots`, 'Required free inventory slots observed');

  const required = plan.lines.filter(line => line.timing === 'NOW' && (line.priority === 'CRITICAL' || line.priority === 'IMPORTANT'));
  for (const line of required) {
    const count = input.minimum?.get(line.key) ?? line.count;
    if (!Number.isFinite(count) || count < 0) return action('VERIFY', line.key, `Check the requirement for ${line.name}`, 'Valid required quantity');
    if (count === 0) continue; // A routine supply recommendation cannot become a hard prerequisite.
    const bag = line.have.bag, equipped = line.have.equipped;
    if (line.equip && equipped >= count) continue;
    if (!line.equip && bag !== null && bag + equipped >= count) continue;
    if (line.equip && bag !== null && bag >= count) return action('EQUIP', line.key, `Equip ${line.name}`, `${line.name} worn`, line);
    // A noted item is not usable stock. A bank visit/withdrawal never means that it has already happened.
    if (line.where === 'BANK' || line.unnote || (line.have.bank !== null && line.have.bank > 0)) {
      return action('WITHDRAW', line.key, `Withdraw ${line.name}`, `${line.name} usable in inventory${line.equip ? ', then equip it' : ''}`, line);
    }
    if (line.where === 'UNKNOWN' || bag === null) return action('VERIFY', line.key, `Check your bank for ${line.name}`, `${line.name} ownership verified`, line);
    if (line.action?.kind === 'GATHER') {
      const source = line.action.acquisition;
      const requirement = source?.questAccess;
      const quest = requirement && Object.entries(snapshot.quests).find(([name]) => nameKey(name) === nameKey(requirement.quest))?.[1];
      const questAccess = !requirement || quest?.state === 'COMPLETED' || (requirement.state === 'started' && quest?.state === 'IN_PROGRESS');
      if (source?.kind !== 'free' || !source.point || !questAccess || (source.access !== undefined && source.access !== 'open')) {
        // No usable free pickup: gathering it yourself is a real action when a method yields it, with its own time.
        const time = input.gather?.(line.name, Math.max(1, line.count - (bag ?? 0) - equipped)) ?? null;
        if (time) return { ...action('GATHER', line.key, `Gather ${line.name}`, `${line.name} acquired`, line), time };
        return action('VERIFY', `source:${line.key}`, `Check how to gather ${line.name}`, 'Acquisition access, method, kit and protection verified', line);
      }
      return action('GATHER', line.key, line.action.label, `${line.name} acquired`, line);
    }
    if (line.action?.kind !== 'BUY' && line.action?.kind !== 'EARN') return action('VERIFY', line.key, `Check how to obtain ${line.name}`, 'Available acquisition source verified', line);
    if (line.action.purchase?.source !== 'shop' && input.ironman !== false) {
      return action('VERIFY', `trade:${line.key}`, input.ironman === true ? `Choose a self-supply source for ${line.name}` : 'Check whether this account can trade',
        input.ironman === true ? 'Accessible non-exchange acquisition method verified' : 'Observed account trading mode', line);
    }
    const missing = Math.max(0, count - bag - equipped);
    const price = line.unit === 'dose' && line.marketPrice?.quantity !== missing ? null
      : purchaseCost({ price: line.action.price ?? line.marketPrice?.unit, fee: line.action.purchase?.fee }, missing);
    const cash = input.budget.spendable;
    const fee = line.action.purchase?.fee;
    const reservedFee = fee ? Math.min(fee.coins, input.budget.reserve,
      purchaseFees((input.reservedPurchases ?? []).filter(purchase => purchase.fee?.key === fee.key))) : 0;
    if (price !== null && cash !== null && cash + reservedFee < price) {
      if (!input.budget.liquid.complete) return action('VERIFY', 'bank-coins', 'Check your bank balance before earning more', 'Spendable liquid GP verified');
      return input.earn(price + input.budget.reserve - reservedFee) ?? action('VERIFY', 'funding', 'Check a feasible funding method', 'Funding method and working capital verified');
    }
    if (price === null || cash === null) {
      const check = action('VERIFY', `offer:${line.key}`, `Check the offer and coins for ${line.name}`, 'Acquisition price and sufficient available liquid GP verified', line);
      check.reasons = [...check.reasons, 'Confirm the offer and available coins before buying'];
      return check;
    }
    const buy = action('BUY', line.key, `Get ${line.name}`, `${line.name} acquired in usable form`, line);
    buy.gpCost = price === null ? null : { amount: price, confidence: line.marketPrice?.state === 'current' ? 'MEDIUM' : 'LOW', source: line.action.purchase?.source ?? 'Shared acquisition quote' };
    return buy;
  }
  for (const rule of input.encounter ? [] : plan.safety ?? []) if (rule.worn && rule.equipped !== true) {
    if (rule.equipped == null) return action('VERIFY', `protection:${rule.label}`, 'Check your worn protection', 'Required protective equipment observed worn');
    const carried = plan.lines.find(line => rule.names.some(name => nameKey(name) === nameKey(line.name)) && (line.have.bag ?? 0) > 0);
    if (carried) return action('EQUIP', carried.key, `Equip ${carried.name} before the fight`, `${carried.name} observed worn`, carried);
    return action('VERIFY', `protection:${rule.label}`, `Check how to equip ${rule.names[0]}`, 'Required protective equipment available and worn');
  }
  const coinsRequired = input.coinsRequired ?? plan.coins.need;
  if (coinsRequired > 0) {
    const bag = snapshot.player.coins.bag;
    if (!bag.known) return action('VERIFY', 'coins', 'Read your carried coins', 'Carried coin balance verified');
    if (bag.value < coinsRequired) {
      const bank = snapshot.player.coins.bank;
      if (!bank.known) return action('VERIFY', 'bank-coins', 'Check your bank for the required coins', 'Bank balance verified');
      if (bag.value + bank.value >= coinsRequired) return action('WITHDRAW', 'coins', 'Withdraw the required coins', `Carried coins >= ${coinsRequired}`);
      return input.earn(Math.max(coinsRequired, input.budget.reserve)) ?? action('VERIFY', 'funding', 'Check a feasible funding method', 'Funding method verified');
    }
  }
  return null;
}

// "Am I ready for this, with my account as it is now? If not, what exactly do I change, withdraw, get or buy before going?" One answer on top of the
// preparation plan (prepPlan.ts, the single decision of what a step needs) and, for a fight, the kit check (combatReadiness.ts). It adds no
// requirement of its own: it sorts what the plan found into groups, says the status in words and names the next action.
//
// Rules: unknown is never "missing" and never "ready"; a bank snapshot from an earlier session is said to be one; the percent of the plan, where it is
// shown, counts checked items in place and is never a chance of survival; no kit is promised to keep anyone alive.

import type { OwnedState } from './checklist';
import { SAFETY, lineAmount, safetyBlockers, unitsOf, type PrepLine, type PrepPlan } from './prepPlan';
import type { CombatReadiness } from './combatReadiness';

export type ReadinessLevel = 'READY' | 'READY_CAUTIONS' | 'PREP_NEEDED' | 'NOT_MET' | 'UNKNOWN';

export const LEVEL_LABEL: Record<ReadinessLevel, string> = {
  READY: 'Ready',
  READY_CAUTIONS: 'Ready with cautions',
  PREP_NEEDED: 'Preparation needed',
  NOT_MET: 'Requirements not met',
  UNKNOWN: 'Cannot assess yet',
};

export type BankState = 'live' | 'saved' | 'never' | 'offline';

export interface BankFreshness {
  state: BankState;
  /** When the saved snapshot was written (ms); only for 'saved'. */
  savedAt?: number;
  text: string;
}

export type ReasonGroup = 'access' | 'equipment' | 'safety' | 'optional' | 'unknown';

export const GROUP_LABEL: Record<ReasonGroup, string> = {
  access: 'Access and quest requirements',
  equipment: 'Needed for this activity',
  safety: 'Safety supplies',
  optional: 'Optional upgrades',
  unknown: 'Not checked yet',
};

export type ReasonState = 'ok' | 'bank' | 'missing' | 'unknown' | 'caution';

export interface Reason {
  group: ReasonGroup;
  state: ReasonState;
  text: string;
}

export interface ReadinessVerdict {
  level: ReadinessLevel;
  label: string;
  /** One sentence: the next thing to do, with the real item and count. */
  headline: string;
  reasons: Reason[];
  cautions: string[];
  bank: BankFreshness;
  /** What the plan's percent measures, when it is shown. */
  percentNote: string;
}

export interface VerdictInput {
  plan: PrepPlan;
  connected: boolean;
  owned: OwnedState | null;
  /** Food for this step: its line is judged by healing in the kit check, not by pieces. */
  isFood: (name: string) => boolean;
  combat?: CombatReadiness | null;
  /** One quest fight each with the player's kit (fightEstimate.ts): its line, and the food it may take at the high end. */
  fights?: { line: string; foodHigh: number; foodName: string; foe: string; name?: string }[];
  /**
   * The step's quest fights by name (fightEstimate.stepFightNames). One without an estimate is not assessed: the game has not given the levels and the
   * worn gear, or the app has no numbers for that opponent. Never "ok".
   */
  fightNames?: { name: string; known: boolean }[];
  /** The step's food carried now, in pieces of that food by healing; null — unknown. */
  carriedFood?: number | null;
  /** The worn weapon, when known: a two-handed one leaves no room for a shield a safety rule asks to be worn (Elvarg's Anti-dragon shield). */
  worn?: { weapon: string | null; twoHanded: boolean } | null;
  now?: number;
}

export const PERCENT_NOTE = 'The percent counts the checked items that are already in place. It is not a chance of surviving or of finishing.';

function ago(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** What the app knows of the bank, honestly: seen this session, a copy from an earlier one, never, or no game at all. */
export function bankFreshness(connected: boolean, owned: OwnedState | null, now = Date.now()): BankFreshness {
  if (!connected) return { state: 'offline', text: 'The game is not connected: the bag and the bank cannot be checked.' };
  if (!owned?.bankSeen) return { state: 'never', text: 'Bank contents have not been checked; open any bank so the app can see what you own.' };
  if (owned.bankSavedAt) {
    return {
      state: 'saved', savedAt: owned.bankSavedAt,
      text: `Bank as last seen ${ago(now - owned.bankSavedAt)} (an earlier session); open a bank to refresh it.`,
    };
  }
  return { state: 'live', text: 'Bank checked in this session.' };
}

const count = (l: PrepLine, n = l.count) => `${l.name}${l.unit === 'dose' ? lineAmount(l, n) : n > 1 ? ` ×${n}` : ''}`;

function lineReason(l: PrepLine, group: ReasonGroup): Reason {
  if (l.equip && l.where === 'INVENTORY') return { group, state: 'bank', text: `${count(l)}: with you; equip it before training.` };
  const bag = l.have.bag ?? 0;
  switch (l.where) {
    case 'EQUIPPED':
    case 'INVENTORY':
      return { group, state: 'ok', text: `${count(l)}: with you.` };
    case 'BANK':
      if (l.unnote) return { group, state: 'bank', text: `${count(l)}: ${unitsOf(l, l.unnote)} as banknotes; unnote at a bank before use.` };
      return { group, state: 'bank', text: `${count(l)}: ${bag > 0 ? `${unitsOf(l, bag)} with you, ` : ''}take ${unitsOf(l, l.toGet ?? l.count)} from the bank.` };
    case 'MISSING':
      return { group, state: 'missing', text: `${count(l)}: ${bag > 0 ? `${unitsOf(l, bag)} with you, ` : ''}${unitsOf(l, l.toGet ?? l.count)} still to get${l.action?.label ? ` — ${l.action.label}` : ''}.` };
    default:
      return { group: 'unknown', state: 'unknown', text: `${count(l)}: not in the bag; the bank has not been checked.` };
  }
}

export function readinessVerdict(i: VerdictInput): ReadinessVerdict {
  const { plan, combat } = i;
  const bank = bankFreshness(i.connected, i.owned, i.now);
  const reasons: Reason[] = [];
  const cautions: string[] = [];

  // Access: a level, a quest, a closed step, members. Safety rules (no Anti-dragon shield on the way to Elvarg) are blockers of the plan too, but
  // an item fixes them: they are safety supplies, not access.
  const safetyLabels = new Set(safetyBlockers(plan.stepId, plan.lines).map((b) => b.label));
  const access = plan.blockers.filter((b) => !safetyLabels.has(b.label));
  const safetyBlocks = plan.blockers.filter((b) => safetyLabels.has(b.label));
  // A shield the rule needs is carried, but a two-handed weapon is worn: it cannot be worn with it, so it protects nothing.
  const shieldRule = (SAFETY[plan.stepId] ?? []).find((r) => r.names.some((n) => /shield|ward/i.test(n)));
  if (shieldRule && i.worn?.twoHanded && !safetyBlocks.length) {
    safetyBlocks.push({
      label: `${i.worn.weapon ?? 'Your weapon'} is two-handed: it leaves no room for the ${shieldRule.names[0]}`,
      detail: 'Wield a one-handed weapon for this fight, so the shield can be worn.',
    });
  }
  for (const b of access) reasons.push({ group: 'access', state: 'missing', text: b.detail ? `${b.label}: ${b.detail}` : b.label });
  for (const b of safetyBlocks) reasons.push({ group: 'safety', state: 'missing', text: b.detail ? `${b.label}. ${b.detail}` : b.label });

  // What this step needs now. Food goes to the kit check when there is one (it counts by healing, not by pieces).
  const now = plan.lines.filter((l) => l.timing === 'NOW' && l.priority !== 'OPTIONAL');
  for (const l of now) {
    if (combat && i.isFood(l.name)) continue;
    // The worn weapon is judged by the kit check ("suitable for training..."): one line, not two.
    if (combat?.weapon.ok && (l.where === 'EQUIPPED' || l.where === 'INVENTORY') && combat.weapon.text.startsWith(`${l.name}:`)) continue;
    reasons.push(lineReason(l, i.isFood(l.name) ? 'safety' : 'equipment'));
  }
  if (plan.coins.missing !== null && plan.coins.missing > 0) {
    reasons.push({ group: 'equipment', state: 'missing', text: `Coins: ${plan.coins.missing.toLocaleString('en-US')} gp short for the purchases.` });
  }
  if (combat) {
    const f = combat.food;
    const state: ReasonState = f.short === 0 ? 'ok' : f.carried === null || (f.toBuy === null && f.short > 0) ? 'unknown' : f.toBuy === 0 ? 'bank' : 'missing';
    reasons.push({ group: state === 'unknown' ? 'unknown' : 'safety', state, text: f.text });
    reasons.push({ group: 'equipment', state: combat.weapon.ok === false ? 'missing' : combat.weapon.ok === null ? 'unknown' : 'ok', text: combat.weapon.text });
    reasons.push({ group: 'safety', state: combat.armour.empty.length ? 'caution' : 'ok', text: combat.armour.text });
    cautions.push(...combat.cautions.filter((c) => c !== combat.weapon.text));
  }
  for (const f of i.fights ?? []) {
    // Food the fight needs, with the bag not read: unknown, not fine.
    const unread = f.foodHigh > 0 && (i.carriedFood === null || i.carriedFood === undefined);
    const short = !unread && f.foodHigh > 0 && i.carriedFood! < f.foodHigh;
    if (unread) reasons.push({ group: 'unknown', state: 'unknown', text: `${f.line} The food in your bag has not been read.` });
    else reasons.push({ group: 'safety', state: short ? 'caution' : 'ok', text: f.line });
    if (short) cautions.push(`${f.foe} may take up to ${f.foodHigh} ${f.foodName} with your kit (an estimate); you carry ${i.carriedFood}.`);
  }
  const assessed = new Set((i.fights ?? []).map((f) => f.name ?? f.foe));
  for (const n of (i.fightNames ?? []).filter((x) => !assessed.has(x.name))) {
    if (n.known) reasons.push({ group: 'unknown', state: 'unknown', text: `${n.name}: this fight is not assessed yet: your levels and worn gear have not been read from the game.` });
    else cautions.push(`${n.name}: the app has no combat numbers for it; prepare as the walkthrough says.`);
  }
  for (const l of plan.optimizations.slice(0, 4)) {
    reasons.push({ group: 'optional', state: l.where === 'BANK' ? 'bank' : l.where === 'UNKNOWN' ? 'unknown' : 'missing', text: `${l.name}: ${l.why}${l.action?.label ? ` — ${l.action.label}` : ''}.` });
  }

  // Cautions that do not stop the trip.
  const soon = plan.soon.filter((l) => l.where === 'BANK' || l.where === 'MISSING');
  if (soon.length) cautions.push(`Also for the next steps: ${soon.slice(0, 3).map((l) => count(l)).join(', ')}.`);
  for (const l of now) if (l.supply === 'LOW' && !(combat && i.isFood(l.name))) cautions.push(`${l.name} is low for this step: ${l.have.bag ?? 0} of ${unitsOf(l, l.count)} with you.`);
  if (plan.slots.over > 0) cautions.push(`It will not all fit: ${plan.slots.over} ${plan.slots.over === 1 ? 'slot' : 'slots'} too many.`);
  if (plan.weight.level === 'HEAVY') cautions.push('Heavy: leave what this step does not need in the bank.');
  const reliesOnBank = reasons.some((r) => r.state === 'bank');
  if (bank.state === 'saved' && reliesOnBank) cautions.push(bank.text);

  const blocking = reasons.filter((r) => r.group !== 'optional');
  const missing = blocking.filter((r) => r.state === 'missing');
  const banked = blocking.filter((r) => r.state === 'bank');
  const unknown = blocking.filter((r) => r.state === 'unknown');

  let level: ReadinessLevel;
  let headline: string;
  if (access.length) {
    level = 'NOT_MET';
    headline = `Requirements not met: ${access[0].label}.`;
  } else if (!i.connected) {
    level = 'UNKNOWN';
    headline = 'Cannot assess yet: connect RuneLite so the app can check your bag and bank.';
  } else if (safetyBlocks.length) {
    level = 'PREP_NEEDED';
    headline = `Preparation needed: ${safetyBlocks[0].label}.`;
  } else if (banked.length || missing.length) {
    level = 'PREP_NEEDED';
    headline = prepHeadline(plan, combat ?? null, i.isFood);
  } else if (unknown.length) {
    level = 'UNKNOWN';
    headline = bank.state === 'never' ? 'Bank contents have not been checked; visit a bank to assess owned supplies.' : `Cannot assess yet: ${unknown[0].text}`;
  } else if (cautions.length) {
    level = 'READY_CAUTIONS';
    headline = `Ready with cautions: ${cautions[0]}`;
  } else {
    level = 'READY';
    headline = combat ? `Ready: your kit and food suit ${combat.foe}.` : 'Ready: everything this step needs is with you.';
  }
  return { level, label: LEVEL_LABEL[level], headline, reasons, cautions, bank, percentNote: PERCENT_NOTE };
}

/** The next action when something is to be taken or got: the bank first (it is already yours), then what to get, food named as food. */
function prepHeadline(plan: PrepPlan, combat: CombatReadiness | null, isFood: (n: string) => boolean): string {
  const equip = plan.now.find(l => l.equip && l.where === 'INVENTORY');
  if (equip) return `Equip ${equip.name} before training — it is in your bag.`;
  if (combat?.food.unnote) return combat.food.text;
  const notes = plan.lines.find((l) => l.timing === 'NOW' && l.unnote && l.priority !== 'OPTIONAL');
  if (notes) return `Bank: unnote ${count(notes, notes.unnote)} before using it${isFood(notes.name) ? ' as food' : ''}.`;
  const now = plan.lines.filter((l) => l.timing === 'NOW' && l.priority !== 'OPTIONAL' && !(combat && isFood(l.name)));
  const bank = now.filter((l) => l.where === 'BANK').map((l) => count(l, l.toGet ?? l.count));
  if (combat && combat.food.fromBank > 0) bank.push(`${combat.food.fromBank} ${combat.food.name}`);
  const get = now.filter((l) => l.where === 'MISSING');
  const foodToBuy = combat && combat.food.toBuy ? combat.food.toBuy : 0;
  if (bank.length) {
    const then = get.length ? ` Then get ${count(get[0], get[0].toGet ?? get[0].count)}.` : foodToBuy ? ` Then buy about ${foodToBuy} ${combat!.food.name}.` : '';
    return `Bank: withdraw ${bank.slice(0, 3).join(', ')}${bank.length > 3 ? ' and more' : ''} — you already own ${bank.length === 1 ? 'it' : 'them'}.${then}`;
  }
  if (combat && combat.weapon.ok === false) return `Preparation needed: ${combat.weapon.text}`;
  if (foodToBuy && !get.length) return `Preparation needed: bring food before going — buy about ${foodToBuy} ${combat!.food.name} (or food that heals as much).`;
  const first = get[0];
  if (first) {
    const what = count(first, first.toGet ?? first.count);
    const how = first.action?.label ? ` (${first.action.label})` : '';
    return isFood(first.name) ? `Preparation needed: bring food before going — ${what}${how}.` : `Preparation needed: get ${what}${how}.`;
  }
  if (plan.coins.missing) return `Preparation needed: ${plan.coins.missing.toLocaleString('en-US')} gp short for the purchases.`;
  return 'Preparation needed: see the list below.';
}

// Is this player's kit right for the step's fight? The worn weapon and armour, the food for the next trip, and which version of the opponent
// suits the kit (the level 12 and level 27 Minotaurs side by side). Built on the personal estimate (combatPlan.ts). It says what to change and
// why; it never says a kit guarantees survival.

import type { GearState } from '../services/runeliteBridge';
import { equippedBySlot, gearData } from '../services/gearAdvisor';
import type { CombatPlanView } from './combatPlan';
import { minutesText } from './combatPlan';
import { foeLabel, type CombatEstimate } from './combatEstimate';
import type { GearSlot, Step } from '../types';

export interface CombatFood {
  name: string;
  /** Pieces of the step's food the next trip needs (the estimate's plan). */
  trip: number;
  /** Carried, in pieces of the step's food by healing; null — the bag is not read. */
  carried: number | null;
  /** In the bank the same way; null — the bank was not seen. */
  bank: number | null;
  /** What the bag lacks for the trip. */
  short: number;
  /** Of that, what the bank can give. */
  fromBank: number;
  /** Of the shortfall, owned as notes: deposit and withdraw as usable food. */
  unnote?: number;
  /** What is left to buy or make; null — unknown (the bank was not seen). */
  toBuy: number | null;
  text: string;
}

export interface CombatReadiness {
  /** The version that suits the kit, with the other one beside it; null with a single version. */
  variant: string | null;
  /** The version the advice is for: "Minotaur (level 12)". */
  foe: string;
  weapon: { ok: boolean | null; text: string };
  armour: { empty: string[]; text: string };
  food: CombatFood;
  cautions: string[];
}

const ARMOUR: GearSlot[] = ['head', 'body', 'legs', 'shield'];
const ARMOUR_WORD: Record<string, string> = { head: 'helm', body: 'body armour', legs: 'leg armour', shield: 'shield' };
const MELEE = new Set(['attack', 'strength', 'defence']);

function list(words: string[]): string {
  return words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** The weapon against the step's training: worn, known, and a melee weapon when the step trains melee. */
function weaponCheck(gear: GearState | null, trains: string[]): CombatReadiness['weapon'] {
  if (!gear?.equipment) return { ok: null, text: 'Worn gear has not been read from the game yet.' };
  const eq = equippedBySlot(gear, gearData);
  const w = eq.weapon;
  if (!w) return { ok: false, text: 'No weapon worn: wield the weapon you train with before you go.' };
  if (!w.piece) return { ok: null, text: `${w.name}: the app has no stats for it, so its fit is not checked.` };
  const a = w.piece.attack;
  const melee = Math.max(a.stab, a.slash, a.crush) >= Math.max(a.ranged, a.magic);
  if (trains.some((s) => MELEE.has(s)) && !melee) {
    return { ok: false, text: `${w.name} is not a melee weapon: this step trains ${list(trains.map(cap))} with melee.` };
  }
  const speed = w.piece.speed ? `, a hit every ${(w.piece.speed * 0.6).toFixed(1)} s` : '';
  return { ok: true, text: `${w.name}: suitable for training ${list(trains.map(cap))}${speed}.` };
}

function cap(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}

function armourCheck(gear: GearState | null, e: CombatEstimate): CombatReadiness['armour'] {
  if (!gear?.equipment) return { empty: [], text: 'Worn armour has not been read yet.' };
  const eq = equippedBySlot(gear, gearData);
  const twoHanded = Boolean(eq.weapon?.piece?.twoHanded);
  const empty = ARMOUR.filter((s) => !eq[s] && !(s === 'shield' && twoHanded));
  const worn = ARMOUR.map((s) => eq[s]?.name).filter((n): n is string => Boolean(n));
  const hit = `${foeLabel(e.foe)} hits up to ${e.foe.maxHit}`;
  if (!empty.length) return { empty, text: `Armour: ${list(worn)}. ${hit}; the food estimate counts this armour.` };
  return {
    empty: empty.map((s) => ARMOUR_WORD[s]),
    text: `No ${list(empty.map((s) => ARMOUR_WORD[s]))} worn: you take more damage than you need to. ${hit}; the food estimate counts what you wear now.`,
  };
}

function foodCheck(v: CombatPlanView, bankSeen: boolean): CombatFood {
  const trip = v.nextTrip;
  const carried = v.owned ? v.owned.carriedEq : null;
  const bank = v.owned && bankSeen && v.owned.bankComplete ? v.owned.bankEq : null;
  const short = carried === null ? trip : Math.max(0, trip - carried);
  const unnote = Math.min(short, v.owned?.notedEq ?? 0);
  const fromBank = Math.min(short - unnote, bankSeen ? v.owned?.bankEq ?? 0 : 0);
  const toBuy = short === unnote + fromBank ? 0 : bank === null ? null : short - unnote - fromBank;
  const f = v.food;
  let text: string;
  if (trip <= 0) text = `The estimate needs no ${f} for a trip: your health comes back faster than they hit. Carry a few anyway for bad luck and the walk.`;
  else if (carried === null) text = `Carry ${trip} ${f} (or food that heals as much) for the next trip. The bag is counted when the game is linked.`;
  else if (short === 0) text = `${carried} ${f} by healing with you: enough for the next trip of ${trip}.`;
  else if (unnote > 0) text = `Bank: unnote ${unnote} ${f} by healing before fighting${fromBank > 0 ? `; withdraw ${fromBank} more` : ''}${toBuy ? `; buy about ${toBuy} more` : toBuy === null ? '; open the bank to check the remaining food' : ''}. Banknotes cannot be eaten.`;
  else if (toBuy === 0) text = `Bank: withdraw ${fromBank} ${f} (or food that heals as much) for the next trip of ${trip}.`;
  else if (bank === null) text = fromBank > 0
    ? `Bank: withdraw ${fromBank} ${f} by healing; check the remaining food before buying more.`
    : `Carry ${trip} ${f} for the next trip; you have ${carried} with you. Open the bank to check the remaining food quantities.`;
  else if (fromBank > 0) text = `Bank: withdraw ${fromBank} ${f}, then buy about ${toBuy} more for the next trip of ${trip}.`;
  else text = `Buy about ${toBuy} ${f} (or food that heals as much) for the next trip of ${trip}: you have ${carried} with you and none in the bank.`;
  return { name: f, trip, carried, bank, short, fromBank, toBuy, unnote, text };
}

/**
 * The version that suits this kit. The estimate already picks the one with the least food among the near-fastest; here it is said in words and
 * checked against the food the player owns: when only the other version fits what is owned, that one is suggested instead of a purchase.
 */
function variantText(v: CombatPlanView): string | null {
  const others = v.variants.filter((e) => e !== v.primary);
  if (!others.length) return null;
  const f = v.food;
  // A trip is capped by the bag (26 pieces for both Minotaurs at Defence 1), so the versions differ in the whole goal: its food and its time.
  const detail = (e: CombatEstimate) => `${e.kills} kills, about ${Math.round(e.food.mid)} ${f} in all, ${minutesText(e.totalMinutes)}`;
  const owned = v.owned?.equivalent ?? null;
  const fits = owned !== null && owned < v.primary.food.high
    ? others.filter((e) => e.food.high <= owned).sort((a, b) => a.totalMinutes.mid - b.totalMinutes.mid)[0] : undefined;
  if (fits) {
    return `With the food you own (${owned} ${f} by healing), ${foeLabel(fits.foe)} fits without buying more: ${detail(fits)}. ${foeLabel(v.primary.foe)}: ${detail(v.primary)}.`;
  }
  return `${foeLabel(v.primary.foe)} suits your current kit best: ${detail(v.primary)}. ${others.map((e) => `${foeLabel(e.foe)}: ${detail(e)}`).join('. ')}.`;
}

export function combatReadiness(
  step: Pick<Step, 'pacing'>, view: CombatPlanView | null, gear: GearState | null, bankSeen: boolean,
): CombatReadiness | null {
  if (!view) return null;
  const e = view.primary;
  const trains: string[] = e.phases.map((p) => p.skill as string).filter((s, i, a) => a.indexOf(s) === i);
  if (!trains.length && step.pacing) trains.push(step.pacing.skill);
  const weapon = weaponCheck(gear, trains);
  const armour = armourCheck(gear, e);
  const food = foodCheck(view, bankSeen);
  const cautions: string[] = [];
  if (weapon.ok === false) cautions.push(weapon.text);
  if (armour.empty.length) cautions.push(`Your armour leaves ${foeLabel(e.foe)} riskier: no ${list(armour.empty)} worn.`);
  if (e.basis === 'basic') cautions.push('Some worn gear is unknown to the app: the food is a rough estimate.');
  if (view.owned?.reserved.length) cautions.push(`Kept for quests, not counted as food: ${view.owned.reserved.join(', ')}.`);
  return { variant: variantText(view), foe: foeLabel(e.foe), weapon, armour, food, cautions };
}

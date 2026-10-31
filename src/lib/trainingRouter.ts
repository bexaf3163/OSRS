import { nameKey } from './checklist';
// "What to train with": shared selection by level, goal, mode, stock, equipment, budget and preference.
// It returns the current method and phased path; catalogue entries live in src/data/trainingMethods.json.
//
// The rules everything rests on:
//  — only what is open is chosen: the level fits, the mode (F2P/Members) fits, the quest is done. What is missing
//    in items is named ("a pickaxe is needed", "feathers are needed"), but the method stays — it is preparation, not a ban;
//  — "unknown" is not "no": an item that cannot be checked does not remove a method from the choice;
//  — measured, modelled and reference rates are distinct; estimates are not promises.
//    Supported action-XP and remaining-work calculations use the shared models, not a second UI formula.

import type { GameMode, Progress, Step } from '../types';
import methodsJson from '../data/trainingMethods.json';
import toolProgressionJson from '../data/toolProgression.json';
import { toolUse } from './toolTiers';
import { evaluate, itemRequirement, type ReqState, type Requirement } from './requirements';
import { coinsOf, heldExact, levelOf, questOf, type PlayerState } from './playerState';
import { isClosed } from './next-step';
import { xpForLevel } from './xp';
import type { MethodPriority, PlayStyle } from './playStyle';
import { rangedEquipment, rangedNeeds, RANGED_WATCH } from './rangedLoadout';
import { SPELLS, STAFFS, strikeRecipe, superheatNeeds } from './magicPlan';
import { STYLE_GEAR } from './styleGear';
import { PROCESSING } from './processingRates';
import { adviseGear, canWear, gearData, gearPieceByName, stepFoes, type Levels } from '../services/gearAdvisor';
import { methodRate, rateKeyOf, type RateSpot, type ModelRate } from './methodRates';
import { combatUpgrades, rangedGoalNeeds } from './combatRates';
import type { PriceView } from './funding/quotes';
import { coinsPerMinute, coinTimeShare, earningsOrder } from './lootValue';
import type { TradeRestriction } from './tradeRestriction';
import { requirementCost } from './funding/need';
import { allocateMaterialStock } from './materialStock';
import { actionsForQuantity, quantityForActions } from './consumption';
import type { HeldUnits } from './doses';
import { processingGoalNeeds, mergeGoalNeeds } from './processingGoal';
import { isReusable } from './shopping';
import { FOODS, heldFood } from './foodAdvice';

export type Effort = 'afk' | 'low' | 'medium' | 'high';
export type MethodCost = 'free' | 'profit' | 'cost';
export type Risk = 'none' | 'low' | 'high';
export type { PlayStyle };

export type MethodNeed =
  | { type: 'item'; name: string; count?: number; anyOf?: string[]; equip?: boolean; refill?: number }
  /** Any axe / pickaxe of at least the suitable tier — taken from toolProgression.json. */
  | { type: 'tool'; skill: 'woodcutting' | 'mining' }
  | { type: 'quest'; quest: string }
  | { type: 'skill'; skill: string; min: number };

export interface TrainingMethod {
  id: string;
  /** The skills the method trains (combat — all three). */
  skills: string[];
  from: number;
  /** Suggested training bracket; unlike from, this does not invent a game unlock requirement. */
  suggestedFrom?: number;
  /** Starter-only recommendation ends at to; older efficient methods otherwise remain valid. */
  introductory?: boolean;
  /** Up to which level (exclusive) the method is the best; null — to the end. */
  to: number | null;
  name: string;
  members: boolean;
  needs: MethodNeed[];
  kit?: 'f2p-bow' | 'superheat-iron' | 'strike-spell';
  /** Visible manual alternative; never an automatic default until this setup is modelled/verified. */
  manualSetup?: string;
  /** XP per hour per the wiki: [from, to] — a guide; for a combat method the model's figure for this player when it has one (rateSource). */
  xph: [number, number] | null;
  /** model - xph is the model's for this player's levels and gear (methodRates.ts: the combat or the gathering engine), not the wiki's guide. */
  rateSource?: 'model';
  /** Physical tool/recipe/loadout used by the rate, for useful progression milestones. */
  rateBasis?: string;
  selectedTool?: string;
  /** Initial processing batch; subsequent replenishment is not guaranteed. */
  batchActions?: number;
  consumables?: ModelRate['consumables'];
  /** The spot the gathering engine picked among the method's candidates, and whether a full bag is banked or dropped there. */
  spot?: RateSpot;
  /** One safety line from the model: aggressive NPCs at the picked spot. */
  rateWarning?: string;
  /** What the model's cost is spent on: "feathers"; absent - arrows, or runes for Magic. */
  costName?: string;
  /** Coins an hour the model's method uses up (arrows, runes) at exchange prices; null - not known. */
  costPerHour?: number | null;
  /** Coins an hour the model's method banks from its drop when that pays for its time, and the drop. */
  lootPerHour?: number;
  lootName?: string;
  /** Better tools the player could buy, priced, with the rate each would give (the gathering engine). */
  upgrades?: ModelRate['upgrades'];
  /** XP per single action — the game's exact value. */
  xpa: number | null;
  /** The word forms "log|logs" for "how many more". */
  act: string | null;
  effort: Effort;
  cost: MethodCost;
  risk: Risk;
  where: string;
  /** The key of the place in the place dictionary (majorLocations.json) — for the in-game arrow; none — words only. */
  place?: string;
  /** Verified in-game scenery names for this method only; no future-resource highlights. */
  objectNames?: string[];
  npcNames?: string[];
  note?: string;
  url: string;
  /** A quest with a one-time XP reward: it does not become the "best method", it is shown separately. */
  kind: 'method' | 'quest';
  xpTotal: number | null;
  /** Existing full quest guide for this declared one-time checkpoint reward. */
  questGuide?: { name: string; stepId: string };
}

interface Raw {
  id: string; skill: string | string[]; from: number; suggestedFrom?: number; introductory?: boolean; to: number | null; name: string; members: boolean;
  needs?: MethodNeed[]; kit?: TrainingMethod['kit']; manualSetup?: string; xph?: [number, number]; xpa?: number; act?: string; effort: Effort; cost: MethodCost; risk: Risk;
  where: string; place?: string; objectNames?: string[]; npcNames?: string[]; note?: string; url: string; kind?: 'method' | 'quest'; xpTotal?: number; questGuide?: TrainingMethod['questGuide'];
}

export const trainingMethods: TrainingMethod[] = (methodsJson as unknown as { methods: Raw[] }).methods.map((m) => ({
  id: m.id,
  skills: Array.isArray(m.skill) ? m.skill : [m.skill],
  from: m.from, to: m.to ?? null, name: m.name, members: m.members,
  needs: m.needs ?? [], xph: m.xph ?? null, xpa: m.xpa ?? null, act: m.act ?? null,
  effort: m.effort, cost: m.cost, risk: m.risk, where: m.where, ...(m.place ? { place: m.place } : {}), ...(m.note ? { note: m.note } : {}), url: m.url,
  kind: m.kind ?? 'method', xpTotal: m.xpTotal ?? null,
  ...(m.questGuide ? { questGuide: m.questGuide } : {}),
  ...(m.objectNames ? { objectNames: m.objectNames } : {}),
  ...(m.npcNames ? { npcNames: m.npcNames } : {}),
  ...(m.introductory ? { introductory: true } : {}),
  ...(m.suggestedFrom !== undefined ? { suggestedFrom: m.suggestedFrom } : {}),
  ...(m.kit ? { kit: m.kit } : {}),
  ...(m.manualSetup ? { manualSetup: m.manualSetup } : {}),
}));

interface Tier { tier: string; levelReq: number }
const tools = toolProgressionJson as unknown as Record<'woodcutting' | 'mining', Tier[]>;

// ---------------------------------------------------------------------------
// The method's requirements

export interface NeedStatus {
  kind: MethodNeed['type'];
  label: string;
  state: ReqState;
  detail: string;
}

/** The same declarative requirement drives readiness and the optional-purchase kit reserve. */
function methodRequirement(n: MethodNeed, state: PlayerState): Requirement {
  if (n.type === 'skill' || n.type === 'quest') return n;
  if (n.type === 'tool') {
    const lv = levelOf(state, n.skill);
    return { type: 'alternative', requiredCount: 1, alternatives: tools[n.skill].filter((t) => lv === undefined || t.levelReq <= lv).map((t) => ({ name: t.tier })) };
  }
  return itemRequirement(n);
}

function needStatus(n: MethodNeed, state: PlayerState, allocated?: HeldUnits): NeedStatus {
  const requirement: Requirement = allocated && n.type === 'item'
    ? { type: 'item', name: n.name, count: n.count ?? 1 } : methodRequirement(n, state);
  const r = evaluate(requirement, state, allocated);
  const label = n.type === 'skill' ? `${n.skill.charAt(0).toUpperCase()}${n.skill.slice(1)} ${n.min}`
    : n.type === 'quest' ? n.quest
    : n.type === 'tool' ? n.skill === 'woodcutting' ? 'Axe' : 'Pickaxe'
    : `${n.name}${(n.count ?? 1) > 1 ? ` ×${n.count}` : ''}`;
  return { kind: n.type, label, state: r.state, detail: r.detail };
}

export type MethodStatus = 'READY' | 'PREP' | 'LOCKED';

export interface MethodView {
  method: TrainingMethod;
  status: MethodStatus;
  /** One phrase for this player (rate, coins, what to get first): set by adviseTraining for every method it shows, one formatter for all. */
  reason?: string;
  /** What is missing (items, a tool) or what closes the method (a quest, a skill level). */
  missing: NeedStatus[];
  /** What cannot be checked: not "no" but "I don't know". */
  unchecked: NeedStatus[];
  /** Confirmed missing next-trip kit cost above known available coins; unknown stock/prices never imply a deficit. */
  fundingShortfall?: number;
  /** Current kit is covered or its missing purchases are confirmed affordable. Unknown prices/cash are not funding. */
  fundingReady?: boolean;
  /** With no cash, an unpriced processing batch needs verification before replacing usable supplies. */
  needsFundingCheck?: boolean;
}

export function viewMethod(m: TrainingMethod, state: PlayerState, prices?: PriceView | null): MethodView {
  if (m.kit === 'strike-spell' && m.npcNames?.length) m = { ...m, name: `${strikeRecipe(state).spell.name} on ${m.npcNames.join(' / ')}` };
  const declared = methodNeeds(m, state, prices);
  const materials = allocateMaterialStock(state, declared.flatMap((n, index) => n.type === 'item'
    ? [{ key: `method:${index}`, nameEn: n.name, count: n.count ?? 1, anyOf: n.anyOf, equip: n.equip }] : []));
  const needs = declared.map((n, index) => needStatus(n, state, materials.get(`method:${index}`)));
  if (m.manualSetup) needs.push({ kind: 'item', label: m.manualSetup, state: 'UNKNOWN', detail: 'Manual setup has not been verified.' });
  if (m.kit === 'f2p-bow' && state.mode !== 'f2p') needs.push({ kind: 'item', label: 'Members ranged loadout', state: 'UNKNOWN', detail: 'This starter kit models ordinary F2P bows only; check your Members weapon and ammunition separately.' });
  const locked = needs.filter((n) => (n.kind === 'quest' || n.kind === 'skill') && n.state === 'MISSING');
  const prep = needs.filter((n) => (n.kind === 'item' || n.kind === 'tool') && (n.state === 'MISSING' || n.state === 'PARTIAL' || n.state === 'BANK'));
  const unchecked = needs.filter((n) => n.state === 'UNKNOWN');
  const cash = coinsOf(state).total;
  // Reuse the allocated readiness result; unpriced forecasts do not need a second ownership pass.
  const covered = needs.every(n => (n.kind !== 'item' && n.kind !== 'tool') || n.state === 'OK' || n.state === 'BANK');
  const kit = covered ? 0 : cash !== null && prices ? requirementCost(declared.map(n => methodRequirement(n, state)), state, prices) : null;
  const fundingReady = kit === 0 || (kit !== null && cash !== null && kit <= cash);
  const fundingShortfall = cash !== null && kit !== null && kit > cash ? Math.ceil(kit - cash) : 0;
  return { method: m, status: locked.length ? 'LOCKED' : prep.length || m.manualSetup ? 'PREP' : 'READY', missing: [...locked, ...prep], unchecked, fundingReady, ...(m.consumables?.length && cash === 0 && kit === null ? { needsFundingCheck: true } : {}), ...(fundingShortfall ? { fundingShortfall } : {}) };
}

export function methodNeeds(m: TrainingMethod, state: PlayerState, prices?: PriceView | null): MethodNeed[] {
  // A model-resolved recipe also carries its actual batch size and recovery food. Do not replace it with a generic starter kit.
  if (m.rateSource === 'model' && (m.kit === 'strike-spell' || m.kit === 'superheat-iron')) return m.needs;
  if (m.kit === 'strike-spell') return strikeRecipe(state).needs;
  if (m.kit === 'superheat-iron') return superheatNeeds(state);
  // Stage 6 is F2P-only. Do not demand a weaker F2P bow from Members using an unmodelled weapon.
  if (m.kit === 'f2p-bow' && state.mode !== 'f2p') return m.needs.filter(n => n.type !== 'item' || !RANGED_WATCH.includes(n.name));
  return m.kit === 'f2p-bow' && m.kind === 'method'
    ? [...m.needs.filter(n => n.type !== 'item' || !RANGED_WATCH.includes(n.name)), ...rangedNeeds(state, prices)] : m.needs;
}

/** A worthwhile gathering upgrade uses the same preparation pipeline as the rest of the selected kit. */
export function preparationNeeds(advice: Pick<TrainingAdvice, 'best' | 'upgrade'>, state: PlayerState, prices?: PriceView | null): MethodNeed[] {
  if (!advice.best) return [];
  const method = advice.best.method;
  let needs = advice.upgrade?.needs ?? methodNeeds(method, state, prices);
  const upgradePiece = advice.upgrade?.tool ? gearPieceByName(advice.upgrade.tool) : null;
  if (method.kit === 'strike-spell' && upgradePiece?.slot === 'weapon' && !advice.upgrade?.needs) {
    const supplies = new Set([
      ...SPELLS.filter(spell => spell.id.endsWith('-strike')).flatMap(spell => Object.keys(spell.runes).map(element => `${element} rune`)),
      ...Object.values(STAFFS).map(staff => nameKey(staff.name)),
    ]);
    const isSupply = (need: MethodNeed) => need.type === 'item' && supplies.has(nameKey(need.name));
    // Keep access items, food and gates; only the evaluated staff's physical casting supplies change.
    needs = [...needs.filter(need => !isSupply(need)), ...strikeRecipe(state, upgradePiece.name).needs.filter(isSupply)];
  }
  // Finish a usable partial processing batch; do not send the player to the bank after every action.
  if (method.consumables?.length) {
    const lines = needs.flatMap((n, index) => n.type === 'item' && !n.equip ? [{ key: String(index), nameEn: n.name, count: n.count ?? 1, anyOf: n.anyOf }] : []);
    const stock = allocateMaterialStock(state, lines);
    const inputs = method.consumables.map(input => {
      const index = needs.findIndex(n => n.type === 'item' && nameKey(n.name) === nameKey(input.name));
      const key = String(index);
      const bag = index < 0 ? null : stock.has(key) ? stock.get(key)!.bag : heldExact(state, input.name).bag;
      return { ...input, index, actions: bag === null ? 0 : actionsForQuantity(input, bag) };
    });
    const actions = Math.min(...inputs.map(input => input.actions));
    if (actions > 0) needs = needs.map((n, index) => {
      const input = inputs.find(input => input.index === index);
      return n.type === 'item' && input ? { ...n, count: Math.min(n.count ?? 1, quantityForActions(input, actions)) } : n;
    });
  }
  // A low-watermark/refill policy for trainer food, using the canonical healing-equivalent stock allocator.
  if (method.npcNames?.length) needs = needs.map(n => {
    if (n.type !== 'item' || n.equip) return n;
    const food = FOODS.find(food => food.name === n.name);
    if (!food) return n;
    const target = n.refill ?? n.count ?? 1;
    const carried = heldFood(state, { nameEn: n.name, heals: food.heals, anyOf: n.anyOf }, undefined, levelOf(state, 'hitpoints')).bag;
    return { ...n, count: carried !== null && carried >= Math.max(1, Math.floor(target / 5)) ? Math.min(target, Math.floor(carried)) : target };
  });
  const melee = method.skills.some(skill => ['attack', 'strength', 'defence'].includes(skill));
  // Free usable improvements come from the Gear advisor for this trainer, never a later quest's opponent.
  if (melee && state.equipmentItems && ['attack', 'strength', 'defence'].every(skill => levelOf(state, skill) !== undefined)) {
    const foes = stepFoes({ foes: method.npcNames ?? [] } as Step);
    if (foes.length) {
      const levels = Object.fromEntries(Object.entries(state.levels).flatMap(([skill, value]) => value.known ? [[skill, value.value]] : []));
      const wear = adviseGear({ levels, mode: state.mode, owned: state.owned,
        gear: { equipment: state.equipmentItems.map(item => ({ ...item, id: gearPieceByName(item.name)?.id ?? 0 })), inventory: null,
          coins: state.coins.bag.known ? state.coins.bag.value : null, bankCoins: state.coins.bank.known ? state.coins.bank.value : null },
        foes, questsDone: state.quests.known ? new Set(state.quests.value) : undefined, geQuotes: new Map(), reserveUnknown: true,
      }).actions.filter(action => action.how === 'wear');
      const replaced = new Set(wear.map(action => action.slot));
      const weapon = wear.find(action => action.slot === 'weapon')?.item ?? gearPieceByName(state.equipment.weapon ?? '');
      if (weapon?.twoHanded) replaced.add('shield');
      needs = [...needs.filter(n => {
        const piece = n.type === 'item' && n.equip ? gearPieceByName(n.name) : null;
        return !piece || !replaced.has(piece.slot);
      }),
        ...wear.filter(action => action.slot !== 'shield' || !weapon?.twoHanded).map(action => ({ type: 'item' as const, name: action.item.name, count: 1, equip: true }))];
    }
  }
  const tool = advice.upgrade?.tool;
  const piece = melee || method.kit === 'strike-spell' || method.kit === 'f2p-bow' ? upgradePiece : null;
  if (piece) return [...needs.filter(n => n.type !== 'item' || !n.equip || ![piece.slot, ...(piece.slot === 'weapon' && piece.twoHanded ? ['shield'] : [])].includes(gearPieceByName(n.name)?.slot ?? '')),
    { type: 'item', name: piece.name, count: 1, equip: true }];
  return needs.map(n => {
    const selected = tool ?? method.selectedTool;
    return n.type === 'tool' && selected && toolUse(selected)?.skill === n.skill
      ? { type: 'item', name: selected, count: 1 } : n;
  });
}

// ---------------------------------------------------------------------------
// The choice

const EFFORT_RANK: Record<Effort, number> = { afk: 0, low: 1, medium: 2, high: 3 };
const RISK_RANK: Record<Risk, number> = { none: 0, low: 1, high: 2 };
const COST_RANK: Record<MethodCost, number> = { profit: 0, free: 0, cost: 1 };
const STATUS_RANK: Record<MethodStatus, number> = { READY: 0, PREP: 1, LOCKED: 2 };

/** For ordering we take the lower speed bound: the wiki's upper one often needs special tricks (ticks, inventory). */
const rateLow = (m: TrainingMethod): number | null => (m.xph ? m.xph[0] : null);

/** How much of its listed speed a method keeps in practice: attention it needs, materials it costs and risk it carries (2.69, "balanced"). */
const EFFORT_FACTOR: Record<Effort, number> = { afk: 1, low: 1, medium: 0.9, high: 0.6 };
const COST_FACTOR: Record<MethodCost, number> = { profit: 1, free: 1, cost: 0.85 };
const RISK_FACTOR: Record<Risk, number> = { none: 1, low: 0.95, high: 0.5 };
/** Hours a method whose items are missing loses to getting them: the trip to a shop or the exchange and the wait for the offers. */
export const SETUP_HOURS = 0.25;
/**
 * Hours a method loses when everything it lacks is in the bank: a bank stop, shorter than buying (a model assumption, the acquisition detour of the
 * hardening brief), so supplies the player owns are used before new purchases when the speeds are close.
 */
export const BANK_SETUP_HOURS = 0.1;
const setupHours = (v: MethodView): number =>
  v.status !== 'PREP' ? 0 : v.missing.every((n) => n.state === 'BANK') ? BANK_SETUP_HOURS : SETUP_HOURS;
/** A later method replaces the one in hand on the path only when it is this much better in practice. */
export const SWITCH_GAIN = 1.1;

/** The practical XP per hour of a method: the wiki's lower bound, less what attention, materials and risk take from it. null - no speed listed. */
export function practicalRate(m: TrainingMethod): number | null {
  const r = rateLow(m);
  return r === null ? null : r * EFFORT_FACTOR[m.effort] * COST_FACTOR[m.cost] * RISK_FACTOR[m.risk];
}

/**
 * The order of methods. Balanced (the default since 2.69): the practical hours to the goal, a method whose items are missing paying its setup; locked
 * ones last. Relaxed (the old "Calm"): first the ready ones, without risk, with fewer clicks, not at a loss — speed only on a tie. Fastest (the old
 * "Efficient"): first the ready ones, then by speed (for methods without a speed — by entry level).
 */
function compare(priority: MethodPriority, xpLeft?: number, level?: number, coinRate: number | null = null) {
  return (a: MethodView, b: MethodView): number => {
    if (Boolean(a.fundingShortfall) !== Boolean(b.fundingShortfall)) return Number(Boolean(a.fundingShortfall)) - Number(Boolean(b.fundingShortfall));
    if (Boolean(a.method.manualSetup) !== Boolean(b.method.manualSetup)) return Number(Boolean(a.method.manualSetup)) - Number(Boolean(b.method.manualSetup));
    const uncheckedEntry = (v: MethodView) => v.unchecked.some(n => n.kind === 'skill' || n.kind === 'quest');
    if (uncheckedEntry(a) !== uncheckedEntry(b)) return Number(uncheckedEntry(a)) - Number(uncheckedEntry(b));
    // A player with no cash can finish a usable batch instead of assuming an unpriced processing recipe is funded.
    // A funded purchase still competes by time/profit; ordinary tool/spot investment keeps its existing setup comparison.
    if (priority === 'balanced' || priority === 'profit') {
      if (a.fundingReady && b.needsFundingCheck) return -1;
      if (b.fundingReady && a.needsFundingCheck) return 1;
    }
    // A method the level has outgrown (cows at Attack 45, seagulls at Ranged 60) does not beat a ready method made for this level just because the
    // newer one's supplies are unread or it is riskier. Where speed ranks (balanced, fastest), known speeds still decide; an outgrown method with
    // its supplies at hand still beats a new one that needs buying first.
    const outgrown = (v: MethodView) => level !== undefined && v.method.to !== null && level >= v.method.to;
    const bySpeed = priority !== 'relaxed' && rateLow(a.method) !== null && rateLow(b.method) !== null;
    if (outgrown(a) !== outgrown(b) && (outgrown(a) ? b : a).status === 'READY' && !bySpeed) {
      return Number(outgrown(a)) - Number(outgrown(b));
    }
    // Unchecked supplies must not beat a confirmed preparation step merely by being labelled READY.
    // Keep them available and disclose their uncertainty; do not invent missing quantities.
    // A method should not drop back to an earlier one merely because owned supplies need withdrawal (first seen with the ranged kit and its food).
    // Missing/unread supplies still lose to a supplied safer method; this only covers confirmed bank/wear preparation.
    // Everything missing is confirmed in the bank (a bank stop, BANK_SETUP_HOURS): ranked with the ready ones, for every method, not one kit.
    const banked = (v: MethodView) => v.status === 'PREP' && v.missing.length > 0 && v.missing.every(n => n.state === 'BANK');
    const rank = (v: MethodView) => (banked(v) ? 0 : STATUS_RANK[v.status]) + (v.status === 'READY' && v.unchecked.length ? 1 : 0)
      + (v.unchecked.some(n => n.kind === 'skill' || n.kind === 'quest') ? 2 : 0);
    const s = rank(a) - rank(b);
    const ra = rateLow(a.method);
    const rb = rateLow(b.method);
    // Without comparable rates, retain the authored bracket as a preference, never as an availability ban.
    const suggested = (m: TrainingMethod) => level === undefined || ((m.suggestedFrom ?? m.from) <= level && (m.to === null || level < m.to));
    const byBracket = Number(suggested(b.method)) - Number(suggested(a.method));
    const byRate = ((ra === null || rb === null) ? byBracket : 0) || (rb ?? -1) - (ra ?? -1);
    const preferredEntry = (m: TrainingMethod) => m.suggestedFrom !== undefined && level !== undefined && m.suggestedFrom <= level ? m.suggestedFrom : m.from;
    const byEntry = preferredEntry(b.method) - preferredEntry(a.method);
    if (priority === 'profit') {
      if (s) return s;
      if ((a.method.risk === 'high') !== (b.method.risk === 'high')) return Number(a.method.risk === 'high') - Number(b.method.risk === 'high');
      const earnings = earningsOrder(netCoinsPerHour(a.method), netCoinsPerHour(b.method));
      if (earnings) return earnings;
    }
    if (priority === 'balanced' || priority === 'profit') {
      if (a.status === 'LOCKED' || b.status === 'LOCKED') { if (s) return s; }
      const pa = practicalRate(a.method);
      const pb = practicalRate(b.method);
      if (pa && pb && xpLeft && xpLeft > 0) {
        // The hours to the goal, less what the banked drops are worth in hours (lootValue.ts: the same rule as the fight plans).
        const hours = (v: MethodView, p: number) => xpLeft / p + setupHours(v);
        const coinsA = netCoinsPerHour(a.method);
        const coinsB = netCoinsPerHour(b.method);
        // Coins on both sides or on neither: a method whose cost is not known is never compared as free.
        const worth = (v: MethodView, h: number) => (coinsA === null || coinsB === null ? 0 : h * coinTimeShare(v === a ? coinsA : coinsB, coinRate));
        const ra0 = hours(a, pa);
        const rb0 = hours(b, pb);
        const ha = ra0 - worth(a, ra0);
        const hb = rb0 - worth(b, rb0);
        if (Math.abs(ha - hb) > Math.min(ra0, rb0) * 0.05) return ha - hb;
      } else {
        if (s) return s;
        // Without comparable pace evidence, do not buy a new recipe merely because its suggested bracket is newer.
        const supplied = (v: MethodView) => ![...v.missing, ...v.unchecked].some(n =>
          (n.kind === 'item' || n.kind === 'tool') && n.state !== 'BANK' && n.state !== 'OK');
        if ((pa === null || pb === null) && supplied(a) !== supplied(b)) return Number(supplied(b)) - Number(supplied(a));
        if ((pa === null || pb === null) && byBracket) return byBracket;
        if (pa === null && pb === null && a.method.kit === 'f2p-bow' && b.method.kit === 'f2p-bow' && byEntry) return byEntry;
        if ((pa ?? -1) !== (pb ?? -1)) return (pb ?? -1) - (pa ?? -1);
      }
      // Within a few percent the method made for this level wins (the wiki's bracket), then the easier and cheaper one.
      return s || byBracket || EFFORT_RANK[a.method.effort] - EFFORT_RANK[b.method.effort] || COST_RANK[a.method.cost] - COST_RANK[b.method.cost] || byRate || byEntry;
    }
    if (s) return s;
    if (priority === 'relaxed') {
      return RISK_RANK[a.method.risk] - RISK_RANK[b.method.risk]
        || EFFORT_RANK[a.method.effort] - EFFORT_RANK[b.method.effort]
        || COST_RANK[a.method.cost] - COST_RANK[b.method.cost]
        || byRate || byEntry;
    }
    return byRate || byEntry || EFFORT_RANK[a.method.effort] - EFFORT_RANK[b.method.effort] || COST_RANK[a.method.cost] - COST_RANK[b.method.cost];
  };
}

export const methodsFor = (skill: string, methods: readonly TrainingMethod[] = trainingMethods): TrainingMethod[] =>
  methods.filter((m) => m.skills.includes(skill));

const availableAt = (m: TrainingMethod, level: number, mode: GameMode): boolean =>
  m.kind === 'method' && m.from <= level && (mode === 'members' || !m.members);

const recommendedAt = (m: TrainingMethod, level: number, mode: GameMode): boolean =>
  availableAt(m, level, mode) && (m.suggestedFrom ?? m.from) <= level && (!m.introductory || m.to === null || level < m.to);

export interface PathLeg {
  method: TrainingMethod;
  fromLevel: number;
  toLevel: number;
  /** Resolved future preparation, not a claim that these supplies are owned or already funded. */
  needs?: MethodNeed[];
  /** Expected processing actions integrated at the existing forecast samples. */
  processingActions?: number;
}

export interface TimeEstimate {
  /** measured — from the player's measurements, model — the combat model for this player, wiki — from the wiki speed (a range, a guide). */
  source: 'measured' | 'model' | 'wiki' | 'forecast';
  minHours: number;
  maxHours: number;
}

/** Offer a declared quest checkpoint through its real guide, never award or infer its XP. */
export function questTrainingStep(advice: TrainingAdvice, state: PlayerState, steps: readonly Step[], progress: Progress): Step | null {
  if (advice.level === null || advice.level >= advice.target || advice.xpLeft === null) return null;
  for (const method of advice.quests) {
    const guide = method.questGuide;
    if (!guide || method.kind !== 'quest' || !method.skills.includes(advice.skill) || (method.members && state.mode !== 'members')
      || method.to !== advice.target || !method.xpTotal || method.xpTotal < advice.xpLeft
      || questOf(state, guide.name) === 'DONE' || isClosed(progress, guide.stepId)) continue;
    const step = steps.find(s => s.id === guide.stepId);
    const trigger = step?.inGame?.completionTrigger;
    if (step && trigger?.type === 'QUEST_COMPLETED' && trigger.questName && nameKey(trigger.questName) === nameKey(guide.name)) return step;
  }
  return null;
}

export interface TrainingAdvice {
  skill: string;
  /** null — the level is unknown: there is nothing to advise. */
  level: number | null;
  target: number;
  best: MethodView | null;
  /** Up to three other methods of this level. */
  others: MethodView[];
  /** Quests with an XP reward in this range — separately from the methods. */
  quests: TrainingMethod[];
  /** The path from the level to the goal: which method on which leg. */
  path: PathLeg[];
  /** Conditional whole-goal materials/kit, separate from current-batch readiness. */
  goalNeeds?: MethodNeed[];
  /** Optional bank-stock forecast for the current and next two stages; never carrying readiness. */
  stockNeeds?: MethodNeed[];
  xpLeft: number | null;
  /** How many more actions with the best method to the end of its leg; null — the XP per action is unknown. */
  actionsLeft: number | null;
  /** The end of the actual selected first leg, not the authored method's suggested upper bracket. */
  actionTarget: number | null;
  time: TimeEstimate | null;
  /** One phrase "why this method". */
  reason: string;
  style: PlayStyle;
  /** The better tool worth buying for the XP left (toolUpgrade), when there is one. */
  upgrade?: ToolUpgrade | null;
  /** The method the game follows (input followed), when it is open at this level and is not the pick itself. */
  followed?: MethodView | null;
}

export interface AdviceInput {
  skill: string;
  target: number;
  state: PlayerState;
  mode: GameMode;
  style: PlayStyle;
  /** How methods are chosen; absent - from the style (calm: relaxed, efficient: fastest), as before 2.69. */
  priority?: MethodPriority;
  /** The skill's current XP (if known): otherwise counted from the start of the level. */
  xp?: number | null;
  /** XP per hour from the player's measurements. */
  measuredXph?: number | null;
  methods?: readonly TrainingMethod[];
  /** The method the game follows now (a tracked leveling plan's step, methodOfGuideStep): shown with this player's figures beside the pick. */
  followed?: string | null;
  /** The exchange, for what arrows and runes cost and the drops bring an hour; without it neither is said nor counted. */
  prices?: PriceView | null;
  /** Whether the account may sell yet: a drop it cannot sell is not counted. */
  restriction?: TradeRestriction['state'];
}

// Per method object (a custom list may reuse an id with other figures), then per state, prices and rules.
const rateCache = new WeakMap<TrainingMethod, Map<string, TrainingMethod>>();
/** Each price snapshot by its own identity: two views that share a timestamp but not their prices are never confused. */
const priceIds = new WeakMap<PriceView, number>();
let nextPriceId = 1;
function priceKeyOf(prices: PriceView | null | undefined): string {
  if (!prices) return '-';
  let id = priceIds.get(prices);
  if (id === undefined) priceIds.set(prices, (id = nextPriceId++));
  return String(id);
}
/**
 * The methods of a skill with the combat model's own rate for this player where it has one (combatRates.ts): melee, Ranged and Magic training is then
 * ranked by what it gives this character, not by the wiki's guide for everyone. Other methods stay as they are.
 */
export function personalize(methods: readonly TrainingMethod[], skill: string, state: PlayerState, prices?: PriceView | null, restriction?: TradeRestriction['state'], objective?: MethodPriority): TrainingMethod[] {
  return methods.map((m) => {
    if (!m.skills.includes(skill) || m.kind !== 'method') return m;
    const key = `${m.id}|${skill}|${rateKeyOf(state)}|${priceKeyOf(prices)}|${restriction ?? '-'}|${objective ?? '-'}`;
    const cache = rateCache.get(m) ?? new Map<string, TrainingMethod>();
    if (!rateCache.has(m)) rateCache.set(m, cache);
    const hit = cache.get(key);
    if (hit) return hit;
    const r = methodRate(m, skill, state, { prices, restriction, objective });
    const out: TrainingMethod = r ? {
      ...m, xph: [Math.round(r.xph[0]), Math.round(r.xph[1])], rateSource: 'model', rateBasis: r.basis, ...(r.batchActions !== undefined ? { batchActions: r.batchActions } : {}), ...(r.consumables ? { consumables: r.consumables } : {}), costPerHour: r.costPerHour,
      ...(r.methodName ? { name: r.methodName } : {}),
      ...(r.selectedTool ? { selectedTool: r.selectedTool } : {}),
      ...(r.xpPerAction !== undefined ? { xpa: r.xpPerAction } : {}),
      ...(r.needs ? { needs: [...m.needs.filter((n) => n.type === 'skill' || n.type === 'quest'), ...r.needs.map((n) => {
        if (n.type !== 'item' || r.exactNeeds) return n;
        if (n.equip) return n;
        const authored = m.needs.find((old) => old.type === 'item' && (old.name === n.name || old.anyOf?.includes(n.name) || n.anyOf?.includes(old.name)));
        if (authored?.type !== 'item') return n;
        const anyOf = [...new Set([...(authored.anyOf ?? []), ...(n.anyOf ?? []), n.name])].filter((name) => name !== authored.name);
        return { ...authored, count: n.count, ...(anyOf.length ? { anyOf } : {}) };
      })] } : {}),
      ...(r.lootPerHour ? { lootPerHour: r.lootPerHour, lootName: r.loot } : {}),
      ...(r.costName ? { costName: r.costName } : {}),
      ...(r.warning ? { rateWarning: r.warning } : {}),
      ...(r.upgrades?.length ? { upgrades: r.upgrades } : {}),
      ...(r.spot ? { spot: r.spot, where: r.spot.how === 'bank' && r.spot.bank ? `${r.spot.label} (bank at ${r.spot.bank})` : r.spot.label } : {}),
    } : m;
    if (cache.size > 50) cache.clear();
    cache.set(key, out);
    return out;
  });
}

const fmtK = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

/** Coins an hour a method nets (banked less used up), or null when what it uses up has no known price. */
function netCoinsPerHour(m: TrainingMethod): number | null {
  if (m.costPerHour === null || (m.costPerHour === undefined && m.cost === 'cost')) return null;
  if (m.costPerHour === undefined && m.cost === 'profit' && m.lootPerHour === undefined) return null;
  return (m.lootPerHour ?? 0) - (m.costPerHour ?? 0);
}

/** "≈ 8k–11k XP per hour", "for you" when it is the model's figure for this player. */
const rateText = (m: TrainingMethod) => {
  const r = m.xph!;
  return `${fmtK(r[0]) === fmtK(r[1]) ? `≈ ${fmtK(r[0])}` : `≈ ${fmtK(r[0])}–${fmtK(r[1])}`} XP per hour${m.rateSource === 'model' ? ' for you' : ''}`;
};

/**
 * The catalogue method a leveling-guide step is: the same skill, the same opponent (a combat step's NPC) or object (a tree, a rock), overlapping
 * levels. The roadmap and the engine then name one activity once, so a followed plan is shown with this player's figures. null when none or more
 * than one fits (a fishing spot is not told apart by its NPC).
 */
export function methodOfGuideStep(step: { skill: string; levelRange: readonly [number, number]; location: { npcName?: string; objectName?: string } },
  methods: readonly TrainingMethod[] = trainingMethods): TrainingMethod | null {
  const key = (n: string) => n.trim().toLowerCase();
  const npc = step.location.npcName ? key(step.location.npcName) : null;
  const obj = step.location.objectName ? key(step.location.objectName) : null;
  const hits = methods.filter((m) => m.kind === 'method' && m.skills.includes(step.skill)
    && m.from <= step.levelRange[1] && (m.to === null || m.to > step.levelRange[0])
    && ((npc !== null && (m.npcNames ?? []).some((n) => key(n) === npc)) || (obj !== null && (m.objectNames ?? []).some((o) => key(o) === obj))));
  return hits.length === 1 ? hits[0] : null;
}

export interface ToolUpgrade { tool: string; price: number; hours: number; /** Net consumable savings after the purchase when the benefit is coins instead of meaningful time. */ coinsSaved?: number; /** The player's coins when they are known and fall short of the price. */ short?: number;
  /** Missing next-trip supplies, not the price of an entire future goal. null means stock/prices are unchecked. */ kitCost?: number | null;
  /** Known coins after reserving the kit, when that leaves too little for this optional purchase. */ afterKit?: number;
  /** Physical supplies resolved by the same model that evaluated the proposed equipment. */ needs?: MethodNeed[];
}
/** Hours a better tool must save to the goal to be worth a line. */
const UPGRADE_MIN_HOURS = 1 / 6;
/**
 * The better tool worth buying for the XP left, or null. Fastest: the one that saves the most time (its price is shown; coins do not trade against
 * time). Balanced: the one whose hours saved, valued at the coin baseline (lootValue.coinsPerMinute), beat its price by the most; without prices
 * nothing is weighed. Relaxed: none. Only pass XP assigned to this method; another method need not benefit from the same tool.
 */
export function toolUpgrade(m: TrainingMethod, xpLeft: number, priority: MethodPriority, coinRate: number | null, acquisitionHours = 0): ToolUpgrade | null {
  if (!m.upgrades?.length || !m.xph || xpLeft <= 0 || priority === 'relaxed' || priority === 'profit') return null;
  // personalize rounds displayed rates; compare both sides at that same precision to avoid a false negative saving.
  const mid = (x: readonly [number, number]) => (Math.round(x[0]) + Math.round(x[1])) / 2;
  const now = xpLeft / mid(m.xph);
  let best: ToolUpgrade | null = null;
  let bestScore = -Infinity;
  for (const u of m.upgrades) {
    const trainingSaved = now - xpLeft / mid(u.xph);
    const hours = trainingSaved - Math.max(0, acquisitionHours);
    const baseCost = m.costPerHour === undefined ? (m.cost === 'cost' ? null : 0) : m.costPerHour;
    const upgradeCost = u.costPerHour === undefined ? (baseCost === 0 ? 0 : null) : u.costPerHour;
    const costsKnown = baseCost !== null && upgradeCost !== null;
    const costSaved = (baseCost ?? 0) * now - (upgradeCost ?? 0) * (xpLeft / mid(u.xph));
    const timeBenefit = hours >= UPGRADE_MIN_HOURS;
    const netSaved = costsKnown ? costSaved - u.price : null;
    if (trainingSaved < 0 || (!timeBenefit && !(priority === 'balanced' && netSaved !== null && netSaved > 0))) continue;
    const score = priority === 'fastest' ? hours : costsKnown ? (coinRate ? hours * 60 * coinRate : 0) + costSaved - u.price : -Infinity;
    if (score <= 0 || score <= bestScore) continue;
    bestScore = score;
    best = { tool: u.tool, price: u.price, hours, ...(u.needs ? { needs: u.needs } : {}), ...(!timeBenefit && netSaved !== null ? { coinsSaved: netSaved } : {}) };
  }
  return best;
}

const hoursText = (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : `${h < 10 ? Math.round(h * 10) / 10 : Math.round(h)} h`);

function reasonFor(v: MethodView, priority: MethodPriority, level: number, upgrade: ToolUpgrade | null = null): string {
  const m = v.method;
  const parts: string[] = [];
  if (priority === 'balanced' || priority === 'profit') {
    if (m.xph) parts.push(rateText(m));
    parts.push(m.effort === 'afk' ? 'almost no clicks' : m.effort === 'low' ? 'few clicks' : m.effort === 'medium' ? 'steady clicking' : 'needs full attention');
    if (m.risk !== 'none') parts.push(m.risk === 'high' ? 'risky' : 'small risk');
  } else if (priority === 'relaxed') {
    const quiet = m.effort === 'afk' ? 'almost no clicks' : m.effort === 'low' ? 'few clicks' : m.effort === 'medium' ? 'relaxed pace' : 'needs attention';
    parts.push(m.risk === 'none' ? `no risk, ${quiet}` : `${quiet}, small risk`);
  } else if (m.xph) {
    parts.push(rateText(m));
  } else {
    parts.push('the best method for this level');
  }
  if (m.lootPerHour && m.lootName) parts.push(`${m.lootName} ≈ +${fmtK(Math.round(m.lootPerHour / 100) * 100)} gp per hour`);
  if (priority === 'profit') {
    const net = netCoinsPerHour(m);
    parts.push(net !== null && net > 0 ? `net ≈ ${fmtK(Math.round(net))} gp per hour` : 'no confirmed positive net earnings; balanced fallback');
  }
  if (m.spot?.how === 'drop') parts.push('drop when full');
  if (m.rateWarning) parts.push(m.rateWarning);
  if (m.costPerHour) parts.push(`${m.costName ?? (m.skills.includes('magic') ? 'runes' : 'arrows')} ≈ ${fmtK(Math.round(m.costPerHour / 100) * 100)} gp per hour`);
  else if (m.cost === 'cost') parts.push('material costs');
  else if (m.cost === 'profit') parts.push('can end in profit');
  if (v.fundingShortfall) parts.push(`earn at least ${v.fundingShortfall.toLocaleString('en-US')} gp for the missing next-trip kit first`);
  if (v.status === 'PREP') parts.push(`first: ${v.missing.map((x) => x.label).join(', ')}`);
  if (v.status === 'LOCKED') parts.push(`locked: ${v.missing.map((x) => x.label).join(', ')}`);
  if (level < m.from) parts.push(`from level ${m.from}`);
  if (upgrade) parts.push(`a ${upgrade.tool} (≈ ${fmtK(upgrade.price)} gp${upgrade.short !== undefined ? `; you have ${fmtK(upgrade.short)}` : upgrade.afterKit !== undefined ? `; only ${fmtK(upgrade.afterKit)} gp after the kit` : ''}) saves ≈ ${upgrade.coinsSaved !== undefined ? `${fmtK(Math.round(upgrade.coinsSaved))} gp after its price` : hoursText(upgrade.hours)} on this method${upgrade.kitCost === null ? '; check kit stock and prices before buying' : ''}`);
  return parts.join('; ');
}

/**
 * The best method on each leg of the path to the goal; useful gear/recipe milestones remain separate review stages. Except for "fastest", a new unlock replaces the method in hand
 * only when it is clearly better in practice (SWITCH_GAIN): changing method for a sliver costs a trip and a new setup.
 */
/** Conditional future preparation in a copy: never grant this kit/coins to the live player. */
function forecastRangedEquipment(state: PlayerState, needs: readonly MethodNeed[], prices?: PriceView | null): PlayerState {
  const equipmentNeeds = needs.filter(n => n.type === 'item' && n.equip);
  const cost = requirementCost(equipmentNeeds.map(n => methodRequirement(n, state)), state, prices);
  const cash = coinsOf(state).total;
  const equipmentItems = equipmentNeeds.flatMap(n => n.type === 'item' ? [{ name: n.name,
    count: Math.max(n.count ?? 1, state.equipmentItems?.find(i => nameKey(i.name) === nameKey(n.name))?.count ?? 0) }] : []);
  return { ...state, equipment: rangedEquipment(state.equipment, equipmentNeeds), equipmentItems,
    coins: cash !== null && cost !== null ? {
      bag: { known: true, value: Math.max(0, cash - cost), source: 'profile' }, bank: { known: true, value: 0, source: 'profile' },
    } : { bag: { known: false }, bank: { known: false } },
  };
}

function buildPath(skill: string, level: number, target: number, input: AdviceInput, priority: MethodPriority, first: TrainingMethod | null, raw: readonly TrainingMethod[]): { legs: PathLeg[]; time: TimeEstimate | null } {
  const legs: PathLeg[] = [];
  const milestones = trainingMilestones(skill, raw, input.mode, input.state);
  let ratedAt = level;
  let previousSetup = '';
  let projectedState = input.state;
  let minHours = 0;
  let maxHours = 0;
  let timed = true;
  const sources = new Set<TimeEstimate['source']>();
  for (let lv = level; lv < target; lv++) {
    // The model's rates are for the level the leg starts at (every FORECAST_STEP levels), not today's carried forward: a method unlocked later is
    // then compared on its own model rate, not on the wiki's guide against today's model rates.
    if (lv === level || lv % FORECAST_STEP === 0 || milestones.has(lv)) ratedAt = lv;
    const at = ratedAt;
    const projected = atLevel(projectedState, skill, lv);
    const methods = at === level ? input.methods ?? trainingMethods : personalize(raw, skill, atLevel(projected, skill, at), input.prices, input.restriction, priority);
    // Advance only this skill in a copy; other skill/quest entry proofs must still be satisfied.
    const cands = methodsFor(skill, methods).filter((m) => !m.manualSetup && recommendedAt(m, lv, input.mode)).map((m) => viewMethod(m, projected, input.prices)).filter((v) => v.status !== 'LOCKED');
    // Each level is weighed as the first one is (adviseTraining): the hours from here to the goal, less what the banked drops are worth.
    cands.sort(compare(priority, Math.max(0, xpForLevel(target) - xpForLevel(lv)), lv, coinsPerMinute(input.prices)));
    let pick = (lv === level ? cands.find(c => c.method.id === first?.id)?.method : undefined) ?? cands[0]?.method;
    if (!pick) { timed = false; continue; }
    const last = legs[legs.length - 1];
    if (priority !== 'fastest' && priority !== 'profit' && last && last.method.id !== pick.id && cands.some((c) => c.method.id === last.method.id)) {
      const now = practicalRate(cands.find((c) => c.method.id === last.method.id)!.method);
      const next = practicalRate(pick);
      if (now !== null && next !== null && next < now * SWITCH_GAIN) pick = cands.find((c) => c.method.id === last.method.id)!.method;
    }
    const measured = pick.id === first?.id && (!input.followed || input.followed === pick.id)
      && input.measuredXph !== null && input.measuredXph !== undefined && Number.isFinite(input.measuredXph) && input.measuredXph > 0;
    const rate = measured ? [input.measuredXph!, input.measuredXph!] : pick.xph;
    const xp = Math.max(0, xpForLevel(lv + 1) - Math.max(xpForLevel(lv), input.xp ?? xpForLevel(level)));
    if (!rate || !rate.every((n) => Number.isFinite(n) && n > 0) || rate[1] < rate[0]) timed = false;
    else {
      minHours += xp / rate[1];
      maxHours += xp / rate[0];
      sources.add(measured ? 'measured' : pick.rateSource ?? 'wiki');
    }
    const plannedNeeds = methodNeeds(pick, projected, input.prices);
    const setup = JSON.stringify([pick.rateBasis ?? '', plannedNeeds.map(n => n.type === 'item' && n.equip ? { ...n, count: 1 } : n)]);
    const review = milestones.has(lv);
    const processingActions = pick.consumables && pick.xpa && Number.isFinite(pick.xpa) && pick.xpa > 0 ? xp / pick.xpa : undefined;
    if (last && last.method.id === pick.id && setup === previousSetup && !review) {
      last.toLevel = lv + 1;
      last.processingActions = last.processingActions !== undefined && processingActions !== undefined ? last.processingActions + processingActions : undefined;
    } else legs.push({ method: pick, fromLevel: lv, toLevel: lv + 1, needs: plannedNeeds, ...(processingActions !== undefined ? { processingActions } : {}) });
    previousSetup = setup;
    if (pick.kit === 'f2p-bow') projectedState = forecastRangedEquipment(projected, plannedNeeds, input.prices);
  }
  const source = sources.size === 1 ? [...sources][0] : 'forecast';
  return { legs, time: timed && legs.length > 0 ? { source, minHours, maxHours } : null };
}

/** Re-rate at real declared unlocks as well as the normal five-level sampling interval. */
function trainingMilestones(skill: string, methods: readonly TrainingMethod[], mode: GameMode, state: PlayerState): Set<number> {
  const relevant = methods.filter(m => !m.manualSetup && m.skills.includes(skill) && (mode === 'members' || !m.members));
  const levels = relevant.flatMap(m => [m.from, m.suggestedFrom ?? m.from, m.to ?? 99]);
  if (skill === 'woodcutting' || skill === 'mining') levels.push(...tools[skill].map(t => t.levelReq));
  for (const style of Object.values(STYLE_GEAR).filter((v): v is typeof STYLE_GEAR.ranged => typeof v === 'object')) {
    for (const options of Object.values(style)) for (const o of options) for (const req of o.reqs) if (req.skill === skill) levels.push(req.level);
  }
  const futureGearLevels: Levels = { attack: levelOf(state, 'attack') ?? 1, strength: levelOf(state, 'strength') ?? 1, defence: levelOf(state, 'defence') ?? 1,
    ranged: levelOf(state, 'ranged'), magic: levelOf(state, 'magic'), prayer: levelOf(state, 'prayer'), [skill]: 99 };
  const quests = state.quests.known ? new Set(state.quests.value) : undefined;
  for (const piece of gearData.items) {
    const unlock = piece.req?.[skill as keyof Levels];
    if (unlock !== undefined && !piece.reqUnverified && !(piece.members && mode === 'f2p') && canWear(piece, futureGearLevels, quests)) levels.push(unlock);
  }
  const recipes = new Set(relevant.flatMap(m => PROCESSING.methods[m.id] ?? []));
  for (const r of PROCESSING.recipes) if (recipes.has(r.id) && !(r.members && mode === 'f2p')) {
    levels.push(r.level, ...r.requires?.filter(q => q.skill === skill).map(q => q.level) ?? []);
  }
  if (skill === 'magic') levels.push(...SPELLS.map(s => s.level));
  return new Set(levels.filter(n => Number.isInteger(n) && n >= 1 && n <= 99));
}

/** Future legs of the path are re-rated every this many levels. */
const FORECAST_STEP = 5;
/** The same player at another level of one skill: what the path forecasts with. */
const atLevel = (state: PlayerState, skill: string, value: number): PlayerState =>
  ({ ...state, levels: { ...state.levels, [skill]: { ...(state.levels[skill] ?? { source: 'profile' }), known: true, value } } }) as PlayerState;

/** Reuse the selected phases and model quantities; unsupported consumable forecasts stay absent. */
export function trainingStockNeeds(path: readonly PathLeg[], skill: string, state: PlayerState, xp: number, prices?: PriceView | null, priority: MethodPriority = 'balanced'): MethodNeed[] | undefined {
  const window: PathLeg[] = [];
  const stages = new Set<string>();
  const reusable: Extract<MethodNeed, { type: 'item' }>[] = [];
  for (const leg of path) {
    const projected = atLevel(state, skill, leg.fromLevel);
    const upgrade = toolUpgrade(leg.method, Math.max(0, xpForLevel(leg.toLevel) - Math.max(xp, xpForLevel(leg.fromLevel))), priority, coinsPerMinute(prices));
    const best: MethodView = { method: leg.method, status: 'READY', missing: [], unchecked: [] };
    const kit = preparationNeeds({ best, upgrade }, projected, prices).filter((n): n is Extract<MethodNeed, { type: 'item' }> => n.type === 'item' && isReusable(n.name));
    const key = kit.length ? JSON.stringify(kit.map(n => [n.name, n.anyOf ?? []]).sort()) : leg.method.id;
    if (!stages.has(key) && stages.size >= 3) break;
    stages.add(key);
    window.push(leg);
    reusable.push(...kit);
  }
  if (!window.length) return undefined;
  const start = window[0].fromLevel, end = window[window.length - 1].toLevel;
  const forecast = processingGoalNeeds(window, start, end, xp)
    ?? (skill === 'ranged' ? rangedGoalNeeds(window, state, xp, end, prices) : null);
  return mergeGoalNeeds([], [...(forecast ?? []).filter((n): n is Extract<MethodNeed, { type: 'item' }> => n.type === 'item'), ...reusable]) ?? undefined;
}

export function adviseTraining(input0: AdviceInput): TrainingAdvice {
  const { skill, target, state, mode, style } = input0;
  const objective: MethodPriority = input0.priority ?? (style === 'efficient' ? 'fastest' : 'relaxed');
  const methods = personalize(input0.methods ?? trainingMethods, skill, state, input0.prices, input0.restriction, objective);
  const input = { ...input0, methods };
  const level = levelOf(state, skill) ?? null;
  const empty: TrainingAdvice = { skill, level, target, best: null, others: [], quests: [], path: [], xpLeft: null, actionsLeft: null, actionTarget: null, time: null, reason: '', style };
  if (level === null) return { ...empty, reason: 'Level unknown: log in to the game with RuneLite or enter it on the skill page.' };
  if (level >= target) return { ...empty, reason: 'The goal is already reached.' };

  const priority = objective;
  const xpNow0 = input.xp ?? xpForLevel(level);
  const coinRate = coinsPerMinute(input.prices);
  const cmp = compare(priority, Math.max(0, xpForLevel(target) - xpNow0), level, coinRate);
  const views = methodsFor(skill, methods).filter((m) => recommendedAt(m, level, mode) || (m.id === input0.followed && availableAt(m, level, mode))).map((m) => viewMethod(m, state, input.prices)).sort(cmp);
  const pickV = views.find((v) => !v.method.manualSetup && v.status !== 'LOCKED') ?? null;
  const said = (v: MethodView): MethodView => ({ ...v, reason: reasonFor(v, priority, level) });
  const followedV = input0.followed ? views.find((v) => v.method.id === input0.followed && v !== pickV) ?? null : null;
  const others = views.filter((v) => v !== pickV && v !== followedV).slice(0, 3).map(said);
  const best = pickV;
  const quests = methodsFor(skill, methods).filter((m) => m.kind === 'quest' && m.from <= level && (m.to === null || level < m.to) && (mode === 'members' || !m.members));
  const forecast = buildPath(skill, level, target, input, priority, best?.method ?? null, input0.methods ?? trainingMethods);
  const path = forecast.legs;

  const xpNow = input.xp ?? xpForLevel(level);
  const xpLeft = Math.max(0, xpForLevel(target) - xpNow);
  let actionsLeft: number | null = null;
  const actionTarget = best ? path.find(l => l.fromLevel === level && l.method.id === best.method.id)?.toLevel ?? target : null;
  if (best?.method.xpa) {
    const legEnd = actionTarget ?? target;
    actionsLeft = Math.ceil(Math.max(0, xpForLevel(legEnd) - xpNow) / best.method.xpa);
  }
  const time = forecast.time;
  // Upgrade rates are for the current method only, not for later methods that may use another tool.
  const methodEnd = path.find(l => l.method.id !== best?.method.id)?.fromLevel ?? target;
  const methodXp = Math.max(0, xpForLevel(methodEnd) - xpNow);
  const upgradeMethod = best && priority !== 'relaxed' && priority !== 'profit' ? {
    ...best.method, upgrades: best.method.upgrades ?? combatUpgrades(best.method, skill, state, { prices: input.prices, restriction: input.restriction, objective }),
  } : best?.method;
  // Reuse the method's acquisition allowance; a trip already needed for its kit is not charged twice.
  const purchaseTrip = best ? Math.max(0, SETUP_HOURS - setupHours(best)) : SETUP_HOURS;
  const found = upgradeMethod ? toolUpgrade(upgradeMethod, methodXp, priority, coinRate, purchaseTrip) : null;
  // Coins known (bag and bank) and short of the price: said, so the suggestion is not read as affordable. Unknown coins: nothing is said.
  const cash = coinsOf(state).total;
  const kitCost = found && best ? requirementCost(preparationNeeds({ best, upgrade: found }, state, input.prices)
    // The offered tool replaces this requirement; do not reserve money for buying a second tool as well.
    .filter((n) => !(n.type === 'tool' && tools[n.skill].some((t) => t.tier === found.tool))
      && !(n.type === 'item' && nameKey(n.name) === nameKey(found.tool)))
    .map((n) => methodRequirement(n, state)), state, input.prices) : 0;
  const afterKit = cash !== null && kitCost !== null ? Math.max(0, cash - kitCost) : null;
  const upgrade = found ? { ...found, kitCost,
    ...(cash !== null && cash < found.price ? { short: Math.round(cash) }
      : afterKit !== null && afterKit < found.price ? { afterKit: Math.floor(afterKit) } : {}),
  } : null;
  const reason = best ? reasonFor(best, priority, level, upgrade) : 'There is no method in the list for this level and mode: see the skill training plan.';
  return {
    ...empty, best: best ? { ...best, reason } : null, others, quests, path, xpLeft, actionsLeft, actionTarget, time, upgrade, reason,
    goalNeeds: (processingGoalNeeds(path, level, target, xpNow) ?? (skill === 'ranged' ? rangedGoalNeeds(path, state, xpNow, target, input.prices) : null)) ?? undefined,
    stockNeeds: trainingStockNeeds(path, skill, state, xpNow, input.prices, priority),
    followed: followedV ? said(followedV) : null,
  };
}

/** "about 3–4 h" / "≈ 2 h"; under an hour — in minutes. */
export function formatHours(t: TimeEstimate): string {
  const f = (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : `${h < 10 ? Math.round(h * 10) / 10 : Math.round(h)} h`);
  if (t.minHours === t.maxHours || f(t.minHours) === f(t.maxHours)) return `${t.source === 'measured' ? '≈' : 'about'} ${f(t.maxHours)}`;
  return `about ${f(t.minHours)}–${f(t.maxHours)}`;
}

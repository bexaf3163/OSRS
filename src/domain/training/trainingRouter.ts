import { nameKey } from '../items/itemKey';
// "What to train with": shared selection by level, goal, mode, stock, equipment, budget and preference.
// It returns the current method and phased path; catalogue entries live in src/data/trainingMethods.json.
//
// The rules everything rests on:
//  — only what is open is chosen: the level fits, the mode (F2P/Members) fits, the quest is done. What is missing
//    in items is named ("a pickaxe is needed", "feathers are needed"), but the method stays — it is preparation, not a ban;
//  — "unknown" is not "no": an item that cannot be checked does not remove a method from the choice;
//  — measured, modelled and reference rates are distinct; estimates are not promises.
//    Supported action-XP and remaining-work calculations use the shared models, not a second UI formula.

import type { GameMode, Progress, Step, TrainingGoal } from '../../types';
import { trainingMethodsJson as methodsJson, toolProgressionJson, gearJson, styleGearJson, transportJson, trainersJson, spellsJson, processingJson, skillingJson } from '../../data';
import { ACCESS_RULE_QUESTS, ACCESS_RULE_SKILLS } from '../market/shopAccess';
import { withPlannedKit } from './stages';
import { hoursText, purchaseTripHours, toolUpgrade, upgradeXp, type ToolUpgrade } from './toolUpgrade';
import { toolFamilyOf, toolUse } from '../items/toolTiers';
import { SKILLING } from './skillingRates';
import { evaluate, itemRequirement, type ReqState, type Requirement } from '../player/requirements';
import { coinsOf, heldExact, heldOf, levelOf, questOf, type PlayerState } from '../player/playerState';
import { isClosed } from '../quests/next-step';
import { xpForLevel } from '../player/xp';
import { rangedEquipment, rangedNeeds, RANGED_WATCH, withArrow } from '../combat/rangedLoadout';
import { SPELLS, STAFFS, isCombatSpell, strikeRecipe, superheatNeeds } from '../combat/magicPlan';
import { STYLE_GEAR } from '../combat/styleGear';
import { PROCESSING } from './processingRates';
import { canWear, gearData, gearPieceByName, levelsOf, type Levels } from '../combat/gearAdvisor';
import { meleeUnlocks, plannedMeleeKit } from './meleeKit';
import { pickKit } from '../combat/kitPick';
import { methodRate, rateKeyOf, type ItemScope, type RateSpot, type ModelRate } from './methodRates';
import { combatUpgrades, meleeUnsafe, rangedGoalNeeds } from '../combat/combatRates';
import type { PriceView } from '../market/quotes';
import { coinsPerMinute, coinTimeShare } from '../market/lootValue';
import type { TradeRestriction } from '../market/tradeRestriction';
import { requirementCost } from '../market/needPrice';
import { allocateMaterialStock } from '../player/materialStock';
import { actionsForQuantity, quantityForActions } from '../items/consumption';
import type { HeldUnits } from '../player/heldUnits';
import { processingGoalNeeds } from './processingGoal';
import { mergeGoalNeeds } from '../items/consumption';
import { isReusable } from '../items/reusable';
import { heldFood } from '../player/foodStock';
import { FOODS } from '../../data/threats';
import { GOALS, goalOf, losesTo, netCoinsPerHour, opensLater, practicalRate, rateLow, stays, withHourlyCoins, withinGoalPace } from './trainingGoal';
export type Effort = 'afk' | 'low' | 'medium' | 'high';
export type MethodCost = 'free' | 'profit' | 'cost';
export type Risk = 'none' | 'low' | 'high';

export type MethodNeed =
  | { type: 'item'; name: string; count?: number; anyOf?: string[]; equip?: boolean; refill?: number;
    /** Not needed to start: the fight model found no fight that brings you to the eating point; food only saves resting time. */
    optional?: boolean }
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
  /** The arrows the model fires here when the kit's would lose coins (ModelRate.ammo); the kit's needs carry them instead. */
  ammo?: string;
  /** What an activity no rate model covers uses and makes in an hour at its Wiki rate, priced at the exchange (trainingGoal withHourlyCoins). */
  perHour?: { coins?: number; makes?: { name: string; qty: number }[]; uses?: { name: string; qty: number }[] };
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
  /** Power training: catches are dropped, never banked, so the rate and the spot are the drop ones ("Iron, dropping the ore"). */
  drop?: boolean;
  /** Coins an hour at market prices, without the planning margin: what methods are ranked by. */
  marketNetPerHour?: number;
  coinsUnknown?: true;
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
  drop?: boolean; perHour?: TrainingMethod['perHour'];
}

export const trainingMethods: TrainingMethod[] = (methodsJson as unknown as { methods: Raw[] }).methods.map((m) => ({
  id: m.id,
  skills: Array.isArray(m.skill) ? m.skill : [m.skill],
  from: m.from, to: m.to ?? null, name: m.name, members: m.members,
  needs: m.needs ?? [], xph: m.xph ?? null, xpa: m.xpa ?? null, act: m.act ?? null,
  effort: m.effort, cost: m.cost, risk: m.risk, where: m.where, ...(m.drop ? { drop: true } : {}), ...(m.place ? { place: m.place } : {}), ...(m.note ? { note: m.note } : {}), url: m.url,
  kind: m.kind ?? 'method', xpTotal: m.xpTotal ?? null,
  ...(m.questGuide ? { questGuide: m.questGuide } : {}),
  ...(m.objectNames ? { objectNames: m.objectNames } : {}),
  ...(m.npcNames ? { npcNames: m.npcNames } : {}),
  ...(m.introductory ? { introductory: true } : {}),
  ...(m.perHour ? { perHour: m.perHour } : {}),
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
  /** A profit method whose prices are unknown: it waits behind ordinary methods, as a manual setup does. */
  unpriced?: boolean;
  /** Current kit is covered or its missing purchases are confirmed affordable. Unknown prices/cash are not funding. */
  fundingReady?: boolean;
  /** With no cash, an unpriced processing batch needs verification before replacing usable supplies. */
  needsFundingCheck?: boolean;
}

// The path re-views the same methods for every level copy of one state; the view reads only what rateKeyOf keys, plus the connection.
const viewCache = new WeakMap<TrainingMethod, Map<string, MethodView>>();
export function viewMethod(m: TrainingMethod, state: PlayerState, prices?: PriceView | null): MethodView {
  const cache = viewCache.get(m) ?? new Map<string, MethodView>();
  if (!viewCache.has(m)) viewCache.set(m, cache);
  const key = `${rateKeyOf(state)}|${state.connected ? 1 : 0}|${priceKeyOf(prices)}`;
  let out = cache.get(key);
  if (!out) {
    if (cache.size > 50) cache.clear();
    cache.set(key, out = viewFresh(m, state, prices));
  }
  return out;
}

function viewFresh(m: TrainingMethod, state: PlayerState, prices?: PriceView | null): MethodView {
  if (m.kit === 'strike-spell' && m.npcNames?.length) m = { ...m, name: `${strikeRecipe(state).spell.name} on ${m.npcNames.join(' / ')}` };
  const declared = methodNeeds(m, state, prices);
  const materials = allocateMaterialStock(state, declared.flatMap((n, index) => n.type === 'item'
    ? [{ key: `method:${index}`, nameEn: n.name, count: n.count ?? 1, anyOf: n.anyOf, equip: n.equip }] : []));
  const needs = declared.map((n, index) => needStatus(n, state, materials.get(`method:${index}`)));
  if (m.manualSetup) needs.push({ kind: 'item', label: m.manualSetup, state: 'UNKNOWN', detail: 'Manual setup has not been verified.' });
  // A profit method (enchanting, alchemy, jewellery) is a profit only when today's prices show it; unpriced, it waits as an alternative.
  const ownStock = m.rateSource === 'model' && declared.every((n, i) => n.type !== 'item' || needs[i].state === 'OK' || needs[i].state === 'BANK');
  const unpriced = m.cost === 'profit' && PROCESSING.methods[m.id] !== undefined && m.costPerHour == null && !ownStock;
  if (unpriced) needs.push({ kind: 'item', label: 'Current exchange prices', state: 'UNKNOWN', detail: 'Its margin is unknown without prices.' });
  const unsafeFoe = meleeUnsafe(m, state);
  if (unsafeFoe) needs.push({ kind: 'skill', label: `More Hitpoints: ${unsafeFoe}`, state: 'MISSING', detail: 'Not safe training at this level.' });
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
  return { method: m, status: locked.length ? 'LOCKED' : prep.length || m.manualSetup || unpriced ? 'PREP' : 'READY', missing: [...locked, ...prep], unchecked, fundingReady, ...(m.consumables?.length && cash === 0 && kit === null ? { needsFundingCheck: true } : {}), ...(fundingShortfall ? { fundingShortfall } : {}), ...(unpriced ? { unpriced } : {}) };
}

export function methodNeeds(m: TrainingMethod, state: PlayerState, prices?: PriceView | null): MethodNeed[] {
  // A model-resolved recipe also carries its actual batch size and recovery food. Do not replace it with a generic starter kit.
  if (m.rateSource === 'model' && (m.kit === 'strike-spell' || m.kit === 'superheat-iron')) return m.needs;
  if (m.kit === 'strike-spell') return strikeRecipe(state).needs;
  if (m.kit === 'superheat-iron') return superheatNeeds(state);
  // Stage 6 is F2P-only. Do not demand a weaker F2P bow from Members using an unmodelled weapon.
  if (m.kit === 'f2p-bow' && state.mode !== 'f2p') return m.needs.filter(n => n.type !== 'item' || !RANGED_WATCH.includes(n.name));
  if (m.kit === 'f2p-bow' && m.kind === 'method') return [...m.needs.filter(n => n.type !== 'item' || !RANGED_WATCH.includes(n.name)), ...withArrow(rangedNeeds(state, prices), m.ammo)];
  return m.kind === 'method' && m.skills.some(skill => MELEE_SKILLS.includes(skill)) ? meleeNeeds(m, state, prices) : m.needs;
}

const MELEE_SKILLS = ['attack', 'strength', 'defence'];

// What a skill's training can read: the owned items its methods' needs, recipes, gathering tools and products name (for a fight
// or kit, every gear, food, ammunition, rune and staff), its own, combat and required levels, and the quests any engine checks.
// A gate run with TRAINING_SCOPE_VERIFY=1 proves it.
const FIGHT_ITEMS = new Set<string>();
const collectNames = (o: unknown): void => {
  if (Array.isArray(o)) o.forEach(collectNames);
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) {
    if (k === 'name' || k === 'nameEn') { if (typeof v === 'string') FIGHT_ITEMS.add(nameKey(v)); } else if (k === 'names' && Array.isArray(v)) v.forEach(n => typeof n === 'string' && FIGHT_ITEMS.add(nameKey(n))); else collectNames(v);
  }
};
// Every quest a training engine can check (method unlocks, gear, spells, stations, transport, trainers, shop and spawn rules): a
// quest outside it never changes a forecast.
let readQuests: Set<string> | undefined;
const questsRead = (): Set<string> => {
  if (readQuests) return readQuests;
  const out = new Set<string>([nameKey('Prince Ali Rescue'), ...ACCESS_RULE_QUESTS.map(nameKey),
    ...trainingMethods.flatMap(m => (m.kind === 'quest' || m.questGuide ? [nameKey(m.questGuide?.name ?? m.name)] : []))]);
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) {
      if ((k === 'quest' || k === 'quests') && (typeof v === 'string' || Array.isArray(v))) [v].flat().forEach(q => typeof q === 'string' && out.add(nameKey(q)));
      else walk(v);
    }
  };
  [methodsJson, gearJson, styleGearJson, transportJson, trainersJson, spellsJson, processingJson, skillingJson].forEach(walk);
  return (readQuests = out);
};
const KIT_ITEM = / rune$|staff|arrows?$|bolts?$|darts?$|knife$|knives$|javelin|thrownaxe|bow$|bow \(u\)$| ore$|^coal$/;
const itemScopes = new Map<string, ItemScope>();
export function trainingItemScope(skill: string): ItemScope {
  let scope = itemScopes.get(skill);
  if (scope) return scope;
  if (!FIGHT_ITEMS.size) [gearData.items, FOODS, STYLE_GEAR, STAFFS, RANGED_WATCH.map(name => ({ name }))].forEach(collectNames);
  const names = new Set<string>(['coins']);
  const add = (...list: (string | undefined)[]) => list.forEach(n => n && names.add(nameKey(n)));
  let fights = ['attack', 'strength', 'defence', 'hitpoints', 'ranged', 'magic', 'prayer', 'slayer'].includes(skill);
  // Combat levels decide danger at a spot and which gear is worn; shop and spawn rules ask for a few skills.
  const levels = new Set<string>([skill, 'attack', 'strength', 'defence', 'hitpoints', 'ranged', 'magic', 'prayer', ...ACCESS_RULE_SKILLS]);
  for (const m of methodsFor(skill)) {
    if (m.kit || m.npcNames?.length) fights = true;
    for (const n of m.needs) {
      if (n.type === 'skill' || n.type === 'tool') levels.add(n.skill);
      if (n.type === 'item') add(n.name, ...n.anyOf ?? []);
      if (n.type === 'tool') add(...tools[n.skill].map(t => t.tier), ...toolFamilyOf(n.skill === 'woodcutting' ? 'axe' : 'pickaxe') ?? []);
    }
    for (const id of PROCESSING.methods[m.id] ?? []) {
      const r = PROCESSING.recipes.find(x => x.id === id);
      // A fire is lit with a held tinderbox, logs and the Firemaking level for them; an input may be a staff, and a station may need a carried or worn item.
      if (r) add(...r.inputs.flatMap(i => [i.name, i.staff, ...i.anyOf ?? []]), r.output?.name, ...r.tools ?? [], r.access?.carried, r.access?.equipped,
        ...r.facility === 'fire' ? ['Tinderbox', 'Logs'] : []);
      r?.requires?.forEach(q => levels.add(q.skill));
      if (r?.facility === 'fire') levels.add('firemaking');
    }
    for (const id of SKILLING.methods[m.id] ?? []) {
      const r = SKILLING.resources.find(x => x.id === id);
      if (r) add(r.tool, ...SKILLING.tools[r.tool]?.tiers.map(t => t.item) ?? [], ...toolFamilyOf(r.tool) ?? [], ...r.products.map(p => p.name));
    }
  }
  const has = fights ? (k: string) => names.has(k) || FIGHT_ITEMS.has(k) || KIT_ITEM.test(k) : (k: string) => names.has(k);
  itemScopes.set(skill, scope = { id: `scope:${skill}`, has, levels, quests: questsRead() });
  return scope;
}

// Gear names per slot this mode, these levels and this quest list can wear: every method view of every level copy asked again.
const wearableCache = new WeakMap<object, Map<string, Map<string, string[]>>>();
function wearable(state: PlayerState, lv: Levels, quests: Set<string> | undefined): Map<string, string[]> {
  let byLevels = wearableCache.get(state.quests);
  if (!byLevels) wearableCache.set(state.quests, byLevels = new Map());
  const key = `${state.mode}|${JSON.stringify(lv)}`;
  let out = byLevels.get(key);
  if (!out) {
    byLevels.set(key, out = new Map());
    for (const p of gearData.items) {
      if ((state.mode !== 'members' && p.members) || p.reqUnverified || !canWear(p, lv, quests)) continue;
      const names = out.get(p.slot);
      if (names) names.push(p.name); else out.set(p.slot, [p.name]);
    }
  }
  return out;
}

/**
 * The melee kit of a trainer through the one kit rule of every style (pickKit): per slot the best owned piece is worn and, with
 * known coins and prices, a better amulet or armour piece is bought after the method's own supplies. Pieces rank by melee
 * strength, then attack, then total defence. Weapons are only worn here; buying one is the shared upgrade evaluator's job.
 * Unknown levels or worn gear leave the authored needs.
 */
function meleeNeeds(m: TrainingMethod, state: PlayerState, prices?: PriceView | null): MethodNeed[] {
  if (!m.npcNames?.length || !state.equipmentItems || !MELEE_SKILLS.every(skill => levelOf(state, skill) !== undefined)) return m.needs;
  const lv = levelsOf(Object.fromEntries(Object.entries(state.levels).flatMap(([skill, value]) => value.known ? [[skill, value.value]] : [])));
  const quests = state.quests.known ? new Set(state.quests.value) : undefined;
  // The method's own supplies at full price come first, as the bow's arrows and food do: unknown stock never frees coins.
  const supplies = m.needs.reduce<number | null>((sum, n) => { if (sum === null || n.type !== 'item' || n.equip) return sum; const p = prices?.buy(n.name)?.price; return p == null ? null : sum + p * (n.count ?? 1); }, 0);
  const cash = coinsOf(state).total;
  const twoHanded = gearPieceByName(state.equipment.weapon ?? '')?.twoHanded;
  const slots = (['weapon', 'neck', 'head', 'body', 'legs', 'shield'] as const).filter(slot => slot !== 'shield' || !twoHanded);
  const usable = wearable(state, lv, quests);
  const kit = pickKit({
    slots: slots.map(slot => ({ slot, names: usable.get(slot) ?? [], wearOnly: slot === 'weapon' })),
    rank: name => { const p = gearPieceByName(name)!; return [p.strength, Math.max(p.attack.stab, p.attack.slash, p.attack.crush), p.defence.stab + p.defence.slash + p.defence.crush]; },
    // A worn piece is owned: total counts the bag and bank only, and is 0 rather than unknown once the bank was read.
    owned: name => { const h = heldExact(state, name); return (h.total ?? 0) + h.equipped > 0; },
    // Once the bank was opened, a piece it did not report is not owned, as the Gear advisor reads it.
    price: name => (state.owned?.bankSeen && heldOf(state, name).presence !== 'PRESENT' ? prices?.buy(name)?.price ?? null : null),
    budget: cash === null || supplies === null || !prices ? null : Math.max(0, cash - supplies),
  });
  return [
    ...m.needs.filter(n => n.type !== 'item' || !n.equip || !gearPieceByName(n.name)),
    ...kit.map(k => ({ type: 'item' as const, name: k.name, count: 1, equip: true })),
  ];
}

/** A worthwhile gathering upgrade uses the same preparation pipeline as the rest of the selected kit. */
export function preparationNeeds(advice: Pick<TrainingAdvice, 'best' | 'upgrade'>, state: PlayerState, prices?: PriceView | null): MethodNeed[] {
  if (!advice.best) return [];
  const method = advice.best.method;
  let needs = advice.upgrade?.needs ?? methodNeeds(method, state, prices);
  const upgradePiece = advice.upgrade?.tool ? gearPieceByName(advice.upgrade.tool) : null;
  if (method.kit === 'strike-spell' && upgradePiece?.slot === 'weapon' && !advice.upgrade?.needs) {
    const supplies = new Set([
      ...SPELLS.filter(isCombatSpell).flatMap(spell => Object.keys(spell.runes).map(element => `${element} rune`)),
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
  const melee = method.skills.some(skill => MELEE_SKILLS.includes(skill));
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
const COST_RANK: Record<MethodCost, number> = { profit: 0, free: 0, cost: 1 };
const STATUS_RANK: Record<MethodStatus, number> = { READY: 0, PREP: 1, LOCKED: 2 };

/** How much faster a new method must be before a running one is dropped; the same margin as the planner (decide). */
const SWITCH_MARGIN = 0.12;
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

/**
 * The order of methods: the practical hours to the goal, a method whose items are missing paying its setup; locked
 * ones last.
 */
function compare(xpLeft?: number, level?: number, coinRate: number | null = null, goal: TrainingGoal = 'balanced') {
  return (a: MethodView, b: MethodView): number => {
    if (Boolean(a.fundingShortfall) !== Boolean(b.fundingShortfall)) return Number(Boolean(a.fundingShortfall)) - Number(Boolean(b.fundingShortfall));
    if (Boolean(a.unpriced) !== Boolean(b.unpriced)) return Number(Boolean(a.unpriced)) - Number(Boolean(b.unpriced));
    if (Boolean(a.method.manualSetup) !== Boolean(b.method.manualSetup)) return Number(Boolean(a.method.manualSetup)) - Number(Boolean(b.method.manualSetup));
    const uncheckedEntry = (v: MethodView) => v.unchecked.some(n => n.kind === 'skill' || n.kind === 'quest');
    if (uncheckedEntry(a) !== uncheckedEntry(b)) return Number(uncheckedEntry(a)) - Number(uncheckedEntry(b));
    // A player with no cash can finish a usable batch instead of assuming an unpriced processing recipe is funded.
    // A funded purchase still competes by time; ordinary tool/spot investment keeps its existing setup comparison.
    if (a.fundingReady && b.needsFundingCheck) return -1;
    if (b.fundingReady && a.needsFundingCheck) return 1;
    // A method the level has outgrown (cows at Attack 45, seagulls at Ranged 60) does not beat a ready method made for this level just because the
    // newer one's supplies are unread or it is riskier. Where speed ranks, known speeds still decide; an outgrown method with
    // its supplies at hand still beats a new one that needs buying first.
    const outgrown = (v: MethodView) => level !== undefined && v.method.to !== null && level >= v.method.to;
    const bySpeed = rateLow(a.method) !== null && rateLow(b.method) !== null;
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
    if (a.status === 'LOCKED' || b.status === 'LOCKED') { if (s) return s; }
    // No plan trains at a loss while a free or earning method is open (owner, 2026-11-23, Members too); among losing ones the balance below decides.
    if (losesTo(a.method, b.method, coinRate)) return 1;
    if (losesTo(b.method, a.method, coinRate)) return -1;
    const pa = practicalRate(a.method);
    const pb = practicalRate(b.method);
    if (pa && pb && xpLeft && xpLeft > 0) {
      // The hours to the goal, less what the banked drops are worth in hours (lootValue.ts: the same rule as the fight plans).
      const hours = (v: MethodView, p: number) => xpLeft / p + setupHours(v);
      // Methods are ranked at market prices; the planning margin would make every expensive recipe lose to the cheapest one.
      const coinsA = a.method.marketNetPerHour ?? netCoinsPerHour(a.method);
      const coinsB = b.method.marketNetPerHour ?? netCoinsPerHour(b.method);
      // Coins on both sides or on neither: a method whose cost is not known is never compared as free.
      const known = coinsA !== null && coinsB !== null;
      const worth = (v: MethodView, h: number) => (known ? h * coinTimeShare(v === a ? coinsA! : coinsB!, coinRate) : 0);
      const ra0 = hours(a, pa);
      const rb0 = hours(b, pb);
      const sa = GOALS[goal].score(ra0, worth(a, ra0), known ? coinsA : null);
      const sb = GOALS[goal].score(rb0, worth(b, rb0), known ? coinsB : null);
      if (Math.abs(sa.score - sb.score) > Math.min(sa.scale, sb.scale) * 0.05) return sa.score - sb.score;
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
  };
}


export const methodsFor = (skill: string, methods: readonly TrainingMethod[] = trainingMethods): TrainingMethod[] =>
  methods.filter((m) => m.skills.includes(skill));

const availableAt = (m: TrainingMethod, level: number, mode: GameMode): boolean =>
  m.kind === 'method' && m.from <= level && (mode === 'members' || !m.members);

const recommendedAt = (m: TrainingMethod, level: number, mode: GameMode): boolean =>
  // The authored bracket (suggestedFrom) is only a tie-break in compare(); hiding a valid target below it forced monks over
  // giant frogs at Ranged 24 (acceptance S05).
  availableAt(m, level, mode) && (!m.introductory || m.to === null || level < m.to);

/** The Plan's ladder: the level-1 forecast for the levels already passed, then the player's own path from the level on, so the
 * current stage is the method the Train card recommends (a cheaper method unlocked since is not hidden by an old leg). */
export function ladderFrom(fromOne: readonly PathLeg[], ahead: readonly PathLeg[], level: number): PathLeg[] {
  const passed = fromOne.filter((l) => l.fromLevel < level).map((l) => (l.toLevel > level ? { ...l, toLevel: level } : l));
  return [...passed, ...ahead];
}

export interface PathLeg {
  method: TrainingMethod;
  fromLevel: number;
  toLevel: number;
  /** Resolved future preparation, not a claim that these supplies are owned or already funded. */
  needs?: MethodNeed[];
  /** Expected processing actions integrated at the existing forecast samples. */
  processingActions?: number;
  /** The method before this leg began to lose coins here, so the plus-or-zero rule left it even for a slower one. */
  leftLoss?: true;
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
  /** The whole plan from level 1 to the goal (the guide), when the player is past level 1; the path is the part still ahead. */
  ladder?: PathLeg[];
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
  /** The coins the plan earns (+) or spends (-) to the goal at the fast and the slow pace, at market prices; null when a leg's coins are unknown. */
  coins?: [number, number] | null;
  /** One phrase "why this method". */
  reason: string;
  /** The better tool worth buying for the XP left (toolUpgrade), when there is one. */
  upgrade?: ToolUpgrade | null;
  /** The method the game follows (input followed), when it is open at this level and is not the pick itself. */
  followed?: MethodView | null;
  /** untilChange: the method that takes over at the target; null when none does before it. */
  next?: string | null;
}

export interface AdviceInput {
  skill: string;
  target: number;
  state: PlayerState;
  mode: GameMode;
  /** The skill's current XP (if known): otherwise counted from the start of the level. */
  xp?: number | null;
  /** XP per hour from the player's measurements. */
  measuredXph?: number | null;
  /** The goal is the first method change (the Skills goal without a planner need): the forecast stops there, and the
   * advice's target, XP, time and supplies run to it; `next` names the method that takes over. */
  untilChange?: boolean;
  methods?: readonly TrainingMethod[];
  /** The method the game follows now (a followed training plan): shown with this player's figures beside the pick. */
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
export function priceKeyOf(prices: PriceView | null | undefined): string {
  if (!prices) return '-';
  let id = priceIds.get(prices);
  if (id === undefined) priceIds.set(prices, (id = nextPriceId++));
  return String(id);
}
/**
 * The methods of a skill with the combat model's own rate for this player where it has one (combatRates.ts): melee, Ranged and Magic training is then
 * ranked by what it gives this character, not by the wiki's guide for everyone. Other methods stay as they are.
 */
export function personalize(methods: readonly TrainingMethod[], skill: string, state: PlayerState, prices?: PriceView | null, restriction?: TradeRestriction['state']): TrainingMethod[] {
  const stateKey = rateKeyOf(state);
  return methods.map((m) => {
    if (!m.skills.includes(skill) || m.kind !== 'method') return m;
    const key = `${m.id}|${skill}|${stateKey}|${priceKeyOf(prices)}|${restriction ?? '-'}`;
    const cache = rateCache.get(m) ?? new Map<string, TrainingMethod>();
    if (!rateCache.has(m)) rateCache.set(m, cache);
    const hit = cache.get(key);
    if (hit) return hit;
    const r = methodRate(m, skill, state, { prices, restriction });
    const out: TrainingMethod = r ? {
      ...m, xph: [Math.round(r.xph[0]), Math.round(r.xph[1])], rateSource: 'model', rateBasis: r.basis, ...(r.batchActions !== undefined ? { batchActions: r.batchActions } : {}), ...(r.consumables ? { consumables: r.consumables } : {}), costPerHour: r.costPerHour,
      ...(r.methodName ? { name: r.methodName } : {}),
      ...(r.selectedTool ? { selectedTool: r.selectedTool } : {}),
      ...(r.ammo ? { ammo: r.ammo } : {}),
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
      ...(r.marketNetPerHour !== undefined ? { marketNetPerHour: r.marketNetPerHour } : {}),
      ...(r.coinsUnknown ? { coinsUnknown: true as const } : {}),
      ...(r.costName ? { costName: r.costName } : {}),
      ...(r.warning ? { rateWarning: r.warning } : {}),
      ...(r.upgrades?.length ? { upgrades: r.upgrades } : {}),
      ...(r.spot ? { spot: r.spot, where: r.spot.how === 'bank' && r.spot.bank ? `${r.spot.label} (bank at ${r.spot.bank})` : r.spot.label } : {}),
    } : withHourlyCoins(m, prices, state.mode, restriction);
    if (cache.size > 50) cache.clear();
    cache.set(key, out);
    return out;
  });
}

const fmtK = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));


/** "≈ 8k–11k XP per hour", "for you" when it is the model's figure for this player. */
export const rateText = (m: TrainingMethod) => {
  const r = m.xph!;
  return `${fmtK(r[0]) === fmtK(r[1]) ? `≈ ${fmtK(r[0])}` : `≈ ${fmtK(r[0])}–${fmtK(r[1])}`} XP per hour${m.rateSource === 'model' ? ' for you' : ''}`;
};


function reasonFor(v: MethodView, level: number, upgrade: ToolUpgrade | null = null): string {
  const m = v.method;
  const parts: string[] = [];
  if (m.xph) parts.push(rateText(m));
  parts.push(m.effort === 'afk' ? 'almost no clicks' : m.effort === 'low' ? 'few clicks' : m.effort === 'medium' ? 'steady clicking' : 'needs full attention');
  if (m.risk !== 'none') parts.push(m.risk === 'high' ? 'risky' : 'small risk');
  if (m.lootPerHour && m.lootName) parts.push(`${m.lootName} ≈ +${fmtK(Math.round(m.lootPerHour / 100) * 100)} gp per hour`);
  if (m.spot?.how === 'drop') parts.push('drop when full');
  if (m.rateWarning) parts.push(m.rateWarning);
  if (m.costPerHour) parts.push(`${m.costName ?? (m.skills.includes('magic') ? 'runes' : 'arrows')} ≈ ${fmtK(Math.round(m.costPerHour / 100) * 100)} gp per hour`);
  else if (m.cost === 'cost') parts.push('material costs');
  else if (m.cost === 'profit') parts.push('can end in profit');
  // The money comparison of the methods: what an hour nets and what each XP costs or earns.
  if (m.xph && typeof m.costPerHour === 'number' && (m.costPerHour > 0 || (m.lootPerHour ?? 0) > 0)) {
    const net = (m.lootPerHour ?? 0) - m.costPerHour;
    const perXp = net / ((m.xph[0] + m.xph[1]) / 2);
    const k = Math.abs(net) >= 1000 ? `${Math.round(Math.abs(net) / 1000)}k` : String(Math.round(Math.abs(net)));
    parts.push(`net ≈ ${net < 0 ? '−' : '+'}${k} gp per hour, ${perXp < 0 ? '−' : '+'}${Math.abs(perXp).toFixed(2)} gp per XP`);
  }
  if (v.fundingShortfall) parts.push(`earn at least ${v.fundingShortfall.toLocaleString('en-US')} gp for the missing next-trip kit first`);
  if (v.status === 'PREP') parts.push(`first: ${v.missing.map((x) => x.label).join(', ')}`);
  if (v.status === 'LOCKED') parts.push(`locked: ${v.missing.map((x) => x.label).join(', ')}`);
  if (level < m.from) parts.push(`from level ${m.from}`);
  if (upgrade) parts.push(`${/^[aeiou]/i.test(upgrade.tool) ? 'an' : 'a'} ${upgrade.tool} (≈ ${fmtK(upgrade.price)} gp${upgrade.short !== undefined ? `; you have ${fmtK(upgrade.short)}` : upgrade.afterKit !== undefined ? `; only ${fmtK(upgrade.afterKit)} gp after the kit` : ''}) saves ≈ ${upgrade.coinsSaved !== undefined ? `${fmtK(Math.round(upgrade.coinsSaved))} gp after its price` : hoursText(upgrade.hours)} ${toolUse(upgrade.tool) ? 'until the next tier, the trip to buy it included' : 'on this method'}${upgrade.kitCost === null ? '; check kit stock and prices before buying' : ''}`);
  return parts.join('; ');
}

/**
 * The best method on each leg of the path to the goal; useful gear/recipe milestones remain separate review stages. A new unlock replaces the method in hand
 * only when it is clearly better in practice (SWITCH_GAIN): changing method for a sliver costs a trip and a new setup.
 */
/** Conditional future preparation in a copy: never grant this kit/coins to the live player. */
function forecastEquipment(state: PlayerState, needs: readonly MethodNeed[], prices?: PriceView | null): PlayerState {
  const equipmentNeeds = needs.filter((n): n is Extract<MethodNeed, { type: 'item' }> => n.type === 'item' && Boolean(n.equip));
  // What is not already held is bought at its price; an untracked stock counts as none, so coins are never invented.
  const cost = equipmentNeeds.reduce<number | null>((sum, n) => {
    const held = heldExact(state, n.name);
    const missing = Math.max(0, (n.count ?? 1) - ((held.total ?? 0) + held.equipped));
    const price = missing ? prices?.buy(n.name)?.price : 0;
    return sum === null || price == null ? null : sum + price * missing;
  }, 0);
  const cash = coinsOf(state).total;
  const equipmentItems = equipmentNeeds.flatMap(n => n.type === 'item' ? [{ name: n.name,
    count: Math.max(n.count ?? 1, state.equipmentItems?.find(i => nameKey(i.name) === nameKey(n.name))?.count ?? 0) }] : []);
  return { ...state, equipment: rangedEquipment(state.equipment, equipmentNeeds), equipmentItems,
    coins: cash !== null && cost !== null ? {
      bag: { known: true, value: Math.max(0, cash - cost), source: 'profile' }, bank: { known: true, value: 0, source: 'profile' },
    } : { bag: { known: false }, bank: { known: false } },
  };
}

// Quest forecasts ask for the same path from many equal states each turn; rateKeyOf gives equal states one key.
// shortcut: callers must not change a returned path in place; copy legs before editing them if that is ever needed.
const pathCache = new WeakMap<readonly TrainingMethod[], Map<string, ReturnType<typeof pathFresh>>>();
function buildPath(skill: string, level: number, target: number, input: AdviceInput, first: TrainingMethod | null, raw: readonly TrainingMethod[]): ReturnType<typeof pathFresh> {
  const cache = pathCache.get(raw) ?? new Map<string, ReturnType<typeof pathFresh>>();
  if (!pathCache.has(raw)) pathCache.set(raw, cache);
  const key = [skill, level, target, rateKeyOf(input.state), input.state.connected ? 1 : 0, input.mode, input.xp ?? '-', input.measuredXph ?? '-',
    input.untilChange ? 1 : 0, input.followed ?? '-', priceKeyOf(input.prices), input.restriction ?? '-', first?.id ?? '-', goalOf(input.state, skill)].join('|');
  let out = cache.get(key);
  if (!out) {
    // A Members gate turn asks for about 800 new paths; a 2,000 cap emptied the cache every turn (99% misses).
    // shortcut: whole-cache reset at 100,000 paths, replace with an LRU if app memory ever matters.
    if (cache.size > 100_000) cache.clear();
    cache.set(key, out = pathFresh(skill, level, target, input, first, raw));
  }
  return out;
}

function pathFresh(skill: string, level: number, target: number, input: AdviceInput, first: TrainingMethod | null, raw: readonly TrainingMethod[]): { legs: PathLeg[]; time: TimeEstimate | null; coins: [number, number] | null; handover?: string } {
  const legs: PathLeg[] = [];
  const milestones = trainingMilestones(skill, raw, input.mode, input.state);
  let previousSetup = '';
  let projectedState = input.state;
  let minHours = 0;
  let maxHours = 0;
  let timed = true;
  // The coins the plan earns (+) or spends (-) on the way, at the fast and the slow pace; one leg with unknown coins leaves the total unknown.
  const coins: [number, number] = [0, 0];
  let coinsKnown = true;
  const sources = new Set<TimeEstimate['source']>();
  let handover: string | undefined;
  // Rates, kit and views change only where the path re-rates (every FORECAST_STEP levels and at every unlock milestone), so the
  // candidates are rated there once and reused for the levels between; re-viewing every method at every level was most of a gate turn.
  let views: MethodView[] = [];
  let projected = input.state;
  const needsFor: { id?: string; needs: MethodNeed[] } = { needs: [] };
  for (let lv = level; lv < target; lv++) {
    // The model's rates are for the level the leg starts at (every FORECAST_STEP levels), not today's carried forward: a method unlocked later is
    // then compared on its own model rate, not on the wiki's guide against today's model rates.
    if (lv === level || lv % FORECAST_STEP === 0 || milestones.has(lv)) {
      // Every leg, the first too, carries the tool its stage plans, so all legs are rated by the same model, not some by the wiki guess.
      const base = atLevel(projectedState, skill, lv);
      projected = withPlannedKit(base, skill, lv);
      // Melee (and Slayer, whose XP is melee damage) forecasts with the weapon and armour the Gear page would wear or buy at these levels and coins, as Ranged does with its kit.
      // Asked only where this skill unlocks a piece: between unlocks the kit bought before is carried on (projectedState).
      // Nothing to buy keeps the worn kit: forecastEquipment's list of worn items is the kit it is given.
      const meleeKit = [...MELEE_SKILLS, 'slayer'].includes(skill) && input.prices && (lv === level || meleeUnlocks(skill).has(lv)) ? plannedMeleeKit(projected, input.prices) : [];
      if (meleeKit.length) projectedState = projected = forecastEquipment(projected, meleeKit, input.prices!);
      const methods = lv === level && projected === base ? input.methods ?? trainingMethods : personalize(raw, skill, atLevel(projected, skill, lv), input.prices, input.restriction);
      // Advance only this skill in a copy; other skill/quest entry proofs must still be satisfied.
      views = withinGoalPace(goalOf(input.state, skill), methodsFor(skill, methods).filter((m) => !m.manualSetup && recommendedAt(m, lv, input.mode)).map((m) => viewMethod(m, projected, input.prices)).filter((v) => v.status !== 'LOCKED'), coinsPerMinute(input.prices, input.mode));
      needsFor.id = undefined;
    }
    const cands = [...views];
    // Each level is weighed as the first one is (adviseTraining): the hours from here to the goal, less what the banked drops are worth.
    cands.sort(compare(Math.max(0, xpForLevel(target) - xpForLevel(lv)), lv, coinsPerMinute(input.prices, input.mode), goalOf(input.state, skill)));
    let pick = (lv === level ? cands.find(c => c.method.id === first?.id)?.method : undefined) ?? cands[0]?.method;
    // A method whose rate this state cannot price (a fight kit with no coins) leaves the whole goal untimed; a priced one is a plan.
    if (pick && practicalRate(pick) === null) pick = cands.find(c => practicalRate(c.method) !== null && (c.method.to === null || lv < c.method.to))?.method ?? pick;
    if (!pick) { timed = false; continue; }
    const last = legs[legs.length - 1];
    const held = last && last.method.id !== pick.id ? cands.find((c) => c.method.id === last.method.id)?.method : undefined;
    const leftLoss = held !== undefined && losesTo(held, pick, coinsPerMinute(input.prices, input.mode));
    if (held && !leftLoss && stays(goalOf(input.state, skill), held, pick, SWITCH_GAIN)) pick = held;
    // By name: one method changes its spell, bar or fish by level ("Water Strike", "Make Iron bar").
    if (input.untilChange && legs.length > 0 && pick.name !== legs[0].method.name) { handover = pick.name; break; }
    const measured = pick.id === first?.id && (!input.followed || input.followed === pick.id)
      && input.measuredXph !== null && input.measuredXph !== undefined && Number.isFinite(input.measuredXph) && input.measuredXph > 0;
    const rate = measured ? [input.measuredXph!, input.measuredXph!] : pick.xph;
    const xp = Math.max(0, xpForLevel(lv + 1) - Math.max(xpForLevel(lv), input.xp ?? xpForLevel(level)));
    if (!rate || !rate.every((n) => Number.isFinite(n) && n > 0) || rate[1] < rate[0]) timed = false;
    else {
      minHours += xp / rate[1];
      maxHours += xp / rate[0];
      sources.add(measured ? 'measured' : pick.rateSource ?? 'wiki');
      const net = pick.coinsUnknown ? null : pick.marketNetPerHour ?? netCoinsPerHour(pick);
      if (net === null) coinsKnown = false;
      else { coins[0] += Math.min(net * xp / rate[1], net * xp / rate[0]); coins[1] += Math.max(net * xp / rate[1], net * xp / rate[0]); }
    }
    if (needsFor.id !== pick.id) Object.assign(needsFor, { id: pick.id, needs: methodNeeds(pick, projected, input.prices) });
    const plannedNeeds = needsFor.needs;
    const setup = JSON.stringify([pick.rateBasis ?? '', plannedNeeds.map(n => n.type === 'item' && n.equip ? { ...n, count: 1 } : n)]);
    const review = milestones.has(lv);
    const processingActions = pick.consumables && pick.xpa && Number.isFinite(pick.xpa) && pick.xpa > 0 ? xp / pick.xpa : undefined;
    if (last && last.method.id === pick.id && setup === previousSetup && !review) {
      last.toLevel = lv + 1;
      last.processingActions = last.processingActions !== undefined && processingActions !== undefined ? last.processingActions + processingActions : undefined;
    } else legs.push({ method: pick, fromLevel: lv, toLevel: lv + 1, needs: plannedNeeds, ...(processingActions !== undefined ? { processingActions } : {}),
      ...(leftLoss ? { leftLoss: true as const } : {}) });
    previousSetup = setup;
    if (plannedNeeds.some(n => n.type === 'item' && n.equip)) projectedState = forecastEquipment(projected, plannedNeeds, input.prices);
  }
  const source = sources.size === 1 ? [...sources][0] : 'forecast';
  return { legs, time: timed && legs.length > 0 ? { source, minHours, maxHours } : null,
    coins: timed && coinsKnown && legs.length > 0 ? [Math.round(coins[0]), Math.round(coins[1])] : null, handover };
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
  const resources = new Set(relevant.flatMap(m => SKILLING.methods[m.id] ?? []));
  for (const s of SKILLING.spots) if (s.level && resources.has(s.resource) && !(s.members && mode === 'f2p')) levels.push(s.level);
  if (skill === 'magic') levels.push(...SPELLS.map(s => s.level));
  return new Set(levels.filter(n => Number.isInteger(n) && n >= 1 && n <= 99));
}

/** Future legs of the path are re-rated every this many levels. */
const FORECAST_STEP = 5;
/** The same player at another level of one skill: what the path forecasts with. */
// One copy per state, skill and level, so caches keyed on the state object (withPlannedKit, rateKeyOf) hit across methods and turns.
const levelCopies = new WeakMap<PlayerState, Map<string, PlayerState>>();
export function atLevel(state: PlayerState, skill: string, value: number): PlayerState {
  let kept = levelCopies.get(state);
  if (!kept) levelCopies.set(state, kept = new Map());
  const key = `${skill}|${value}`;
  let out = kept.get(key);
  if (!out) kept.set(key, out = { ...state, levels: { ...state.levels, [skill]: { ...(state.levels[skill] ?? { source: 'profile' }), known: true, value } } } as PlayerState);
  return out;
}

/** Reuse the selected phases and model quantities; unsupported consumable forecasts stay absent. */
export function trainingStockNeeds(path: readonly PathLeg[], skill: string, state: PlayerState, xp: number, prices?: PriceView | null): MethodNeed[] | undefined {
  const window: PathLeg[] = [];
  const stages = new Set<string>();
  const reusable: Extract<MethodNeed, { type: 'item' }>[] = [];
  for (const leg of path) {
    const projected = atLevel(state, skill, leg.fromLevel);
    const legXp = Math.max(0, xpForLevel(leg.toLevel) - Math.max(xp, xpForLevel(leg.fromLevel)));
    const upgrade = toolUpgrade(leg.method, (tool) => upgradeXp(tool, skill, state.mode, Math.max(xp, xpForLevel(leg.fromLevel)), legXp, path[path.length - 1].toLevel), coinsPerMinute(prices, state.mode));
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
  const { skill, state, mode } = input0;
  let target = input0.target;
  const methods = personalize(input0.methods ?? trainingMethods, skill, state, input0.prices, input0.restriction);
  const input = { ...input0, methods };
  const level = levelOf(state, skill) ?? null;
  const empty: TrainingAdvice = { skill, level, target, best: null, others: [], quests: [], path: [], xpLeft: null, actionsLeft: null, actionTarget: null, time: null, reason: '' };
  if (level === null) return { ...empty, reason: 'Level unknown: log in to the game with RuneLite or enter it on the skill page.' };
  if (level >= target) return { ...empty, reason: 'The goal is already reached.' };

  const xpNow0 = input.xp ?? xpForLevel(level);
  const coinRate = coinsPerMinute(input.prices, input.mode);
  const goal = goalOf(state, skill);
  const cmp = compare(Math.max(0, xpForLevel(target) - xpNow0), level, coinRate, goal);
  const views = withinGoalPace(goal, methodsFor(skill, methods).filter((m) => recommendedAt(m, level, mode) || (m.id === input0.followed && availableAt(m, level, mode))).map((m) => viewMethod(m, state, input.prices)), coinRate).sort(cmp);
  const top = views.find((v) => !v.method.manualSetup && v.status !== 'LOCKED') ?? null;
  // S04: the method the game already follows stays the pick while it is ready and the new top is not materially faster
  // (the planner's switch threshold), so a level-up never flips the plan for a marginal gain.
  const running = input0.followed ? views.find((v) => v.method.id === input0.followed && v.status === 'READY') : undefined;
  const keep = running && top && running !== top && !losesTo(running.method, top.method, coinRate)
    && stays(goal, running.method, top.method, 1 / (1 - SWITCH_MARGIN));
  const pickV = keep ? running : top;
  const switched = running && top && !keep && running !== top ? ` Switched from ${running.method.name}: it is materially slower now.` : '';
  const said = (v: MethodView): MethodView => ({ ...v, reason: reasonFor(v, level) });
  const followedV = input0.followed ? views.find((v) => v.method.id === input0.followed && v !== pickV) ?? null : null;
  const others = views.filter((v) => v !== pickV && v !== followedV).slice(0, 3).map(said);
  const best = pickV;
  const quests = methodsFor(skill, methods).filter((m) => m.kind === 'quest' && m.from <= level && (m.to === null || level < m.to) && (mode === 'members' || !m.members));
  const forecast = buildPath(skill, level, target, input, best?.method ?? null, input0.methods ?? trainingMethods);
  const path = forecast.legs;
  if (forecast.handover) target = path[path.length - 1].toLevel;

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
  const upgradeMethod = best ? {
    ...best.method, upgrades: best.method.upgrades ?? combatUpgrades(best.method, skill, state, { prices: input.prices, restriction: input.restriction }),
  } : undefined;
  // Reuse the method's acquisition allowance; a trip already needed for its kit is not charged twice.
  const allowance = best ? Math.max(0, SETUP_HOURS - setupHours(best)) : SETUP_HOURS;
  const found = upgradeMethod ? toolUpgrade(upgradeMethod, (tool) => upgradeXp(tool, skill, mode, xpNow, methodXp, target), coinRate,
    (tool) => purchaseTripHours(best?.method.spot?.place, tool, input.prices, allowance)) : null;
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
  const reason = best ? reasonFor(best, level, upgrade) + switched : opensLater(methodsFor(skill, methods), level, mode, state) ?? 'The training engine has no method for this skill at this level and mode yet.';
  return {
    ...empty, target, ...(input.untilChange ? { next: forecast.handover ?? null } : {}), best: best ? { ...best, reason } : null, others, quests, path, xpLeft, actionsLeft, actionTarget, time, coins: forecast.coins, upgrade, reason,
    goalNeeds: (processingGoalNeeds(path, level, target, xpNow) ?? (skill === 'ranged' ? rangedGoalNeeds(path, state, xpNow, target, input.prices) : null)) ?? undefined,
    stockNeeds: trainingStockNeeds(path, skill, state, xpNow, input.prices),
    followed: followedV ? said(followedV) : null,
  };
}

/** "about 3–4 h" / "≈ 2 h"; under an hour — in minutes. */
export function formatHours(t: TimeEstimate): string {
  const f = (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : `${h < 10 ? Math.round(h * 10) / 10 : Math.round(h)} h`);
  if (t.minHours === t.maxHours || f(t.minHours) === f(t.maxHours)) return `${t.source === 'measured' ? '≈' : 'about'} ${f(t.maxHours)}`;
  return `about ${f(t.minHours)}–${f(t.maxHours)}`;
}

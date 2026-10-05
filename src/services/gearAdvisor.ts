// Gear analysis: what is worn, how hard it hits at your levels and what to do to get stronger —
// wear the best from the bag or bank, buy from a trader or at the exchange. The order: the free first, then the weapon
// (combat speed depends on it), the amulet, the armor. It buys and wears nothing — only advises and leads.
//
// Items, bonuses, speed, requirements and shops are from the OSRS Wiki (gear.json, npm run build-gear).
// Damage follows the wiki formulas ("Damage per second/Melee"): max hit, hit chance, average damage
// per second. The target is the step's opponent (monsters.json, its defence from the wiki), and without a step — a cow: this
// compares items with each other and does not promise an exact kill speed. An item is bought for the whole
// training, so the benefit is averaged over the nearest 10 Strength levels: the max hit grows
// in steps, and at the very current level the best sword may hit the same as the old one.

import gearJson from '../data/gear.json';
import monstersJson from '../data/monsters.json';
import type { Foe, FoeData, GameMode, GearData, GearPiece, GearSlot, Step } from '../types';
import { nameKey, type OwnedState } from '../lib/checklist';
import { matchStrict } from './locationResolver';
import type { GearState, NavTargetPayload } from './runeliteBridge';

export const gearData = gearJson as GearData;
export const gearById = new Map(gearData.items.map((i) => [i.id, i]));
const gearByName = new Map(gearData.items.map((i) => [nameKey(i.name), i]));

export const SLOTS: GearSlot[] = ['weapon', 'neck', 'head', 'body', 'legs', 'shield'];
export const SLOT_LABEL: Record<GearSlot, string> = {
  weapon: 'Weapon', neck: 'Amulet', head: 'Helm', body: 'Body', legs: 'Legs', shield: 'Shield',
};

/** The game slots (EquipmentInventorySlot in RuneLite) → the advisor slots. The others (cape, gloves…) are not analysed. */
const GAME_SLOT: Record<string, GearSlot> = { weapon: 'weapon', amulet: 'neck', head: 'head', body: 'body', legs: 'legs', shield: 'shield' };

/** The weapons we advise buying. Axes and pickaxes are tools: we recognise them as weapons but do not advise them. */
const WEAPON_KINDS = new Set(['dagger', 'sword', 'scimitar', 'longsword', 'mace', 'warhammer', 'battleaxe', '2h sword']);

export const foeData = monstersJson as FoeData;
const foeByName = new Map(foeData.foes.map((f) => [f.name, f]));
/** Without a step we compare with a cow — the first opponent of the route (S1-13). */
export const DEFAULT_FOE: Foe = foeByName.get('Cow')!;

/** The step's opponents from monsters.json; a step without them is not about melee. */
export function stepFoes(step: Pick<Step, 'foes'>): Foe[] {
  return (step.foes ?? []).map((n) => foeByName.get(n)).filter((f): f is Foe => Boolean(f));
}

export interface Levels { attack: number; strength: number; defence: number; prayer?: number; ranged?: number; magic?: number }

// ---------------------------------------------------------------------------
// Damage (OSRS Wiki, Damage per second/Melee)

/** A neutral target for checking the formulas: Defence 1, defence bonuses 0. */
export const TARGET = { defenceLevel: 1, defenceBonus: 0 };
const TICK = 0.6;
/** Without a weapon — fists: no bonuses, a hit every 4 ticks (OSRS Wiki, Unarmed). */
const UNARMED_SPEED = 4;
/** Over how many Strength levels an item's benefit is averaged (the current and the following). */
export const WINDOW = 10;

export type Style = 'accurate' | 'aggressive';
export type AttackType = 'stab' | 'slash' | 'crush';

/**
 * The Accurate and Aggressive styles of the weapon categories (OSRS Wiki, Weapon types / {{CombatStyles}}) and the hit type
 * of each. Controlled and Defensive are no better for damage — we do not count them.
 */
const STYLES: Record<string, { type: AttackType; style: Style }[]> = {
  'stab sword': [{ type: 'stab', style: 'accurate' }, { type: 'stab', style: 'aggressive' }, { type: 'slash', style: 'aggressive' }],
  'slash sword': [{ type: 'slash', style: 'accurate' }, { type: 'slash', style: 'aggressive' }],
  spiked: [{ type: 'crush', style: 'accurate' }, { type: 'crush', style: 'aggressive' }],
  blunt: [{ type: 'crush', style: 'accurate' }, { type: 'crush', style: 'aggressive' }],
  axe: [{ type: 'slash', style: 'accurate' }, { type: 'slash', style: 'aggressive' }, { type: 'crush', style: 'aggressive' }],
  '2h sword': [{ type: 'slash', style: 'accurate' }, { type: 'slash', style: 'aggressive' }, { type: 'crush', style: 'aggressive' }],
  pickaxe: [{ type: 'stab', style: 'accurate' }, { type: 'stab', style: 'aggressive' }, { type: 'crush', style: 'aggressive' }],
  unarmed: [{ type: 'crush', style: 'accurate' }, { type: 'crush', style: 'aggressive' }],
};
/** The weapon category by the item kind (the same place on the wiki). */
const CATEGORY: Record<string, string> = {
  dagger: 'stab sword', sword: 'stab sword', scimitar: 'slash sword', longsword: 'slash sword',
  mace: 'spiked', warhammer: 'blunt', battleaxe: 'axe', axe: 'axe', '2h sword': '2h sword', pickaxe: 'pickaxe',
};

export interface MeleeResult {
  maxHit: number;
  hitChance: number;
  /** Average damage per second. */
  dps: number;
  /** The style with higher damage: Accurate (+3 attack) or Aggressive (+3 strength). */
  style: Style;
  /** The hit type of this style: stab, slash or crush. */
  type?: AttackType;
  /** Seconds between hits. */
  speed: number;
}

export interface Prayers { attack?: number; strength?: number }

/** Damage with one style. All roundings as on the wiki: down, at each step. target — the target's defence. */
export function meleeHit(
  lv: Levels, attackBonus: number, strengthBonus: number, speedTicks: number, style: Style, prayers: Prayers = {},
  target: { defenceLevel: number; defenceBonus: number } = TARGET,
): MeleeResult {
  const effStr = Math.floor(lv.strength * (prayers.strength ?? 1)) + (style === 'aggressive' ? 3 : 0) + 8;
  const maxHit = Math.floor((effStr * (strengthBonus + 64) + 320) / 640);
  const effAtt = Math.floor(lv.attack * (prayers.attack ?? 1)) + (style === 'accurate' ? 3 : 0) + 8;
  const attRoll = effAtt * (attackBonus + 64);
  const defRoll = (target.defenceLevel + 9) * (target.defenceBonus + 64);
  const hitChance = attRoll > defRoll ? 1 - (defRoll + 2) / (2 * (attRoll + 1)) : attRoll / (2 * (defRoll + 1));
  const perAttack = hitChance * (maxHit / 2 + 1 / (maxHit + 1));
  return { maxHit, hitChance, dps: perAttack / (speedTicks * TICK), style, speed: speedTicks * TICK };
}

/**
 * The best weapon style (null — no weapon) with an amulet against an opponent: the Accurate and
 * Aggressive styles of the weapon category are tried, each has its own hit type — and the opponent's own defence against it.
 */
export function meleeWith(lv: Levels, weapon: GearPiece | null, neck: GearPiece | null, prayers: Prayers = {}, foe: Foe = DEFAULT_FOE): MeleeResult {
  const styles = STYLES[weapon ? CATEGORY[weapon.kind] ?? 'unarmed' : 'unarmed'];
  const strength = (weapon?.strength ?? 0) + (neck?.strength ?? 0);
  const speed = weapon?.speed ?? UNARMED_SPEED;
  let best: MeleeResult | null = null;
  for (const { type, style } of styles) {
    const attack = (weapon?.attack[type] ?? 0) + (neck?.attack[type] ?? 0);
    const r = meleeHit(lv, attack, strength, speed, style, prayers, { defenceLevel: foe.defenceLevel, defenceBonus: foe.defence[type] });
    if (!best || r.dps > best.dps) best = { ...r, type };
  }
  return best!;
}

/**
 * The value of a weapon and amulet for training: damage per second averaged over the current and following Strength levels
 * (up to 99) and over all the step's opponents. So the max hit steps do not hide an item's benefit.
 */
export function meleeValue(lv: Levels, weapon: GearPiece | null, neck: GearPiece | null, foes: readonly Foe[] = [DEFAULT_FOE]): number {
  let sum = 0;
  let n = 0;
  for (const foe of foes.length ? foes : [DEFAULT_FOE]) {
    for (let s = lv.strength; s <= Math.min(99, lv.strength + WINDOW - 1); s++) {
      sum += meleeWith({ ...lv, strength: s }, weapon, neck, {}, foe).dps;
      n++;
    }
  }
  return sum / n;
}

const defenceSum = (p: GearPiece | null) => (p ? p.defence.stab + p.defence.slash + p.defence.crush : 0);

/**
 * The first estimate of a combat step's pace: seconds per opponent — its health divided by the damage per second
 * of the current weapon and amulet at the current levels (against the step's first opponent). Walking between fights
 * is not included, so the estimate is rather fast — in the game a measurement will replace it. null — the step has no opponent,
 * the gear from the game did not come or the weapon in hand is unknown to the app: we do not invent the time then.
 */
export function killSeconds(step: Pick<Step, 'foes'>, levels: Partial<Record<string, number>>, gear: GearState | null, data: GearData = gearData): number | null {
  const foe = stepFoes(step)[0];
  if (!foe || !gear?.equipment) return null;
  const equipped = equippedBySlot(gear, data);
  if (equipped.weapon && !equipped.weapon.piece) return null;
  const r = meleeWith(levelsOf(levels), equipped.weapon?.piece ?? null, equipped.neck?.piece ?? null, {}, foe);
  return r.dps > 0 ? foe.hitpoints / r.dps : null;
}

const COMBAT = new Set(['attack', 'strength', 'defence']);

/**
 * A step for the game with the first estimate of the combat pace: seconds per opponent by the current weapon and levels (killSeconds).
 * The plugin shows it marked "estimate" until it collects its own measurements. No estimate — the step as is.
 */
export function withKillEstimate(step: Step, levels: Partial<Record<string, number>>, gear: GearState | null): Step {
  const p = step.pacing;
  if (!p || !COMBAT.has(p.skill) || p.secondsPerAction !== undefined) return step;
  const sec = killSeconds(step, levels, gear);
  // The plugin accepts up to 10 minutes per action; longer is not a pace but an unsuitable weapon.
  if (sec === null || !(sec > 0) || sec > 600) return step;
  return { ...step, pacing: { ...p, secondsPerAction: Math.round(sec * 10) / 10 } };
}

// ---------------------------------------------------------------------------
// Analysis

export type Source =
  | { kind: 'bag' }
  | { kind: 'bank' }
  | { kind: 'shop'; shop: string; location: string; price: number; npc?: string; coords?: { x: number; y: number; plane: number }; toll?: number }
  | { kind: 'ge'; price?: number };

export type Gain =
  | { kind: 'dps'; before: MeleeResult; after: MeleeResult; ratio: number; defenceBefore?: number; defenceAfter?: number }
  | { kind: 'defence'; before: number; after: number };

export interface GearAction {
  slot: GearSlot;
  item: GearPiece;
  /** What is in this slot now: a known item, an unknown one (a name only) or empty. */
  current: GearPiece | null;
  currentName?: string;
  how: 'wear' | 'buy';
  source: Source;
  /** Other places to get it (for "or at the exchange"). */
  alternatives: Source[];
  /** The price of the chosen source; 0 — already have; null — the price is unknown. */
  cost: number | null;
  gain: Gain;
  /** By the route this item is bought at a step anyway (the step code). */
  routeStep?: string;
  /** Takes both hands — the shield will have to be taken off. */
  twoHanded?: boolean;
  /** How many coins are missing (for "save up" goals). */
  short?: number;
}

export interface Unlock { item: GearPiece; skill: 'attack' | 'defence' | 'strength'; level: number; have: number }

/**
 * An item better than the worn one that cannot be worn yet: levels or a quest are missing. Shown with a lock
 * "🔒 needs 20 Ranged (now 17)" — instead of silence or advice that cannot be worn.
 */
export interface LockedItem {
  slot: GearSlot;
  item: GearPiece;
  current: GearPiece | null;
  currentName?: string;
  gain: Gain;
  missing: MissingRequirement[];
  /** Already in the bag or bank but cannot be worn yet. */
  owned?: 'bag' | 'bank';
}

/** The lock is shown if the item is at most this many levels away (or already owned) — it is a near goal, not a dream. */
export const LOCK_NEAR = 10;

export interface Equipped { piece: GearPiece | null; id: number; name: string }

export interface GearAdvice {
  /** Whether there is data from the game (worn, bag). */
  live: boolean;
  levels: Levels;
  equipped: Partial<Record<GearSlot, Equipped>>;
  coins: { bag: number | null; bank: number | null; total: number | null };
  /** What the weapon was compared with: the step's opponents or a cow. */
  foes: Foe[];
  /** Damage now — against the first of them, at the current levels. */
  weaponNow: MeleeResult;
  /** The weapon in hand is unknown to the app — the damage "now" is computed without it. */
  weaponUnknown?: string;
  /** Do now for speed: wear the best of what you already have, buy a weapon and an amulet. */
  actions: GearAction[];
  /** Armor within means — from what is left after the weapon and amulet. It does not speed up combat, but saves food. */
  armour: GearAction[];
  /** Better than what is possible now: not enough coins. */
  goals: GearAction[];
  unlocks: Unlock[];
  /** Better than worn but cannot be worn yet: one per slot, first what is already in the bag or bank. */
  locked: LockedItem[];
  /** The prayers for strength and attack that are already unlocked. */
  prayers: { name: string; level: number; effect: string; maxHit?: number }[];
}

export interface AdvisorInput {
  levels: Partial<Record<string, number>>;
  gear: GearState | null;
  owned?: OwnedState | null;
  mode: GameMode;
  /** Exchange prices by ID. */
  gePrices?: ReadonlyMap<number, number>;
  /** The Al Kharid toll gate is free (Prince Ali Rescue is done). */
  freeToll?: boolean;
  /** Which items the route still buys: nameKey → step code. */
  routeNeeds?: ReadonlyMap<string, string>;
  /** The step's opponents (stepFoes): the weapon is compared with them. Empty — a cow. */
  foes?: readonly Foe[];
  /** Completed quests. An item with a quest in its requirements (Rune platebody — Dragon Slayer I) is not advised without it. */
  questsDone?: ReadonlySet<string>;
  data?: GearData;
}

/** The gate between Lumbridge and Al Kharid: 10 coins, free after Prince Ali Rescue (OSRS Wiki, Al Kharid). */
export const TOLL = 10;

/** Levels with a default: without data — 1 (so the advice does not promise what cannot be worn yet). */
function levelsOf(raw: Partial<Record<string, number>>): Levels {
  const n = (k: string) => (typeof raw[k] === 'number' && raw[k]! >= 1 ? raw[k]! : 1);
  const opt = (k: 'prayer' | 'ranged' | 'magic') => (typeof raw[k] === 'number' && raw[k]! >= 1 ? { [k]: raw[k] } : {});
  return { attack: n('attack'), strength: n('strength'), defence: n('defence'), ...opt('prayer'), ...opt('ranged'), ...opt('magic') };
}

const REQ_SKILLS = ['attack', 'strength', 'defence', 'ranged', 'magic', 'prayer'] as const;
const SKILL_EN: Record<(typeof REQ_SKILLS)[number], string> = {
  attack: 'Attack', strength: 'Strength', defence: 'Defence', ranged: 'Ranged', magic: 'Magic', prayer: 'Prayer',
};

export type MissingRequirement =
  | { kind: 'skill'; skill: (typeof REQ_SKILLS)[number]; need: number; have: number }
  | { kind: 'quest'; quest: string };

/**
 * What is missing to wear: the levels of all combat skills and the quests. An unknown level counts as the first,
 * an unknown quest as not done: the advice must not promise what may not be wearable.
 */
export function missingRequirements(p: GearPiece, lv: Levels, quests: ReadonlySet<string> = new Set()): MissingRequirement[] {
  const r = p.req ?? {};
  const out: MissingRequirement[] = [];
  for (const skill of REQ_SKILLS) {
    const need = r[skill] ?? 1;
    const have = lv[skill] ?? 1;
    if (need > have) out.push({ kind: 'skill', skill, need, have });
  }
  for (const quest of r.quests ?? []) if (!quests.has(quest)) out.push({ kind: 'quest', quest });
  return out;
}

export function canWear(p: GearPiece, lv: Levels, quests?: ReadonlySet<string>): boolean {
  return missingRequirements(p, lv, quests).length === 0;
}

/** "20 Ranged (now 17), quest Dragon Slayer I" — what is missing for the item. */
export function missingText(missing: MissingRequirement[]): string {
  return missing.map((m) => (m.kind === 'skill' ? `${m.need} ${SKILL_EN[m.skill]} (now ${m.have})` : `quest ${m.quest}`)).join(', ');
}

function pieceOf(id: number, name: string, data: GearData): GearPiece | null {
  return (data === gearData ? gearById.get(id) ?? gearByName.get(nameKey(name)) : data.items.find((i) => i.id === id || nameKey(i.name) === nameKey(name))) ?? null;
}

/** Worn items by slot: the slot from the game, and for an old plugin (no slot) — from the item database. */
function equippedBySlot(gear: GearState | null, data: GearData): Partial<Record<GearSlot, Equipped>> {
  const out: Partial<Record<GearSlot, Equipped>> = {};
  for (const it of gear?.equipment ?? []) {
    const piece = pieceOf(it.id, it.name, data);
    const slot = it.slot ? GAME_SLOT[it.slot] : piece?.slot;
    if (slot && !out[slot]) out[slot] = { piece, id: it.id, name: it.name };
  }
  return out;
}

/** Shops reachable with the arrow: they are in the place dictionary. The others (guilds, Wilderness) we do not advise. */
function shopsOf(p: GearPiece, freeToll: boolean): Extract<Source, { kind: 'shop' }>[] {
  const out: Extract<Source, { kind: 'shop' }>[] = [];
  for (const s of p.shops ?? []) {
    const place = matchStrict(s.shop);
    if (!place) continue;
    out.push({
      kind: 'shop', shop: s.shop, location: s.location, price: s.price,
      ...(s.owner ? { npc: s.owner } : {}),
      coords: { x: place.x, y: place.y, plane: place.plane },
      ...(s.location === 'Al Kharid' && !freeToll ? { toll: TOLL } : {}),
    });
  }
  return out.sort((a, b) => a.price - b.price);
}

/** Where the item already is: in the bag or in the bank (by the plugin's count). Unknown or no — undefined. */
function ownedWhere(p: GearPiece, input: AdvisorInput): 'bag' | 'bank' | undefined {
  if (input.gear?.inventory?.some((i) => i.id === p.id || nameKey(i.name) === nameKey(p.name))) return 'bag';
  const bank = input.owned?.items.get(nameKey(p.name))?.bank;
  return bank && bank > 0 ? 'bank' : undefined;
}

/** Comparing ranks by the order of numbers: a before b. */
function lexLess(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

/** Where to get the item: bag, bank, shops, exchange — the free first, then the cheap. */
function sourcesOf(p: GearPiece, input: AdvisorInput): Source[] {
  const out: Source[] = [];
  if (input.gear?.inventory?.some((i) => i.id === p.id || nameKey(i.name) === nameKey(p.name))) out.push({ kind: 'bag' });
  const bank = input.owned?.items.get(nameKey(p.name))?.bank;
  if (bank && bank > 0) out.push({ kind: 'bank' });
  const shops = shopsOf(p, Boolean(input.freeToll));
  const ge: Source[] = p.tradeable ? [{ kind: 'ge', ...(input.gePrices?.has(p.id) ? { price: input.gePrices.get(p.id) } : {}) }] : [];
  const priced = [...shops, ...ge].sort((a, b) => priceOf(a, Infinity) - priceOf(b, Infinity));
  // A shop slightly dearer than the exchange — the shop first: the price is exact, there is no waiting for a deal, and at the start of the route
  // it is usually near (Zeke — by the cow pen beyond the Al Kharid gate, the exchange — in Varrock). The exchange stays as "or …".
  const cheapest = priced[0];
  if (cheapest?.kind === 'ge' && cheapest.price !== undefined) {
    const shop = priced.find((s) => s.kind === 'shop' && priceOf(s, Infinity) - cheapest.price! < SAVE_GP);
    if (shop) priced.splice(0, priced.length, shop, ...priced.filter((s) => s !== shop));
  }
  return [...out, ...priced];
}

/** The source price: for a shop — with the toll; free — 0; unknown — fallback. */
function priceOf(s: Source, fallback: number): number {
  if (s.kind === 'bag' || s.kind === 'bank') return 0;
  if (s.kind === 'shop') return s.price + (s.toll ?? 0);
  return s.price ?? fallback;
}

function allowed(p: GearPiece, lv: Levels, mode: GameMode, quests?: ReadonlySet<string>): boolean {
  return (!p.members || mode === 'members') && !p.reqUnverified && canWear(p, lv, quests);
}

/** Attack and strength prayers by prayer level (OSRS Wiki: the level and multiplier of each). */
const PRAYERS: { name: string; level: number; kind: 'attack' | 'strength'; mult: number; effect: string }[] = [
  { name: 'Burst of Strength', level: 4, kind: 'strength', mult: 1.05, effect: '+5% Strength' },
  { name: 'Clarity of Thought', level: 7, kind: 'attack', mult: 1.05, effect: '+5% Attack' },
  { name: 'Superhuman Strength', level: 13, kind: 'strength', mult: 1.1, effect: '+10% Strength' },
  { name: 'Improved Reflexes', level: 16, kind: 'attack', mult: 1.1, effect: '+10% Attack' },
  { name: 'Ultimate Strength', level: 31, kind: 'strength', mult: 1.15, effect: '+15% Strength' },
  { name: 'Incredible Reflexes', level: 34, kind: 'attack', mult: 1.15, effect: '+15% Attack' },
];

/**
 * From what benefit we advise: damage per second at least +3% (averaged over the training), defence — at least +3.
 * The threshold is low on purpose: any speed-up is worth showing, and the percent in the advice says how big it is.
 */
const WORTH = { dps: 1.03, defence: 3 };
/** Among nearly equal ones we take the cheap one if it is at least twice as cheap and saves at least this much. */
export const SAVE_GP = 100;

export function adviseGear(input: AdvisorInput): GearAdvice {
  const data = input.data ?? gearData;
  const lv = levelsOf(input.levels);
  const equipped = equippedBySlot(input.gear, data);
  const live = Boolean(input.gear && (input.gear.equipment || input.gear.inventory));
  const bag = input.gear?.coins ?? null;
  const bank = input.gear?.bankCoins ?? null;
  const total = bag === null && bank === null ? null : (bag ?? 0) + (bank ?? 0);

  const weapon = equipped.weapon;
  const weaponPiece = weapon?.piece ?? null;
  const neckPiece = equipped.neck?.piece ?? null;
  const foes = input.foes?.length ? [...input.foes] : [DEFAULT_FOE];
  const weaponNow = meleeWith(lv, weaponPiece, neckPiece, {}, foes[0]);
  const valueNow = meleeValue(lv, weaponPiece, neckPiece, foes);
  const candidates: GearAction[] = [];

  const route = (p: GearPiece) => input.routeNeeds?.get(nameKey(p.name));

  // Weapon: the best damage per second at your levels. A weapon in hand unknown to the app cannot be compared —
  // then the damage "now" is counted without it, and the advice text speaks only about the new weapon (gainText).
  /**
   * How an item is better than the worn one in the slot — or null if not better by the advice thresholds. A weapon — damage per second;
   * an amulet — damage with the weapon in hand, and for defence — only if the damage does not drop; armor — the sum of defence against
   * stab, slash and crush hits.
   */
  function gainOf(slot: GearSlot, p: GearPiece, cur: Equipped | undefined): Gain | null {
    if (slot === 'weapon') {
      const ratio = meleeValue(lv, p, neckPiece, foes) / valueNow;
      return ratio < WORTH.dps ? null : { kind: 'dps', before: weaponNow, after: meleeWith(lv, p, neckPiece, {}, foes[0]), ratio };
    }
    if (slot === 'neck') {
      const ratio = meleeValue(lv, weaponPiece, p, foes) / valueNow;
      const defBefore = defenceSum(neckPiece);
      const defAfter = defenceSum(p);
      if (!(ratio >= WORTH.dps || (ratio >= 0.999 && defAfter - defBefore >= WORTH.defence))) return null;
      return { kind: 'dps', before: weaponNow, after: meleeWith(lv, weaponPiece, p, {}, foes[0]), ratio, defenceBefore: defBefore, defenceAfter: defAfter };
    }
    const before = defenceSum(cur?.piece ?? null);
    const after = defenceSum(p);
    return after - before < WORTH.defence ? null : { kind: 'defence', before, after };
  }

  for (const slot of SLOTS) {
    const cur = equipped[slot];
    for (const p of data.items) {
      if (p.slot !== slot || (slot === 'weapon' && !WEAPON_KINDS.has(p.kind)) || !allowed(p, lv, input.mode, input.questsDone)) continue;
      if (cur && p.id === cur.id) continue;
      const gain = gainOf(slot, p, cur);
      if (gain) candidates.push(action(slot, p, cur, gain, input, route(p)));
    }
  }

  // In each slot — one best "wear" (free) and one best purchase by money.
  // Damage matters more than defence: an amulet's defence decides only at equal damage. Otherwise the +6 defence of the Amulet of power
  // outweighed the 3% damage of the Amulet of strength, and the amulet advice depended on random numbers.
  const score = (a: GearAction) => (a.gain.kind === 'dps' ? Math.round(a.gain.ratio * 1000) * 1000 + (a.gain.defenceAfter ?? 0) : a.gain.after);
  /** b is noticeably better than a — by the same thresholds as the advice in general. Otherwise it is not worth paying for the difference. */
  const better = (b: GearAction, a: GearAction) => (b.gain.kind === 'dps' && a.gain.kind === 'dps'
    ? b.gain.ratio >= a.gain.ratio * WORTH.dps
      || (b.gain.ratio >= a.gain.ratio * 0.999 && (b.gain.defenceAfter ?? 0) - (a.gain.defenceAfter ?? 0) >= WORTH.defence)
    : score(b) - score(a) >= WORTH.defence);
  const actions: GearAction[] = [];
  const armour: GearAction[] = [];
  const goals: GearAction[] = [];
  let left = total ?? 0;
  const order: GearSlot[] = ['weapon', 'neck', 'body', 'legs', 'head', 'shield'];
  // First what is already owned: wear it for free.
  const wearBest = new Map<GearSlot, GearAction>();
  for (const a of candidates.filter((c) => c.how === 'wear')) {
    const cur = wearBest.get(a.slot);
    if (!cur || score(a) > score(cur)) wearBest.set(a.slot, a);
  }
  for (const slot of order) if (wearBest.has(slot)) actions.push(wearBest.get(slot)!);
  const best = (list: GearAction[]) => list.reduce((a, b) => (score(b) > score(a) || (score(b) === score(a) && (b.cost ?? Infinity) < (a.cost ?? Infinity)) ? b : a));
  /**
   * What to choose from the list: the strongest, but among nearly equal ones — what the route buys anyway (this money
   * is not extra), and a noticeably cheaper one — only if the saving is real, not 30 coins for a worse item.
   */
  const choose = (list: GearAction[]): GearAction => {
    const strongest = best(list);
    const near = list.filter((a) => !better(strongest, a));
    const onRoute = near.filter((a) => a.routeStep);
    const pool = onRoute.length ? onRoute : near;
    const lead = best(pool);
    if (lead.cost === null) return lead;
    const cheap = pool.filter((a) => a.cost !== null && lead.cost! - a.cost >= SAVE_GP && a.cost * 2 <= lead.cost!);
    return cheap.length ? cheap.reduce((a, b) => (b.cost! < a.cost! || (b.cost === a.cost && score(b) > score(a)) ? b : a)) : lead;
  };
  // Then purchases: the best that the money covers — now; the best overall, if the money is not enough — the goal.
  // A purchase must be noticeably better than what can be worn for free.
  for (const slot of order) {
    const worn = wearBest.get(slot);
    const buys = candidates.filter((c) => c.slot === slot && c.how === 'buy' && (!worn || better(c, worn)));
    if (!buys.length) continue;
    const top = choose(buys);
    // "Missing" — from the money to the purchase in this slot: a cheap sword now does not make the goal more expensive.
    const budget = left;
    const affordable = total === null ? [] : buys.filter((b) => b.cost !== null && b.cost <= budget);
    const pick = affordable.length ? choose(affordable) : null;
    if (pick) {
      (slot === 'weapon' || slot === 'neck' ? actions : armour).push(pick);
      left -= pick.cost!;
    }
    const topAffordable = top.cost !== null && total !== null && top.cost <= budget;
    if (!topAffordable && (!pick || better(top, pick))) {
      goals.push({ ...top, ...(top.cost !== null && total !== null ? { short: top.cost - budget } : {}) });
    }
  }

  // What opens next: the scimitar and the armor of the next metal.
  const unlocks: Unlock[] = [];
  const nextOf = (kind: string, skill: 'attack' | 'defence') => data.items
    .filter((p) => p.kind === kind && !p.reqUnverified && (!p.members || input.mode === 'members') && (p.req?.[skill] ?? 1) > lv[skill])
    .sort((a, b) => (a.req?.[skill] ?? 1) - (b.req?.[skill] ?? 1))[0];
  const scim = nextOf('scimitar', 'attack');
  if (scim) unlocks.push({ item: scim, skill: 'attack', level: scim.req!.attack!, have: lv.attack });
  const plate = nextOf('platebody', 'defence');
  if (plate) unlocks.push({ item: plate, skill: 'defence', level: plate.req!.defence!, have: lv.defence });

  // Locks: better than worn by the same thresholds as the advice, but the requirements are not met. An item that is not
  // in the requirements database (reqUnverified) or not in the game mode is not shown as a lock — nothing is known about it.
  const locked: LockedItem[] = [];
  const lockBeats = (lock: Gain, g: Gain) => (lock.kind === 'dps' && g.kind === 'dps'
    ? lock.ratio >= g.ratio * WORTH.dps
    : lock.kind === 'defence' && g.kind === 'defence' ? lock.after - g.after >= WORTH.defence : true);
  for (const slot of order) {
    const cur = equipped[slot];
    const open = candidates.filter((c) => c.slot === slot);
    let pick: LockedItem | null = null;
    let pickRank: number[] = [];
    for (const p of data.items) {
      if (p.slot !== slot || p.reqUnverified || (p.members && input.mode !== 'members')) continue;
      if (slot === 'weapon' && !WEAPON_KINDS.has(p.kind)) continue;
      if (cur && p.id === cur.id) continue;
      const missing = missingRequirements(p, lv, input.questsDone);
      if (!missing.length) continue;
      const gain = gainOf(slot, p, cur);
      if (!gain) continue;
      const owned = ownedWhere(p, input);
      // Not from the bag or bank — only if it is noticeably better than what can be worn or bought right now:
      // a lock on an item equal to an available one is extra noise.
      if (!owned && open.some((a) => !lockBeats(gain, a.gain))) continue;
      const gap = missing.reduce((s, m) => s + (m.kind === 'skill' ? m.need - m.have : 0), 0);
      if (!owned && gap > LOCK_NEAR) continue;
      // First what is already owned, then the nearest by levels, among equals — the strongest.
      const rank = [owned ? 0 : 1, gap, -(gain.kind === 'dps' ? gain.ratio * 1000 : gain.after)];
      if (pick && !lexLess(rank, pickRank)) continue;
      pick = {
        slot, item: p, current: cur?.piece ?? null, ...(cur && !cur.piece ? { currentName: cur.name } : {}),
        gain, missing, ...(owned ? { owned } : {}),
      };
      pickRank = rank;
    }
    if (pick) locked.push(pick);
  }

  // Prayers: the best unlocked for strength and for attack; how much it adds to a hit with the weapon in hand.
  const prayers: GearAdvice['prayers'] = [];
  for (const kind of ['strength', 'attack'] as const) {
    const open = PRAYERS.filter((p) => p.kind === kind && (lv.prayer ?? 1) >= p.level).pop();
    if (!open) continue;
    const boosted = meleeWith(lv, weaponPiece, neckPiece, { [kind]: open.mult }, foes[0]);
    prayers.push({ name: open.name, level: open.level, effect: open.effect, ...(boosted.maxHit > weaponNow.maxHit ? { maxHit: boosted.maxHit } : {}) });
  }

  return {
    live,
    levels: lv,
    equipped,
    coins: { bag, bank, total },
    foes,
    weaponNow,
    ...(weapon && !weaponPiece ? { weaponUnknown: weapon.name } : {}),
    actions,
    armour,
    goals,
    unlocks,
    locked,
    prayers,
  };

  function action(slot: GearSlot, p: GearPiece, cur: Equipped | undefined, gain: Gain, inp: AdvisorInput, routeStep: string | undefined): GearAction {
    const sources = sourcesOf(p, inp);
    const source = sources[0] ?? { kind: 'ge' as const };
    const how = source.kind === 'bag' || source.kind === 'bank' ? 'wear' : 'buy';
    const cost = how === 'wear' ? 0 : source.kind === 'shop' ? source.price + (source.toll ?? 0) : source.kind === 'ge' && source.price !== undefined ? source.price : null;
    return {
      slot, item: p,
      current: cur?.piece ?? null,
      ...(cur && !cur.piece ? { currentName: cur.name } : {}),
      how, source,
      alternatives: sources.slice(1).filter((s) => s.kind !== 'bag' && s.kind !== 'bank'),
      cost, gain,
      ...(routeStep ? { routeStep } : {}),
      ...(p.twoHanded ? { twoHanded: true } : {}),
    };
  }
}

// ---------------------------------------------------------------------------
// Texts and goals

const gp = (n: number) => n.toLocaleString('en-US');
const pct = (r: number) => `${Math.round((r - 1) * 100)}%`;

/** "max hit 3 instead of 2, damage per second +45%" — how the action is better. */
export function gainText(a: Pick<GearAction, 'gain' | 'slot' | 'currentName'>): string {
  const g = a.gain;
  if (g.kind === 'defence') return `defence +${g.after - g.before} (${g.before} → ${g.after})`;
  // What is in hand now is unknown to the app: there is nothing to compare with, we speak only about the new weapon.
  if (a.currentName && a.slot === 'weapon') {
    return `max hit ${g.after.maxHit}, once every ${g.after.speed.toFixed(1)} s — compare with ${a.currentName} in the Equipment Stats tab`;
  }
  const parts: string[] = [];
  if (g.after.maxHit !== g.before.maxHit) parts.push(`max hit ${g.after.maxHit} instead of ${g.before.maxHit}`);
  if (Math.abs(g.after.speed - g.before.speed) > 0.01) parts.push(`one hit every ${g.after.speed.toFixed(1)} s instead of ${g.before.speed.toFixed(1)} s`);
  if (g.ratio >= 1.01) parts.push(`damage per second +${pct(g.ratio)}`);
  if (g.defenceAfter !== undefined && g.defenceBefore !== undefined && g.defenceAfter > g.defenceBefore) parts.push(`defence +${g.defenceAfter - g.defenceBefore}`);
  return parts.join(', ') || 'slightly stronger';
}

/** The item itself, without a comparison: when it is unknown what is worn now (no link with the game). */
export function statsText(a: Pick<GearAction, 'gain' | 'slot' | 'item'>): string {
  const g = a.gain;
  if (g.kind === 'defence') return `defence ${g.after}`;
  if (a.slot === 'neck') {
    // For an amulet — its bonuses: a hit with an unknown weapon says nothing.
    const p = a.item;
    const accuracy = Math.max(p.attack.stab, p.attack.slash, p.attack.crush);
    const parts = [p.strength && `strength +${p.strength}`, accuracy && `accuracy +${accuracy}`, defenceSum(p) && `defence +${defenceSum(p)}`];
    return parts.filter(Boolean).join(', ');
  }
  return `max hit ${g.after.maxHit}, once every ${g.after.speed.toFixed(1)} s`;
}

/** Where to get it: "from Zeke in Al Kharid — 400 gp (+10 gp toll)", "in the bank", "on the exchange ~350 gp". */
export function sourceText(s: Source): string {
  if (s.kind === 'bag') return 'already in the bag';
  if (s.kind === 'bank') return 'in the bank';
  if (s.kind === 'ge') return s.price !== undefined ? `on the exchange ~${gp(s.price)} gp` : 'on the exchange (the price did not load)';
  return `${s.npc ? `from ${s.npc} at ` : 'at '}${s.shop} (${s.location}) — ${gp(s.price)} gp${s.toll ? ` + ${s.toll} gp toll into Al Kharid` : ''}`;
}

/** A short line for the HUD in the game: one main action. */
export function hudHint(a: GearAction): string {
  if (a.how === 'wear') return `⚡ Wear ${a.item.name} — ${a.source.kind === 'bank' ? 'it is in the bank' : 'it is in the bag'}`;
  const s = a.source;
  if (s.kind === 'shop') return `⚡ Stronger: ${a.item.name} from ${s.npc ?? s.shop} (${s.location}), ${gp(s.price)} gp`;
  return `⚡ Stronger: ${a.item.name} on the exchange${s.kind === 'ge' && s.price !== undefined ? `, ~${gp(s.price)} gp` : ''}`;
}

/** Where to lead the arrow for a purchase: a shop (the seller is highlighted) or the exchange. For "wear" — nowhere. */
export function actionNav(a: GearAction, stepId?: string): NavTargetPayload | null {
  if (a.how !== 'buy') return null;
  const item = { itemName: a.item.name, itemId: a.item.id, ...(stepId ? { stepId } : {}) };
  const s = a.source;
  if (s.kind === 'shop' && s.coords) return { label: s.shop, ...s.coords, ...(s.npc ? { npcNames: [s.npc] } : {}), ...item };
  const ge = matchStrict('Grand Exchange');
  return ge ? { label: 'Grand Exchange', x: ge.x, y: ge.y, plane: ge.plane, npcNames: ['Grand Exchange Clerk'], ...item } : null;
}

/**
 * Which items to ask the plugin about (the bank count comes only by names): everything that can be worn
 * at the current levels and is better than the worn one — 3 per slot, to keep the list short.
 */
export function watchNames(input: AdvisorInput, limit = 3): string[] {
  const data = input.data ?? gearData;
  const lv = levelsOf(input.levels);
  const equipped = equippedBySlot(input.gear, data);
  const foes = input.foes?.length ? input.foes : [DEFAULT_FOE];
  const out: string[] = [];
  for (const slot of SLOTS) {
    const cur = equipped[slot]?.piece ?? null;
    const neck = equipped.neck?.piece ?? null;
    const weapon = equipped.weapon?.piece ?? null;
    const known = new Map<GearPiece | null, number>();
    const value = (p: GearPiece | null) => {
      if (!known.has(p)) {
        known.set(p, slot === 'weapon' ? meleeValue(lv, p, neck, foes) : slot === 'neck' ? meleeValue(lv, weapon, p, foes) * 1000 + defenceSum(p) : defenceSum(p));
      }
      return known.get(p)!;
    };
    const list = data.items
      .filter((p) => p.slot === slot && (slot !== 'weapon' || WEAPON_KINDS.has(p.kind)) && allowed(p, lv, input.mode, input.questsDone) && value(p) > value(cur))
      .sort((a, b) => value(b) - value(a))
      .slice(0, limit)
      .map((p) => p.name);
    out.push(...list);
  }
  return out;
}

/** The items the route still buys (shopping steps not yet done): nameKey → step code. */
export function routeNeeds(steps: { id: string; type: string; itemsRequired?: { nameEn: string }[] }[], closed: (id: string) => boolean): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of steps) {
    if (s.type !== 'gear' || closed(s.id)) continue;
    for (const it of s.itemsRequired ?? []) if (!out.has(nameKey(it.nameEn))) out.set(nameKey(it.nameEn), s.id);
  }
  return out;
}

// Разбор снаряжения: что надето, насколько сильно оно бьёт при твоих уровнях и что сделать, чтобы стать сильнее —
// надеть лучшее из сумки или банка, купить у торговца или на бирже. Порядок: сначала бесплатное, потом оружие
// (от него зависит скорость боя), амулет, броня. Ничего не покупает и не надевает — только советует и ведёт.
//
// Предметы, бонусы, скорость, требования и магазины — из OSRS Wiki (gear.json, npm run build-gear).
// Урон — по формулам вики («Damage per second/Melee»): максимальный удар, шанс попадания, средний урон
// в секунду. Цель — противник шага (monsters.json, его защита с вики), а без шага — корова: так
// сравниваются предметы между собой, а не обещается точная скорость убийства. Предмет покупают на всю
// прокачку, поэтому выгода считается в среднем на ближайших 10 уровнях силы: максимальный удар растёт
// ступеньками, и на самом текущем уровне лучший меч может бить так же, как старый.

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
  weapon: 'Оружие', neck: 'Амулет', head: 'Шлем', body: 'Торс', legs: 'Ноги', shield: 'Щит',
};

/** Слоты игры (EquipmentInventorySlot в RuneLite) → слоты советника. Остальные (плащ, перчатки…) не разбираем. */
const GAME_SLOT: Record<string, GearSlot> = { weapon: 'weapon', amulet: 'neck', head: 'head', body: 'body', legs: 'legs', shield: 'shield' };

/** Оружие, которое советуем покупать. Топоры и кирки — инструменты: как оружие их узнаём, но не советуем. */
const WEAPON_KINDS = new Set(['dagger', 'sword', 'scimitar', 'longsword', 'mace', 'warhammer', 'battleaxe', '2h sword']);

export const foeData = monstersJson as FoeData;
const foeByName = new Map(foeData.foes.map((f) => [f.name, f]));
/** Без шага сравниваем с коровой — первым противником маршрута (S1-13). */
export const DEFAULT_FOE: Foe = foeByName.get('Cow')!;

/** Противники шага из monsters.json; шаг без них — не про ближний бой. */
export function stepFoes(step: Pick<Step, 'foes'>): Foe[] {
  return (step.foes ?? []).map((n) => foeByName.get(n)).filter((f): f is Foe => Boolean(f));
}

export interface Levels { attack: number; strength: number; defence: number; prayer?: number; ranged?: number; magic?: number }

// ---------------------------------------------------------------------------
// Урон (OSRS Wiki, Damage per second/Melee)

/** Нейтральная цель для проверки формул: Defence 1, защитные бонусы 0. */
export const TARGET = { defenceLevel: 1, defenceBonus: 0 };
const TICK = 0.6;
/** Без оружия — кулаки: бонусов нет, удар раз в 4 тика (OSRS Wiki, Unarmed). */
const UNARMED_SPEED = 4;
/** На скольких уровнях силы усредняется выгода предмета (текущий и следующие). */
export const WINDOW = 10;

export type Style = 'accurate' | 'aggressive';
export type AttackType = 'stab' | 'slash' | 'crush';

/**
 * Стили Accurate и Aggressive категорий оружия (OSRS Wiki, Weapon types / {{CombatStyles}}) и тип удара
 * у каждого. Controlled и Defensive для урона не лучше — их не считаем.
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
/** Категория оружия по виду предмета (там же, на вики). */
const CATEGORY: Record<string, string> = {
  dagger: 'stab sword', sword: 'stab sword', scimitar: 'slash sword', longsword: 'slash sword',
  mace: 'spiked', warhammer: 'blunt', battleaxe: 'axe', axe: 'axe', '2h sword': '2h sword', pickaxe: 'pickaxe',
};

export interface MeleeResult {
  maxHit: number;
  hitChance: number;
  /** Средний урон в секунду. */
  dps: number;
  /** Стиль, при котором урон выше: Accurate (+3 к атаке) или Aggressive (+3 к силе). */
  style: Style;
  /** Тип удара этого стиля: колющий, режущий или дробящий. */
  type?: AttackType;
  /** Секунд между ударами. */
  speed: number;
}

export interface Prayers { attack?: number; strength?: number }

/** Урон при одном стиле. Все округления — как на вики: вниз, на каждом шаге. target — защита цели. */
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
 * Лучший стиль оружия (null — без оружия) с амулетом против противника: перебираются стили Accurate и
 * Aggressive категории оружия, у каждого свой тип удара — и своя защита противника от него.
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
 * Ценность оружия и амулета на прокачку: урон в секунду в среднем на текущем и следующих уровнях силы
 * (до 99) и по всем противникам шага. Так ступеньки максимального удара не прячут выгоду предмета.
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
 * Первая оценка темпа шага боя: секунд на одного противника — его здоровье, делённое на урон в секунду
 * нынешнего оружия и амулета при нынешних уровнях (против первого противника шага). Ходьба между боями
 * не входит, поэтому оценка скорее быстрая — в игре её сменит замер. null — у шага нет противника,
 * снаряжение из игры не пришло или оружие в руке программе неизвестно: время тогда не выдумываем.
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
 * Шаг для игры с первой оценкой темпа боя: секунд на противника по нынешнему оружию и уровням (killSeconds).
 * Плагин показывает её с пометкой «оценка», пока не накопит своих замеров. Оценки нет — шаг как есть.
 */
export function withKillEstimate(step: Step, levels: Partial<Record<string, number>>, gear: GearState | null): Step {
  const p = step.pacing;
  if (!p || !COMBAT.has(p.skill) || p.secondsPerAction !== undefined) return step;
  const sec = killSeconds(step, levels, gear);
  // Плагин принимает до 10 минут на действие; дольше — это не темп, а неподходящее оружие.
  if (sec === null || !(sec > 0) || sec > 600) return step;
  return { ...step, pacing: { ...p, secondsPerAction: Math.round(sec * 10) / 10 } };
}

// ---------------------------------------------------------------------------
// Разбор

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
  /** Что сейчас в этом слоте: известный предмет, неизвестный (только имя) или пусто. */
  current: GearPiece | null;
  currentName?: string;
  how: 'wear' | 'buy';
  source: Source;
  /** Другие места, где взять (для «или на бирже»). */
  alternatives: Source[];
  /** Цена выбранного источника; 0 — уже есть; null — цена неизвестна. */
  cost: number | null;
  gain: Gain;
  /** По маршруту этот предмет всё равно покупается на шаге (код шага). */
  routeStep?: string;
  /** Займёт обе руки — щит придётся снять. */
  twoHanded?: boolean;
  /** Сколько не хватает монет (для целей «накопить»). */
  short?: number;
}

export interface Unlock { item: GearPiece; skill: 'attack' | 'defence' | 'strength'; level: number; have: number }

/**
 * Предмет лучше надетого, который пока нельзя надеть: не хватает уровней или квеста. Показывается замком
 * «🔒 нужно 20 Ranged (сейчас 17)» — вместо молчания или совета, который не наденется.
 */
export interface LockedItem {
  slot: GearSlot;
  item: GearPiece;
  current: GearPiece | null;
  currentName?: string;
  gain: Gain;
  missing: MissingRequirement[];
  /** Уже лежит в сумке или банке, но надеть его пока нельзя. */
  owned?: 'bag' | 'bank';
}

/** Замок показываем, если до предмета не больше стольких уровней (или он уже есть) — это ближняя цель, а не мечта. */
export const LOCK_NEAR = 10;

export interface Equipped { piece: GearPiece | null; id: number; name: string }

export interface GearAdvice {
  /** Есть ли данные из игры (надетое, сумка). */
  live: boolean;
  levels: Levels;
  equipped: Partial<Record<GearSlot, Equipped>>;
  coins: { bag: number | null; bank: number | null; total: number | null };
  /** С кем сравнивалось оружие: противники шага или корова. */
  foes: Foe[];
  /** Урон сейчас — против первого из них, при текущих уровнях. */
  weaponNow: MeleeResult;
  /** Оружие в руке неизвестно программе — урон «сейчас» посчитан без него. */
  weaponUnknown?: string;
  /** Сделать сейчас ради скорости: надеть лучшее, что уже есть, купить оружие и амулет. */
  actions: GearAction[];
  /** Броня по карману — из того, что осталось после оружия и амулета. Бой она не ускоряет, но бережёт еду. */
  armour: GearAction[];
  /** Лучше, чем можно сейчас: не хватает монет. */
  goals: GearAction[];
  unlocks: Unlock[];
  /** Лучше надетого, но пока нельзя надеть: по одному на слот, сначала то, что уже есть в сумке или банке. */
  locked: LockedItem[];
  /** Молитвы на силу и атаку, которые уже открыты. */
  prayers: { name: string; level: number; effect: string; maxHit?: number }[];
}

export interface AdvisorInput {
  levels: Partial<Record<string, number>>;
  gear: GearState | null;
  owned?: OwnedState | null;
  mode: GameMode;
  /** Цены биржи по ID. */
  gePrices?: ReadonlyMap<number, number>;
  /** Шлагбаум Al Kharid бесплатный (Prince Ali Rescue пройден). */
  freeToll?: boolean;
  /** Какие предметы маршрут ещё покупает: nameKey → код шага. */
  routeNeeds?: ReadonlyMap<string, string>;
  /** Противники шага (stepFoes): с ними сравнивается оружие. Пусто — корова. */
  foes?: readonly Foe[];
  /** Выполненные квесты. Предмет с квестом в требованиях (Rune platebody — Dragon Slayer I) без него не советуем. */
  questsDone?: ReadonlySet<string>;
  data?: GearData;
}

/** Шлагбаум между Lumbridge и Al Kharid: 10 монет, после Prince Ali Rescue — бесплатно (OSRS Wiki, Al Kharid). */
export const TOLL = 10;

/** Уровни с запасом: без данных — 1 (так советы не обещают то, что ещё нельзя надеть). */
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
 * Чего не хватает, чтобы надеть: уровни всех боевых навыков и квесты. Неизвестный уровень считается первым,
 * неизвестный квест — невыполненным: совет не должен обещать то, что может не надеться.
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

/** «20 Ranged (сейчас 17), квест Dragon Slayer I» — чего не хватает до предмета. */
export function missingText(missing: MissingRequirement[]): string {
  return missing.map((m) => (m.kind === 'skill' ? `${m.need} ${SKILL_EN[m.skill]} (сейчас ${m.have})` : `квест ${m.quest}`)).join(', ');
}

function pieceOf(id: number, name: string, data: GearData): GearPiece | null {
  return (data === gearData ? gearById.get(id) ?? gearByName.get(nameKey(name)) : data.items.find((i) => i.id === id || nameKey(i.name) === nameKey(name))) ?? null;
}

/** Надетое по слотам: слот из игры, а у старого плагина (без слота) — по базе предметов. */
function equippedBySlot(gear: GearState | null, data: GearData): Partial<Record<GearSlot, Equipped>> {
  const out: Partial<Record<GearSlot, Equipped>> = {};
  for (const it of gear?.equipment ?? []) {
    const piece = pieceOf(it.id, it.name, data);
    const slot = it.slot ? GAME_SLOT[it.slot] : piece?.slot;
    if (slot && !out[slot]) out[slot] = { piece, id: it.id, name: it.name };
  }
  return out;
}

/** Магазины, куда можно довести стрелкой: есть в словаре мест. Остальные (гильдии, Wilderness) — не советуем. */
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

/** Где уже лежит предмет: в сумке или в банке (по счёту из плагина). Неизвестно или нет — undefined. */
function ownedWhere(p: GearPiece, input: AdvisorInput): 'bag' | 'bank' | undefined {
  if (input.gear?.inventory?.some((i) => i.id === p.id || nameKey(i.name) === nameKey(p.name))) return 'bag';
  const bank = input.owned?.items.get(nameKey(p.name))?.bank;
  return bank && bank > 0 ? 'bank' : undefined;
}

/** Сравнение рангов по порядку чисел: a раньше b. */
function lexLess(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

/** Откуда взять предмет: сумка, банк, магазины, биржа — сначала бесплатное, потом дешёвое. */
function sourcesOf(p: GearPiece, input: AdvisorInput): Source[] {
  const out: Source[] = [];
  if (input.gear?.inventory?.some((i) => i.id === p.id || nameKey(i.name) === nameKey(p.name))) out.push({ kind: 'bag' });
  const bank = input.owned?.items.get(nameKey(p.name))?.bank;
  if (bank && bank > 0) out.push({ kind: 'bank' });
  const shops = shopsOf(p, Boolean(input.freeToll));
  const ge: Source[] = p.tradeable ? [{ kind: 'ge', ...(input.gePrices?.has(p.id) ? { price: input.gePrices.get(p.id) } : {}) }] : [];
  const priced = [...shops, ...ge].sort((a, b) => priceOf(a, Infinity) - priceOf(b, Infinity));
  // Магазин немногим дороже биржи — сначала магазин: цена точная, сделку ждать не надо, и в начале пути
  // он обычно рядом (Zeke — у коровника за воротами Al Kharid, биржа — в Varrock). Биржа остаётся «или …».
  const cheapest = priced[0];
  if (cheapest?.kind === 'ge' && cheapest.price !== undefined) {
    const shop = priced.find((s) => s.kind === 'shop' && priceOf(s, Infinity) - cheapest.price! < SAVE_GP);
    if (shop) priced.splice(0, priced.length, shop, ...priced.filter((s) => s !== shop));
  }
  return [...out, ...priced];
}

/** Цена источника: у магазина — с платой за проход; бесплатно — 0; неизвестно — fallback. */
function priceOf(s: Source, fallback: number): number {
  if (s.kind === 'bag' || s.kind === 'bank') return 0;
  if (s.kind === 'shop') return s.price + (s.toll ?? 0);
  return s.price ?? fallback;
}

function allowed(p: GearPiece, lv: Levels, mode: GameMode, quests?: ReadonlySet<string>): boolean {
  return (!p.members || mode === 'members') && !p.reqUnverified && canWear(p, lv, quests);
}

/** Молитвы на атаку и силу по уровню молитвы (OSRS Wiki: уровень и множитель каждой). */
const PRAYERS: { name: string; level: number; kind: 'attack' | 'strength'; mult: number; effect: string }[] = [
  { name: 'Burst of Strength', level: 4, kind: 'strength', mult: 1.05, effect: '+5% к силе' },
  { name: 'Clarity of Thought', level: 7, kind: 'attack', mult: 1.05, effect: '+5% к атаке' },
  { name: 'Superhuman Strength', level: 13, kind: 'strength', mult: 1.1, effect: '+10% к силе' },
  { name: 'Improved Reflexes', level: 16, kind: 'attack', mult: 1.1, effect: '+10% к атаке' },
  { name: 'Ultimate Strength', level: 31, kind: 'strength', mult: 1.15, effect: '+15% к силе' },
  { name: 'Incredible Reflexes', level: 34, kind: 'attack', mult: 1.15, effect: '+15% к атаке' },
];

/**
 * С какой выгоды советуем: урон в секунду хотя бы +3% (в среднем на прокачку), защита — хотя бы +3.
 * Порог низкий намеренно: любое ускорение стоит показать, а процент в совете говорит, насколько оно велико.
 */
const WORTH = { dps: 1.03, defence: 3 };
/** Из почти равных дешёвое берём, если оно хотя бы вдвое дешевле и экономит не меньше этого. */
const SAVE_GP = 100;

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

  // Оружие: лучший урон в секунду при твоих уровнях. Неизвестное программе оружие в руке сравнить нельзя —
  // тогда урон «сейчас» считается без него, а текст совета говорит только о новом оружии (gainText).
  /**
   * Чем предмет лучше надетого в слоте — или null, если не лучше по порогам совета. Оружие — урон в секунду;
   * амулет — урон с оружием в руке, а ради защиты — только если урон не падает; броня — сумма защиты от
   * колющих, режущих и дробящих ударов.
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

  // В каждом слоте — одно лучшее «надеть» (бесплатно) и одна лучшая покупка по деньгам.
  // Урон главнее защиты: защита амулета решает только при равном уроне. Иначе +6 защиты Amulet of power
  // перевешивали 3% урона Amulet of strength, и совет по амулету зависел от случайных цифр.
  const score = (a: GearAction) => (a.gain.kind === 'dps' ? Math.round(a.gain.ratio * 1000) * 1000 + (a.gain.defenceAfter ?? 0) : a.gain.after);
  /** b заметно лучше a — по тем же порогам, что и совет вообще. Иначе за разницу платить незачем. */
  const better = (b: GearAction, a: GearAction) => (b.gain.kind === 'dps' && a.gain.kind === 'dps'
    ? b.gain.ratio >= a.gain.ratio * WORTH.dps
      || (b.gain.ratio >= a.gain.ratio * 0.999 && (b.gain.defenceAfter ?? 0) - (a.gain.defenceAfter ?? 0) >= WORTH.defence)
    : score(b) - score(a) >= WORTH.defence);
  const actions: GearAction[] = [];
  const armour: GearAction[] = [];
  const goals: GearAction[] = [];
  let left = total ?? 0;
  const order: GearSlot[] = ['weapon', 'neck', 'body', 'legs', 'head', 'shield'];
  // Сначала то, что уже есть: надеть бесплатно.
  const wearBest = new Map<GearSlot, GearAction>();
  for (const a of candidates.filter((c) => c.how === 'wear')) {
    const cur = wearBest.get(a.slot);
    if (!cur || score(a) > score(cur)) wearBest.set(a.slot, a);
  }
  for (const slot of order) if (wearBest.has(slot)) actions.push(wearBest.get(slot)!);
  const best = (list: GearAction[]) => list.reduce((a, b) => (score(b) > score(a) || (score(b) === score(a) && (b.cost ?? Infinity) < (a.cost ?? Infinity)) ? b : a));
  /**
   * Что выбрать из списка: самое сильное, но из почти равных — то, что маршрут всё равно купит (эти деньги
   * не лишние), а заметно более дешёвое — только если экономия настоящая, а не 30 монет за худший предмет.
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
  // Потом покупки: лучшее, на что хватает денег, — сейчас; лучшее вообще, если на него не хватает, — цель.
  // Покупка должна быть заметно лучше того, что можно надеть бесплатно.
  for (const slot of order) {
    const worn = wearBest.get(slot);
    const buys = candidates.filter((c) => c.slot === slot && c.how === 'buy' && (!worn || better(c, worn)));
    if (!buys.length) continue;
    const top = choose(buys);
    // «Не хватает» — от денег до покупки в этом слоте: дешёвый меч сейчас не делает цель дороже.
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

  // Что откроется дальше: ятаган и броня следующего металла.
  const unlocks: Unlock[] = [];
  const nextOf = (kind: string, skill: 'attack' | 'defence') => data.items
    .filter((p) => p.kind === kind && !p.reqUnverified && (!p.members || input.mode === 'members') && (p.req?.[skill] ?? 1) > lv[skill])
    .sort((a, b) => (a.req?.[skill] ?? 1) - (b.req?.[skill] ?? 1))[0];
  const scim = nextOf('scimitar', 'attack');
  if (scim) unlocks.push({ item: scim, skill: 'attack', level: scim.req!.attack!, have: lv.attack });
  const plate = nextOf('platebody', 'defence');
  if (plate) unlocks.push({ item: plate, skill: 'defence', level: plate.req!.defence!, have: lv.defence });

  // Замки: лучше надетого по тем же порогам, что и совет, но требования не выполнены. Предмет, которого нет
  // в базе требований (reqUnverified) или нет в режиме игры, замком не показываем — про него ничего не известно.
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
      // Не из сумки или банка — только если он заметно лучше того, что можно надеть или купить уже сейчас:
      // замок на предмет, равный доступному, — лишний шум.
      if (!owned && open.some((a) => !lockBeats(gain, a.gain))) continue;
      const gap = missing.reduce((s, m) => s + (m.kind === 'skill' ? m.need - m.have : 0), 0);
      if (!owned && gap > LOCK_NEAR) continue;
      // Сначала то, что уже есть, потом ближайшее по уровням, из равных — сильнейшее.
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

  // Молитвы: лучшая открытая на силу и на атаку; сколько даёт к удару с оружием в руке.
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
// Тексты и цели

const gp = (n: number) => n.toLocaleString('ru-RU').replace(/ /g, ' ');
const pct = (r: number) => `${Math.round((r - 1) * 100)}%`;

/** «удар до 3 вместо 2, урона в секунду +45%» — чем действие лучше. */
export function gainText(a: Pick<GearAction, 'gain' | 'slot' | 'currentName'>): string {
  const g = a.gain;
  if (g.kind === 'defence') return `защита +${g.after - g.before} (${g.before} → ${g.after})`;
  // Что в руке сейчас — программе неизвестно: сравнивать не с чем, говорим только про новое оружие.
  if (a.currentName && a.slot === 'weapon') {
    return `удар до ${g.after.maxHit}, раз в ${g.after.speed.toFixed(1).replace('.', ',')} с — сравни с ${a.currentName} во вкладке Equipment Stats`;
  }
  const parts: string[] = [];
  if (g.after.maxHit !== g.before.maxHit) parts.push(`удар до ${g.after.maxHit} вместо ${g.before.maxHit}`);
  if (Math.abs(g.after.speed - g.before.speed) > 0.01) parts.push(`удар раз в ${g.after.speed.toFixed(1).replace('.', ',')} с вместо ${g.before.speed.toFixed(1).replace('.', ',')}`);
  if (g.ratio >= 1.01) parts.push(`урона в секунду +${pct(g.ratio)}`);
  if (g.defenceAfter !== undefined && g.defenceBefore !== undefined && g.defenceAfter > g.defenceBefore) parts.push(`защита +${g.defenceAfter - g.defenceBefore}`);
  return parts.join(', ') || 'чуть сильнее';
}

/** Сам предмет, без сравнения: когда неизвестно, что надето сейчас (нет связи с игрой). */
export function statsText(a: Pick<GearAction, 'gain' | 'slot' | 'item'>): string {
  const g = a.gain;
  if (g.kind === 'defence') return `защита ${g.after}`;
  if (a.slot === 'neck') {
    // У амулета — его бонусы: удар без известного оружия ничего не говорит.
    const p = a.item;
    const accuracy = Math.max(p.attack.stab, p.attack.slash, p.attack.crush);
    const parts = [p.strength && `сила +${p.strength}`, accuracy && `точность +${accuracy}`, defenceSum(p) && `защита +${defenceSum(p)}`];
    return parts.filter(Boolean).join(', ');
  }
  return `удар до ${g.after.maxHit}, раз в ${g.after.speed.toFixed(1).replace('.', ',')} с`;
}

/** Где взять: «у Zeke в Al Kharid — 400 gp (+10 gp за проход)», «лежит в банке», «на бирже ~350 gp». */
export function sourceText(s: Source): string {
  if (s.kind === 'bag') return 'уже в сумке';
  if (s.kind === 'bank') return 'лежит в банке';
  if (s.kind === 'ge') return s.price !== undefined ? `на бирже ~${gp(s.price)} gp` : 'на бирже (цена не загрузилась)';
  return `${s.npc ? `у ${s.npc} ` : ''}в ${s.shop} (${s.location}) — ${gp(s.price)} gp${s.toll ? ` + ${s.toll} gp за проход в Al Kharid` : ''}`;
}

/** Короткая строка для HUD в игре: одно главное действие. */
export function hudHint(a: GearAction): string {
  if (a.how === 'wear') return `⚡ Надень ${a.item.name} — ${a.source.kind === 'bank' ? 'он в банке' : 'он в сумке'}`;
  const s = a.source;
  if (s.kind === 'shop') return `⚡ Сильнее: ${a.item.name} у ${s.npc ?? s.shop} (${s.location}), ${gp(s.price)} gp`;
  return `⚡ Сильнее: ${a.item.name} на бирже${s.kind === 'ge' && s.price !== undefined ? `, ~${gp(s.price)} gp` : ''}`;
}

/** Куда вести стрелку за покупкой: магазин (продавец подсвечен) или биржа. Для «надеть» — никуда. */
export function actionNav(a: GearAction, stepId?: string): NavTargetPayload | null {
  if (a.how !== 'buy') return null;
  const item = { itemName: a.item.name, itemId: a.item.id, ...(stepId ? { stepId } : {}) };
  const s = a.source;
  if (s.kind === 'shop' && s.coords) return { label: s.shop, ...s.coords, ...(s.npc ? { npcNames: [s.npc] } : {}), ...item };
  const ge = matchStrict('Grand Exchange');
  return ge ? { label: 'Grand Exchange', x: ge.x, y: ge.y, plane: ge.plane, npcNames: ['Grand Exchange Clerk'], ...item } : null;
}

/**
 * Какие предметы спросить у плагина (счёт в банке приходит только по названиям): всё, что можно надеть
 * при текущих уровнях и что лучше надетого, — по 3 на слот, чтобы список был коротким.
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

/** Предметы, которые маршрут ещё покупает (не пройденные шаги-закупки): nameKey → код шага. */
export function routeNeeds(steps: { id: string; type: string; itemsRequired?: { nameEn: string }[] }[], closed: (id: string) => boolean): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of steps) {
    if (s.type !== 'gear' || closed(s.id)) continue;
    for (const it of s.itemsRequired ?? []) if (!out.has(nameKey(it.nameEn))) out.set(nameKey(it.nameEn), s.id);
  }
  return out;
}

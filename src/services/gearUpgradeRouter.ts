// Умный апгрейд инструмента или оружия перед долгой прокачкой: у игрока уже 6+ Woodcutting, а в руках
// бронзовый топор — предложить Steel axe у Bob в Lumbridge за ~200 gp и вернуть к шагу, когда топор куплен.
//
// Только советует и ведёт: ничего не покупает, не тратит и не продаёт. Решение — чистая функция от шага,
// уровней, снаряжения и монет; сравнение — по порядку ступеней из toolProgression.json, а не по словам
// в названии («Bronze» в имени — не доказательство). Цены и продавцы — из базы предметов проекта (OSRS Wiki),
// точка магазина — из словаря мест, как у карты и досье.

import toolProgressionJson from '../data/toolProgression.json';
import type { GameMode, Step, WikiItemDetail } from '../types';
import { itemById } from '../data';
import { matchStrict } from './locationResolver';
import type { GearState, NavTargetPayload } from './runeliteBridge';

export type UpgradeCategory = 'woodcutting' | 'mining' | 'melee';

export type UpgradeStatus = 'NO_UPGRADE' | 'UPGRADE_AVAILABLE' | 'UPGRADE_OWNED' | 'UPGRADE_NOT_AFFORDABLE' | 'SKIPPED' | 'UNKNOWN';

export interface ToolUpgradeEntry {
  tier: string;
  itemId?: number;
  levelReq: number;
  approxCost?: number;
  efficiencyBoost?: string;
  shop?: { npc: string; store: string; city: string; coords?: { x: number; y: number; plane: number } };
  geAlternative?: boolean;
  geOnly?: boolean;
  membersOnly?: boolean;
  /** Почти не быстрее предыдущей ступени: ради неё не зовём в магазин (но как текущий инструмент — учитываем). */
  minor?: boolean;
}

export type ToolProgression = Record<UpgradeCategory, ToolUpgradeEntry[]>;

export const toolProgression = toolProgressionJson as unknown as ToolProgression & { source: string };

export interface UpgradeRecommendation {
  status: UpgradeStatus;
  skill: UpgradeCategory;
  currentItem?: string;
  recommendedItem?: string;
  recommendedItemId?: number;
  levelReq?: number;
  /** Дешевле из известного: цена в магазине или на бирже. */
  approxCost?: number;
  shopPrice?: number;
  gePrice?: number;
  efficiencyBoost?: string;
  npc?: string;
  shop?: string;
  city?: string;
  coords?: { x: number; y: number; plane: number };
  geOnly?: boolean;
  coins?: number;
  reason?: string;
}

export interface RouterInput {
  step: Step;
  mode: GameMode;
  /** Уровни навыков: из игры, а без неё — введённые в приложении. */
  levels: Record<string, number | undefined>;
  gear: GearState | null;
  dismissed?: readonly string[];
  gePrices?: ReadonlyMap<number, number>;
  data?: ToolProgression;
  item?: (id: number) => WikiItemDetail | undefined;
}

const LEVEL_SKILL: Record<UpgradeCategory, string> = { woodcutting: 'woodcutting', mining: 'mining', melee: 'attack' };

const BOOST: Record<UpgradeCategory, string> = {
  woodcutting: 'Топор металлом выше срубает чаще — больше брёвен в минуту на том же уровне.',
  mining: 'Кирка металлом выше добывает чаще — больше руды в минуту на том же уровне.',
  melee: 'У оружия металлом выше больше бонусы атаки и силы — бой быстрее и безопаснее.',
};

/** Какие категории апгрейда у шага: по навыкам прокачки шага. Квесты и закупки — без подсказки. */
export function stepUpgradeCategories(step: Step): UpgradeCategory[] {
  if (step.type !== 'skill') return [];
  const skills = new Set([...(step.targets ?? []).map((t) => t.skill), ...(step.pacing ? [step.pacing.skill] : [])]);
  const out: UpgradeCategory[] = [];
  if (skills.has('woodcutting')) out.push('woodcutting');
  if (skills.has('mining')) out.push('mining');
  if (skills.has('attack') || skills.has('strength') || skills.has('defence')) out.push('melee');
  return out;
}

const key = (s: string) => s.trim().toLowerCase();

/** Номер ступени предмета; −1 — не из этой линейки. По ID, а без ID — по точному имени. */
function tierIndex(tiers: ToolUpgradeEntry[], id: number, name: string): number {
  return tiers.findIndex((t) => (t.itemId !== undefined ? t.itemId === id : key(t.tier) === key(name)));
}

function bestOwned(tiers: ToolUpgradeEntry[], items: { id: number; name: string }[] | null): number {
  let best = -1;
  for (const it of items ?? []) best = Math.max(best, tierIndex(tiers, it.id, it.name));
  return best;
}

/** Цена в магазине из базы предметов: магазин на вики пишется и с точкой в конце («Bob's Brilliant Axes.»). */
function shopPrice(entry: ToolUpgradeEntry, item: (id: number) => WikiItemDetail | undefined): number | undefined {
  if (!entry.shop || entry.itemId === undefined) return entry.approxCost;
  const store = key(entry.shop.store).replace(/\.$/, '');
  const line = item(entry.itemId)?.buyLocations?.find((b) => key(b.shopName).replace(/\.$/, '') === store);
  return line?.price ?? entry.approxCost;
}

export function recommendFor(category: UpgradeCategory, input: RouterInput): UpgradeRecommendation {
  const data = input.data ?? toolProgression;
  const item = input.item ?? ((id: number) => itemById.get(id));
  const tiers = data[category];
  const base: UpgradeRecommendation = { status: 'UNKNOWN', skill: category };
  if (!input.gear || (!input.gear.equipment && !input.gear.inventory)) return { ...base, reason: 'Нет данных о снаряжении — RuneLite не подключён' };
  const level = input.levels[LEVEL_SKILL[category]];
  if (!level) return { ...base, reason: 'Неизвестен уровень навыка' };

  const equipped = bestOwned(tiers, input.gear.equipment);
  const owned = Math.max(equipped, bestOwned(tiers, input.gear.inventory));
  // Инструмент рубки и добычи работает и из сумки; оружие — только в руке.
  const current = category === 'melee' ? equipped : owned;
  const currentItem = current >= 0 ? tiers[current].tier : undefined;

  let best = -1;
  tiers.forEach((t, i) => {
    if (t.minor || t.levelReq > level) return;
    if (t.membersOnly && input.mode !== 'members') return;
    if (!t.shop && !t.geOnly) return;
    best = i;
  });
  if (best < 0 || best <= current) return { ...base, status: 'NO_UPGRADE', currentItem };
  const target = tiers[best];
  const rec: UpgradeRecommendation = {
    ...base,
    currentItem,
    recommendedItem: target.tier,
    ...(target.itemId !== undefined ? { recommendedItemId: target.itemId } : {}),
    levelReq: target.levelReq,
    efficiencyBoost: target.efficiencyBoost ?? BOOST[category],
    geOnly: Boolean(target.geOnly),
  };
  if (best <= owned) return { ...rec, status: 'UPGRADE_OWNED', reason: `${target.tier} уже есть — возьми его в руку` };
  if (input.dismissed?.includes(input.step.id)) return { ...rec, status: 'SKIPPED' };

  if (target.shop && !target.geOnly) {
    const place = matchStrict(target.shop.store);
    rec.npc = target.shop.npc;
    rec.shop = target.shop.store;
    rec.city = target.shop.city;
    const coords = target.shop.coords ?? (place ? { x: place.x, y: place.y, plane: place.plane } : undefined);
    if (coords) rec.coords = coords;
    const price = shopPrice(target, item);
    if (price !== undefined) rec.shopPrice = price;
  }
  const ge = target.itemId !== undefined ? input.gePrices?.get(target.itemId) : undefined;
  if (ge !== undefined) rec.gePrice = ge;
  const costs = [rec.shopPrice, rec.gePrice].filter((c): c is number => c !== undefined);
  if (costs.length) rec.approxCost = Math.min(...costs);

  const coins = (input.gear.coins ?? 0) + (input.gear.bankCoins ?? 0);
  rec.coins = coins;
  if (rec.approxCost !== undefined && coins < rec.approxCost) {
    return { ...rec, status: 'UPGRADE_NOT_AFFORDABLE', reason: `Нужно ~${rec.approxCost} gp, есть ${coins}` };
  }
  return { ...rec, status: 'UPGRADE_AVAILABLE', reason: `Уровень ${level} позволяет ${target.tier} (с ${target.levelReq})` };
}

/** Первая полезная подсказка шага: апгрейд или «не хватает монет». Иначе — итог первой категории (или null). */
export function recommendUpgrade(input: RouterInput): UpgradeRecommendation | null {
  const cats = stepUpgradeCategories(input.step);
  if (!cats.length) return null;
  const all = cats.map((c) => recommendFor(c, input));
  return all.find((r) => r.status === 'UPGRADE_AVAILABLE' || r.status === 'UPGRADE_NOT_AFFORDABLE') ?? all[0];
}

/** Подсказку показываем только там, где есть что предложить. */
export const showsPrompt = (r: UpgradeRecommendation | null): r is UpgradeRecommendation =>
  !!r && (r.status === 'UPGRADE_AVAILABLE' || r.status === 'UPGRADE_NOT_AFFORDABLE');

/**
 * Куда вести стрелку за апгрейдом: магазин из словаря мест или, для предметов только с биржи, Grand Exchange.
 * С предметом (имя и ID) — плагин снимет цель сам, когда он окажется в сумке или надет.
 */
export function upgradeNav(r: UpgradeRecommendation, stepId: string): NavTargetPayload | null {
  const item = { itemName: r.recommendedItem, ...(r.recommendedItemId ? { itemId: r.recommendedItemId } : {}), stepId };
  if (r.coords && r.shop) {
    return { label: r.shop, ...r.coords, ...(r.npc ? { npcNames: [r.npc] } : {}), ...item };
  }
  const ge = matchStrict('Grand Exchange');
  return ge ? { label: 'Grand Exchange', x: ge.x, y: ge.y, plane: ge.plane, npcNames: ['Grand Exchange Clerk'], ...item } : null;
}

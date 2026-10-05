// A smart tool upgrade before a long training: the player already has 6+ Woodcutting, and in hand is
// a bronze axe — suggest a Steel axe from Bob in Lumbridge for ~200 gp and return to the step when the axe is bought.
// Weapons and armor are not here: they are compared by damage and defence by the gear analysis (gearAdvisor.ts).
//
// It only advises and leads: it buys, spends and sells nothing. The decision is a pure function of the step,
// levels, gear and coins; the comparison is by the order of tiers in toolProgression.json, not by words
// in the name ("Bronze" in the name is not proof). Prices and sellers are from the project's item database (OSRS Wiki),
// the shop point is from the place dictionary, like the map and the dossier.

import toolProgressionJson from '../data/toolProgression.json';
import type { GameMode, Step, WikiItemDetail } from '../types';
import { itemById } from '../data';
import { matchStrict } from './locationResolver';
import type { GearState, NavTargetPayload } from './runeliteBridge';

export type UpgradeCategory = 'woodcutting' | 'mining';

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
  /** Barely faster than the previous tier: we do not send to a shop for it (but as the current tool we count it). */
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
  /** The cheaper of the known: the price in a shop or at the exchange. */
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
  /** Skill levels: from the game, and without it — entered in the app. */
  levels: Record<string, number | undefined>;
  gear: GearState | null;
  dismissed?: readonly string[];
  gePrices?: ReadonlyMap<number, number>;
  data?: ToolProgression;
  item?: (id: number) => WikiItemDetail | undefined;
}

const BOOST: Record<UpgradeCategory, string> = {
  woodcutting: 'A higher-metal axe cuts more often — more logs per minute at the same level.',
  mining: 'A higher-metal pickaxe mines more often — more ore per minute at the same level.',
};

/** Which upgrade categories a step has: by the step's training skills. Quests, shopping and combat — without this hint. */
export function stepUpgradeCategories(step: Step): UpgradeCategory[] {
  if (step.type !== 'skill') return [];
  const skills = new Set([...(step.targets ?? []).map((t) => t.skill), ...(step.pacing ? [step.pacing.skill] : [])]);
  const out: UpgradeCategory[] = [];
  if (skills.has('woodcutting')) out.push('woodcutting');
  if (skills.has('mining')) out.push('mining');
  return out;
}

const key = (s: string) => s.trim().toLowerCase();

/** The tier number of an item; −1 — not from this line. By ID, and without an ID — by the exact name. */
function tierIndex(tiers: ToolUpgradeEntry[], id: number, name: string): number {
  return tiers.findIndex((t) => (t.itemId !== undefined ? t.itemId === id : key(t.tier) === key(name)));
}

function bestOwned(tiers: ToolUpgradeEntry[], items: { id: number; name: string }[] | null): number {
  let best = -1;
  for (const it of items ?? []) best = Math.max(best, tierIndex(tiers, it.id, it.name));
  return best;
}

/** The price in a shop from the item database: the wiki writes a shop with a trailing dot too ("Bob's Brilliant Axes."). */
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
  if (!input.gear || (!input.gear.equipment && !input.gear.inventory)) return { ...base, reason: 'No gear data — RuneLite is not connected' };
  const level = input.levels[category];
  if (!level) return { ...base, reason: 'Skill level unknown' };

  // An axe and a pickaxe work from the bag too — the best one on hand counts.
  const owned = Math.max(bestOwned(tiers, input.gear.equipment), bestOwned(tiers, input.gear.inventory));
  const currentItem = owned >= 0 ? tiers[owned].tier : undefined;

  let best = -1;
  tiers.forEach((t, i) => {
    if (t.minor || t.levelReq > level) return;
    if (t.membersOnly && input.mode !== 'members') return;
    if (!t.shop && !t.geOnly) return;
    best = i;
  });
  if (best < 0 || best <= owned) return { ...base, status: 'NO_UPGRADE', currentItem };
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
  if (best <= owned) return { ...rec, status: 'UPGRADE_OWNED', reason: `${target.tier} is already owned — wield it` };
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
    return { ...rec, status: 'UPGRADE_NOT_AFFORDABLE', reason: `Need ~${rec.approxCost} gp, you have ${coins}` };
  }
  return { ...rec, status: 'UPGRADE_AVAILABLE', reason: `Level ${level} allows ${target.tier} (requires ${target.levelReq})` };
}

/** The first useful hint of a step: an upgrade or "not enough coins". Otherwise — the result of the first category (or null). */
export function recommendUpgrade(input: RouterInput): UpgradeRecommendation | null {
  const cats = stepUpgradeCategories(input.step);
  if (!cats.length) return null;
  const all = cats.map((c) => recommendFor(c, input));
  return all.find((r) => r.status === 'UPGRADE_AVAILABLE' || r.status === 'UPGRADE_NOT_AFFORDABLE') ?? all[0];
}

/** The hint is shown only where there is something to offer. */
export const showsPrompt = (r: UpgradeRecommendation | null): r is UpgradeRecommendation =>
  !!r && (r.status === 'UPGRADE_AVAILABLE' || r.status === 'UPGRADE_NOT_AFFORDABLE');

/**
 * Where to lead the arrow for an upgrade: a shop from the place dictionary or, for exchange-only items, the Grand Exchange.
 * With an item (name and ID) the plugin clears the target itself when it is in the bag or worn.
 */
export function upgradeNav(r: UpgradeRecommendation, stepId: string): NavTargetPayload | null {
  const item = { itemName: r.recommendedItem, ...(r.recommendedItemId ? { itemId: r.recommendedItemId } : {}), stepId };
  if (r.coords && r.shop) {
    return { label: r.shop, ...r.coords, ...(r.npc ? { npcNames: [r.npc] } : {}), ...item };
  }
  const ge = matchStrict('Grand Exchange');
  return ge ? { label: 'Grand Exchange', x: ge.x, y: ge.y, plane: ge.plane, npcNames: ['Grand Exchange Clerk'], ...item } : null;
}

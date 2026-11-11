// Where to get an item: one queue of sources for any thing (not only gear), in order:
// in the bank, already in the bag, free nearby, a shop or the exchange, a drop from opponents. A price gap under SAVE_GP does
// not decide, the walk does (owner 2026-11-09): the nearer of the two goes first, the exchange when a distance is unknown. A
// bigger saving goes to the cheaper one; a shop leads when the exchange has no usable price. It buys nothing.

import type { WikiItemDetail } from '../../types';
import { matchStrict } from '../travel/locations';
import { nearestBankTo } from '../travel/stepPlaces';
import { heldOf, levelOf, type PlayerState, type WorldPoint } from '../player/playerState';
import { SHOP_TOWN, accessSuffix, shopAccess, shopKey, spawnAccess, type AccessState } from '../market/shopAccess';
import { nameKey } from '../items/itemKey';
import { stepsJson } from '../../data';
import { purchaseCost, type PurchaseFee } from '../items/purchaseCost';
import { SAVE_GP } from '../market/shopConstants';
import { NOT_SOLD_PRICE } from '../market/itemPrice';

export type SourceKind = 'bag' | 'bank' | 'free' | 'shop' | 'ge' | 'drop';

export interface SourceOption {
  kind: SourceKind;
  label: string;
  /** The price per piece; for a free one and an "already have" one it is 0; unknown means undefined. */
  price?: number;
  fee?: PurchaseFee;
  /** Tiles from the player; undefined means the position is unknown. */
  distance?: number;
  point?: WorldPoint & { label: string };
  note?: string;
  /** A shop: whether the player may walk in (shopAccess.ts). Only an open shop is ever the primary source. */
  access?: AccessState;
  /** A free quest giver is not an unconditional spawn. Rich started-state evidence is checked by the planner. */
  questAccess?: { quest: string; state: 'started' | 'completed' };
  /** An NPC who gives the item for free (FREE_GIVERS): first after what the player already has, whatever the distance. */
  giver?: boolean;
}

export interface SourcePlan {
  /** Already enough: nothing to look for. */
  satisfied: boolean;
  primary: SourceOption | null;
  /** No more than two spare ones. */
  alternatives: SourceOption[];
  /** All the options, including the hidden ones. */
  total: number;
}

/** A free one farther than this counts as "not nearby". */
export const FREE_NEAR = 150;

const dist = (a: WorldPoint, b: WorldPoint) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));



export interface SourceInput {
  name: string;
  need: number;
  /** need is already the shortage after ownership was allocated. */
  shortage?: boolean;
  /** An item card from the database (shops, spawns, drops, the exchange price). */
  detail?: WikiItemDetail;
  /** The exchange price, if fresher than the one in the card. */
  gePrice?: number | null;
  manualKey?: string;
  /** The Al Kharid toll gate is free. */
  freeToll?: boolean;
  /** Only these kinds of source are considered (a teleport's runes are bought, not picked up one by one at a spawn). Absent: all of them. */
  kinds?: readonly SourceKind[];
  /** The game's quest points, for the guild shops; absent or null: not known, and such a shop is only "if …". */
  qp?: number | null;
}

/**
 * Items an NPC hands out for free, from the route step that already sends the player to that NPC (its place is the step's, never a second copy):
 * Duke Horacio gives the Anti-dragon shield during Dragon Slayer I and after it (OSRS Wiki, "Duke Horacio", "Anti-dragon shield"). Lumbridge is also
 * where the free Home Teleport lands, so the giver comes before any shop or the exchange however far the player is.
 */
export const FREE_GIVERS: Record<string, { npc: string; note: string; questAccess?: SourceOption['questAccess'] }> = {
  'anti-dragon shield': { npc: 'Duke Horacio', note: 'during or after Dragon Slayer I; Home Teleport takes you to Lumbridge', questAccess: { quest: 'Dragon Slayer I', state: 'started' } },
};

/** The route step that visits an NPC: the first whose own NPC it is. */
export const giverStepOf = (npc: string) =>
  (stepsJson as { id: string; npc?: { nameEn?: string }; mapLocation?: WorldPoint & { label: string } }[]).find((x) => x.npc?.nameEn === npc && x.mapLocation);

function freeGiver(name: string, here: WorldPoint | undefined): SourceOption | null {
  const g = FREE_GIVERS[nameKey(name)];
  const step = g && giverStepOf(g.npc);
  if (!g || !step?.mapLocation) return null;
  const p = step.mapLocation;
  return {
    kind: 'free', label: `Free: ${p.label}`, price: 0, note: g.note, giver: true, ...(g.questAccess ? { questAccess: g.questAccess } : {}),
    point: { x: p.x, y: p.y, plane: p.plane, label: p.label }, ...(here ? { distance: dist(p, here) } : {}),
  };
}

export function planSources(input: SourceInput, s: PlayerState): SourcePlan {
  const here = s.position.known ? s.position.value : undefined;
  const held = heldOf(s, input.name, input.manualKey);
  const have = (held.bag ?? 0) + held.noted;
  const out: SourceOption[] = [];
  if (!input.shortage && have >= input.need) {
    return { satisfied: true, primary: { kind: 'bag', label: `In the bag: ${have}`, price: 0 }, alternatives: [], total: 1 };
  }
  if (!input.shortage && (held.bank ?? 0) > 0 && have + (held.bank ?? 0) >= input.need) {
    const b = nearestBankTo(here);
    out.push({
      kind: 'bank', label: `In the bank: ${held.bank}`, price: 0,
      ...(b ? { point: { x: b.x, y: b.y, plane: b.plane, label: b.label }, distance: here ? dist(b, here) : undefined } : {}),
    });
  }
  const d = input.detail;
  // null explicitly means that the current market has no usable quote: never revive the baked card price.
  const ge = input.gePrice === null ? undefined : input.gePrice ?? d?.gePrice?.buyPrice;
  const geAt = matchStrict('Grand Exchange');
  const geOption: SourceOption | null = d?.gePrice || typeof input.gePrice === 'number'
    ? {
      kind: 'ge', label: 'Grand Exchange', ...(ge !== undefined ? { price: ge } : {}),
      ...(geAt ? { point: { x: geAt.x, y: geAt.y, plane: geAt.plane, label: geAt.label }, distance: here ? dist(geAt, here) : undefined } : {}),
      note: 'the deal may take time',
    }
    : null;
  // Who may walk in: a guild's door, a quest, a members area, the Wilderness (shopAccess.ts). The Al Kharid toll is free once the game counts Prince Ali Rescue.
  const quests = s.quests;
  const freeToll = input.freeToll || (quests.known && quests.value.some((q) => nameKey(q) === 'prince ali rescue'));
  const ctx = { mode: s.mode, quests, qp: input.qp ?? null, level: (skill: string) => levelOf(s, skill) ?? null };
  for (const spawn of d?.freeSpawns ?? []) {
    // A free item is free only where the player may stand: the Crafting Guild's hammer needs Crafting 40, Crandor's planks Dragon Slayer I.
    const access = spawnAccess(spawn, ctx);
    if (access.state === 'blocked') continue;
    const p = matchStrict(spawn);
    out.push({
      kind: 'free', label: `Free: ${spawn}${accessSuffix(access)}`, price: 0, access: access.state,
      ...(p ? { point: { x: p.x, y: p.y, plane: p.plane, label: p.label }, distance: here ? dist(p, here) : undefined } : {}),
    });
  }
  const giver = freeGiver(input.name, here);
  if (giver) out.push(giver);
  const shops: SourceOption[] = [];
  for (const b of d?.buyLocations ?? []) {
    if (b.members && s.mode === 'f2p') continue;
    if (typeof b.stock === 'number' && b.stock === 0) continue;
    // The item data marks a trader that does not sell the item for coins with a placeholder price (10,000,000,000, stock "N/A").
    if (!(b.price < NOT_SOLD_PRICE)) continue;
    const town = b.location.trim() || SHOP_TOWN[shopKey(b.shopName)] || '';
    const access = shopAccess(b.shopName, town, ctx);
    if (access.state === 'blocked') continue;
    // The shop's own tile when the place dictionary has it; the town it stands in otherwise.
    const p = matchStrict(b.shopName) ?? (town ? matchStrict(town) : null);
    const toll = town === 'Al Kharid' && !freeToll ? 10 : 0;
    // Some shops in the item data have no town: the name alone, not "Silk trader — ".
    const name = b.shopName.replace(/\.$/, '');
    const notes = [toll ? `gate toll ${toll} gp` : '', access.fare ? access.note ?? '' : '', access.state !== 'open' ? access.note ?? '' : ''].filter(Boolean);
    shops.push({
      kind: 'shop', label: `${town ? `${name} — ${town}` : name}${accessSuffix(access)}`, price: b.price, access: access.state,
      ...(toll ? { fee: { key: 'al-kharid-toll', coins: toll, label: 'gate toll allowance' } }
        : access.fare ? { fee: { key: 'karamja-boat', coins: access.fare, label: 'standard Karamja boat fare allowance' } } : {}),
      ...(p ? { point: { x: p.x, y: p.y, plane: p.plane, label: p.label }, distance: here ? dist(p, here) : undefined } : {}),
      ...(notes.length ? { note: notes.join('; ') } : {}),
    });
  }
  // The nearest open shop; among equal ones — the cheaper. A shop the player may not be able to enter comes after the exchange, never first.
  shops.sort((a, b) => Number(a.access !== 'open') - Number(b.access !== 'open') || (a.distance ?? Infinity) - (b.distance ?? Infinity) || (a.price ?? 0) - (b.price ?? 0));
  const shop = shops[0];
  const quantity = Math.max(1, input.need);
  const gap = shop && ge !== undefined ? (purchaseCost(shop, quantity) ?? Infinity) - ge * quantity : 0;
  const nearer = shop?.distance !== undefined && geOption?.distance !== undefined && shop.distance < geOption.distance;
  const shopFirst = shop && shop.access === 'open' && (ge === undefined || (Math.abs(gap) < SAVE_GP ? nearer : gap < 0));
  if (shop && shopFirst) out.push(shop);
  if (geOption) out.push(geOption);
  if (shop && !shopFirst) out.push(shop);
  for (const sh of shops.slice(1, 2)) out.push(sh);
  if (d?.dropSources?.length) {
    const top = d.dropSources[0];
    // The wiki names some drop tables with an anchor ("Scurrius#non-MVP"): the monster is the part before it.
    out.push({ kind: 'drop', label: `Dropped by ${top.monster.replace(/#.*/, '')}`, note: top.rate });
  }
  // An unlocated acquisition is a reference, not a nearby free trip. Prefer a usable placed source before it.
  // Already owned stock stays first even when the current position/bank destination is unread.
  // "Free nearby" is no farther than FREE_NEAR tiles; farther, the free one goes on a par with the shop and the exchange. A spawn gives one
  // piece per visit: for more, its respawn waits are unmeasured time, and a purchase (known time) goes first.
  const rank = (o: SourceOption): number =>
    o.kind === 'bag' || o.kind === 'bank' ? 0 : o.access !== undefined && o.access !== 'open' ? 2.6
      : o.kind === 'drop' ? 3 : !o.point ? 2.75
        : o.kind === 'free' ? (o.giver || (input.need <= 1 && (o.distance === undefined || o.distance <= FREE_NEAR)) ? 1 : 2.5) : 2;
  const ordered = out
    .filter((o) => !input.kinds || input.kinds.includes(o.kind))
    .map((o, i) => ({ o, i }))
    .sort((a, b) => rank(a.o) - rank(b.o) || a.i - b.i)
    .map((x) => x.o);
  // The primary source is always one the player can use: a shop that needs an unconfirmed unlock (or that this app has not checked) is only ever an
  // alternative, labelled with its condition.
  const primary = ordered.find((o) => o.access === undefined || o.access === 'open') ?? null;
  return { satisfied: false, primary, alternatives: ordered.filter((o) => o !== primary).slice(0, 2), total: ordered.length };
}

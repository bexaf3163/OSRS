// Where to get an item: one queue of sources for any thing (not only gear), in order:
// in the bank, already in the bag, free nearby, a shop, the exchange, a drop from opponents. A shop slightly dearer than the exchange
// (up to SAVE_GP) goes first: the price is exact, there is no waiting for a deal, and it is usually nearer. "The cheapest" is not always the best:
// 150 gp at the exchange 400 tiles away against 200 gp in a shop 20 away: we take the shop. It buys nothing.

import type { WikiItemDetail } from '../types';
import { matchStrict } from '../services/locationResolver';
import { SAVE_GP } from '../services/gearAdvisor';
import { heldOf, levelOf, type PlayerState, type WorldPoint } from './playerState';
import { SHOP_TOWN, accessSuffix, shopAccess, shopKey, spawnAccess, type AccessState } from './shopAccess';
import { nameKey } from './checklist';
import locationsJson from '../data/majorLocations.json';
import stepsJson from '../data/steps.json';

export type SourceKind = 'bag' | 'bank' | 'free' | 'shop' | 'ge' | 'drop';

export interface SourceOption {
  kind: SourceKind;
  label: string;
  /** The price per piece; for a free one and an "already have" one it is 0; unknown means undefined. */
  price?: number;
  /** Tiles from the player; undefined means the position is unknown. */
  distance?: number;
  point?: WorldPoint & { label: string };
  note?: string;
  /** A shop: whether the player may walk in (shopAccess.ts). Only an open shop is ever the primary source. */
  access?: AccessState;
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

interface Place { x: number; y: number; plane: number; label: string; kind: string }
const banks = Object.values((locationsJson as { locations: Record<string, Place> }).locations).filter((p) => p.kind === 'bank');

/** A free one farther than this counts as "not nearby". */
export const FREE_NEAR = 150;

const dist = (a: WorldPoint, b: WorldPoint) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

function nearestBank(from: WorldPoint | undefined): Place | null {
  if (!banks.length) return null;
  if (!from) return null;
  return banks.reduce((a, b) => (dist(b, from) < dist(a, from) ? b : a));
}

export interface SourceInput {
  name: string;
  need: number;
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
 * A place where the item lies but the player cannot or should not get it: a members-only zone in F2P mode, a drop only by telekinesis
 * or in an inaccessible place, a task zone, the Wilderness. We do not pass such places off as "take it free nearby".
 */
export function unusableSpawn(spawn: string, mode: 'f2p' | 'members'): boolean {
  // Other players can attack in the Wilderness and take what you carry: a few free coins' worth is never worth it (2.72.2, live: Shopping put three
  // planks from the Graveyard of Shadows "on the way" for a Defence 1 character). Guild doors and quest islands are checked too (shopAccess.ts).
  return spawnAccess(spawn, { mode, quests: { known: false }, qp: null, level: () => null }).state === 'blocked';
}

/**
 * Items an NPC hands out for free, from the route step that already sends the player to that NPC (its place is the step's, never a second copy):
 * Duke Horacio gives the Anti-dragon shield during Dragon Slayer I and after it (OSRS Wiki, "Duke Horacio", "Anti-dragon shield"). Lumbridge is also
 * where the free Home Teleport lands, so the giver comes before any shop or the exchange however far the player is.
 */
const FREE_GIVERS: Record<string, { stepId: string; note: string }> = {
  'anti-dragon shield': { stepId: 'S5-02', note: 'during or after Dragon Slayer I; Home Teleport takes you to Lumbridge' },
};

function freeGiver(name: string, here: WorldPoint | undefined): SourceOption | null {
  const g = FREE_GIVERS[nameKey(name)];
  const step = g && (stepsJson as { id: string; mapLocation?: WorldPoint & { label: string } }[]).find((x) => x.id === g.stepId);
  if (!g || !step?.mapLocation) return null;
  const p = step.mapLocation;
  return {
    kind: 'free', label: `Free: ${p.label}`, price: 0, note: g.note, giver: true,
    point: { x: p.x, y: p.y, plane: p.plane, label: p.label }, ...(here ? { distance: dist(p, here) } : {}),
  };
}

/** A shop price at or above this is the item data's "not sold here" placeholder, not a price. */
const NOT_SOLD_PRICE = 1e9;

export function planSources(input: SourceInput, s: PlayerState): SourcePlan {
  const here = s.position.known ? s.position.value : undefined;
  const held = heldOf(s, input.name, input.manualKey);
  const have = (held.bag ?? 0) + held.noted;
  const out: SourceOption[] = [];
  if (have >= input.need) {
    return { satisfied: true, primary: { kind: 'bag', label: `In the bag: ${have}`, price: 0 }, alternatives: [], total: 1 };
  }
  if ((held.bank ?? 0) > 0 && have + (held.bank ?? 0) >= input.need) {
    const b = nearestBank(here);
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
      kind: 'shop', label: `${town ? `${name} — ${town}` : name}${accessSuffix(access)}`, price: b.price + toll, access: access.state,
      ...(p ? { point: { x: p.x, y: p.y, plane: p.plane, label: p.label }, distance: here ? dist(p, here) : undefined } : {}),
      ...(notes.length ? { note: notes.join('; ') } : {}),
    });
  }
  // The nearest open shop; among equal ones — the cheaper. A shop the player may not be able to enter comes after the exchange, never first.
  shops.sort((a, b) => Number(a.access !== 'open') - Number(b.access !== 'open') || (a.distance ?? Infinity) - (b.distance ?? Infinity) || (a.price ?? 0) - (b.price ?? 0));
  const shop = shops[0];
  const cheapShopFirst = shop && shop.access === 'open' && (ge === undefined || (shop.price ?? Infinity) - ge < SAVE_GP);
  if (shop && cheapShopFirst) out.push(shop);
  if (geOption) out.push(geOption);
  if (shop && !cheapShopFirst) out.push(shop);
  for (const sh of shops.slice(1, 2)) out.push(sh);
  if (d?.dropSources?.length) {
    const top = d.dropSources[0];
    // The wiki names some drop tables with an anchor ("Scurrius#non-MVP"): the monster is the part before it.
    out.push({ kind: 'drop', label: `Dropped by ${top.monster.replace(/#.*/, '')}`, note: top.rate });
  }
  // First the free and the already owned, the rest in the found order.
  // "Free nearby" is no farther than FREE_NEAR tiles; farther, the free one goes on a par with the shop and the exchange.
  const rank = (o: SourceOption): number =>
    o.kind === 'bag' || o.kind === 'bank' ? 0 : o.access !== undefined && o.access !== 'open' ? 2.6
      : o.kind === 'free' ? (o.giver || o.distance === undefined || o.distance <= FREE_NEAR ? 1 : 2.5) : o.kind === 'drop' ? 3 : 2;
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

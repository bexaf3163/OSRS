// Where to get an item: one queue of sources for any thing (not only gear), in order:
// in the bank, already in the bag, free nearby, a shop, the exchange, a drop from opponents. A shop slightly dearer than the exchange
// (up to SAVE_GP) goes first: the price is exact, there is no waiting for a deal, and it is usually nearer. "The cheapest" is not always the best:
// 150 gp at the exchange 400 tiles away against 200 gp in a shop 20 away: we take the shop. It buys nothing.

import type { WikiItemDetail } from '../types';
import { matchStrict } from '../services/locationResolver';
import { SAVE_GP } from '../services/gearAdvisor';
import { heldOf, type PlayerState, type WorldPoint } from './playerState';
import locationsJson from '../data/majorLocations.json';

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
  gePrice?: number;
  manualKey?: string;
  /** The Al Kharid toll gate is free. */
  freeToll?: boolean;
}

/**
 * A place where the item lies but the player cannot get it: a members-only zone in F2P mode, a drop only by telekinesis
 * or in an inaccessible place, a task zone. We do not pass such places off as "take it free nearby".
 */
export function unusableSpawn(spawn: string, mode: 'f2p' | 'members'): boolean {
  if (/inaccessible|telegrab|telekinetic|task-only/i.test(spawn)) return true;
  return mode === 'f2p' && /members only/i.test(spawn);
}

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
  const ge = input.gePrice ?? d?.gePrice?.buyPrice;
  const geAt = matchStrict('Grand Exchange');
  const geOption: SourceOption | null = d?.gePrice || input.gePrice !== undefined
    ? {
      kind: 'ge', label: 'Grand Exchange', ...(ge !== undefined ? { price: ge } : {}),
      ...(geAt ? { point: { x: geAt.x, y: geAt.y, plane: geAt.plane, label: geAt.label }, distance: here ? dist(geAt, here) : undefined } : {}),
      note: 'the deal may take time',
    }
    : null;
  for (const spawn of d?.freeSpawns ?? []) {
    if (unusableSpawn(spawn, s.mode)) continue;
    const p = matchStrict(spawn);
    out.push({
      kind: 'free', label: `Free: ${spawn}`, price: 0,
      ...(p ? { point: { x: p.x, y: p.y, plane: p.plane, label: p.label }, distance: here ? dist(p, here) : undefined } : {}),
    });
  }
  const shops: SourceOption[] = [];
  for (const b of d?.buyLocations ?? []) {
    if (b.members && s.mode === 'f2p') continue;
    if (typeof b.stock === 'number' && b.stock === 0) continue;
    const p = matchStrict(b.location) ?? matchStrict(b.shopName);
    const toll = b.location === 'Al Kharid' && !input.freeToll ? 10 : 0;
    shops.push({
      kind: 'shop', label: `${b.shopName.replace(/\.$/, '')} — ${b.location}`, price: b.price + toll,
      ...(p ? { point: { x: p.x, y: p.y, plane: p.plane, label: p.label }, distance: here ? dist(p, here) : undefined } : {}),
      ...(toll ? { note: `gate toll ${toll} gp` } : {}),
    });
  }
  // The nearest shop; among equal ones — the cheaper.
  shops.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity) || (a.price ?? 0) - (b.price ?? 0));
  const shop = shops[0];
  const cheapShopFirst = shop && (ge === undefined || (shop.price ?? Infinity) - ge < SAVE_GP);
  if (shop && cheapShopFirst) out.push(shop);
  if (geOption) out.push(geOption);
  if (shop && !cheapShopFirst) out.push(shop);
  for (const sh of shops.slice(1, 2)) out.push(sh);
  if (d?.dropSources?.length) {
    const top = d.dropSources[0];
    out.push({ kind: 'drop', label: `Dropped by ${top.monster}`, note: top.rate });
  }
  // First the free and the already owned, the rest in the found order.
  // "Free nearby" is no farther than FREE_NEAR tiles; farther, the free one goes on a par with the shop and the exchange.
  const rank = (o: SourceOption): number =>
    o.kind === 'bag' || o.kind === 'bank' ? 0 : o.kind === 'free' ? (o.distance === undefined || o.distance <= FREE_NEAR ? 1 : 2.5) : o.kind === 'drop' ? 3 : 2;
  const ordered = out
    .map((o, i) => ({ o, i }))
    .sort((a, b) => rank(a.o) - rank(b.o) || a.i - b.i)
    .map((x) => x.o);
  return { satisfied: false, primary: ordered[0] ?? null, alternatives: ordered.slice(1, 3), total: ordered.length };
}

// Откуда взять предмет: одна очередь источников для любой вещи (не только снаряжения), по порядку:
// в банке → уже в сумке → бесплатно рядом → магазин → биржа → добыча с противников. Магазин немногим дороже биржи
// (до SAVE_GP) идёт раньше: цена точная, сделку ждать не надо, и обычно он ближе. «Самое дешёвое» — не всегда лучшее:
// 150 gp на бирже в 400 клетках против 200 gp в магазине в 20 — берём магазин. Ничего не покупает.

import type { WikiItemDetail } from '../types';
import { matchStrict } from '../services/locationResolver';
import { SAVE_GP } from '../services/gearAdvisor';
import { heldOf, type PlayerState, type WorldPoint } from './playerState';
import locationsJson from '../data/majorLocations.json';

export type SourceKind = 'bag' | 'bank' | 'free' | 'shop' | 'ge' | 'drop';

export interface SourceOption {
  kind: SourceKind;
  label: string;
  /** Цена за штуку; у бесплатного и «уже есть» — 0; неизвестна — undefined. */
  price?: number;
  /** Клеток от игрока; undefined — положение неизвестно. */
  distance?: number;
  point?: WorldPoint & { label: string };
  note?: string;
}

export interface SourcePlan {
  /** Уже достаточно — ничего искать не надо. */
  satisfied: boolean;
  primary: SourceOption | null;
  /** Не больше двух запасных. */
  alternatives: SourceOption[];
  /** Всего вариантов, включая скрытые. */
  total: number;
}

interface Place { x: number; y: number; plane: number; label: string; kind: string }
const banks = Object.values((locationsJson as { locations: Record<string, Place> }).locations).filter((p) => p.kind === 'bank');

/** Бесплатное дальше этого считается «не рядом». */
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
  /** Карточка предмета из базы (магазины, спавны, добыча, цена биржи). */
  detail?: WikiItemDetail;
  /** Цена биржи, если свежее, чем в карточке. */
  gePrice?: number;
  manualKey?: string;
  /** Шлагбаум Al Kharid бесплатный. */
  freeToll?: boolean;
}

export function planSources(input: SourceInput, s: PlayerState): SourcePlan {
  const here = s.position.known ? s.position.value : undefined;
  const held = heldOf(s, input.name, input.manualKey);
  const have = (held.bag ?? 0) + held.noted;
  const out: SourceOption[] = [];
  if (have >= input.need) {
    return { satisfied: true, primary: { kind: 'bag', label: `В сумке: ${have}`, price: 0 }, alternatives: [], total: 1 };
  }
  if ((held.bank ?? 0) > 0 && have + (held.bank ?? 0) >= input.need) {
    const b = nearestBank(here);
    out.push({
      kind: 'bank', label: `В банке: ${held.bank}`, price: 0,
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
      note: 'сделка может занять время',
    }
    : null;
  for (const spawn of d?.freeSpawns ?? []) {
    const p = matchStrict(spawn);
    out.push({
      kind: 'free', label: `Бесплатно: ${spawn}`, price: 0,
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
      ...(toll ? { note: `плата за проход ${toll} gp` } : {}),
    });
  }
  // Ближайший магазин; из равных — дешёвый.
  shops.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity) || (a.price ?? 0) - (b.price ?? 0));
  const shop = shops[0];
  const cheapShopFirst = shop && (ge === undefined || (shop.price ?? Infinity) - ge < SAVE_GP);
  if (shop && cheapShopFirst) out.push(shop);
  if (geOption) out.push(geOption);
  if (shop && !cheapShopFirst) out.push(shop);
  for (const sh of shops.slice(1, 2)) out.push(sh);
  if (d?.dropSources?.length) {
    const top = d.dropSources[0];
    out.push({ kind: 'drop', label: `Выпадает с ${top.monster}`, note: top.rate });
  }
  // Сначала бесплатное и уже имеющееся, остальное — в найденном порядке.
  // «Бесплатно рядом» — не дальше FREE_NEAR клеток; дальше бесплатное идёт вровень с магазином и биржей.
  const rank = (o: SourceOption): number =>
    o.kind === 'bag' || o.kind === 'bank' ? 0 : o.kind === 'free' ? (o.distance === undefined || o.distance <= FREE_NEAR ? 1 : 2.5) : o.kind === 'drop' ? 3 : 2;
  const ordered = out
    .map((o, i) => ({ o, i }))
    .sort((a, b) => rank(a.o) - rank(b.o) || a.i - b.i)
    .map((x) => x.o);
  return { satisfied: false, primary: ordered[0] ?? null, alternatives: ordered.slice(1, 3), total: ordered.length };
}

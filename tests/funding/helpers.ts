// Builders for the funding tests: a price view with exact prices, a player snapshot with exact holdings. Nothing here computes anything the code under test computes.

import type { Held } from '../../src/lib/playerState';
import { tradeRestriction, type TradeRestriction } from '../../src/lib/tradeRestriction';
import type { Confidence, PriceStatus, PriceView, UnitPrice } from '../../src/lib/funding/quotes';
import type { FundingSnapshot, Protection } from '../../src/lib/funding/snapshot';
import type { EvalContext } from '../../src/lib/funding/evaluate';
import { nameKey } from '../../src/lib/checklist';

export interface PriceSpec {
  buy?: number;
  sell?: number;
  /** Items traded in an hour, both sides together; omitted — unknown. */
  volume?: number;
  limit?: number;
  conf?: Confidence;
  notes?: string[];
}

const unit = (price: number, spec: PriceSpec): UnitPrice => ({
  price, basis: 'side', confidence: spec.conf ?? 'HIGH', ageMinutes: 1, volumePerHour: spec.volume ?? null, notes: spec.notes ?? [],
});

export function fakePrices(table: Record<string, PriceSpec>, status: PriceStatus = 'live'): PriceView {
  const byKey = new Map(Object.entries(table).map(([k, v]) => [nameKey(k), v]));
  return {
    status, at: 0,
    buy: (name) => { const s = byKey.get(nameKey(name)); return s?.buy === undefined ? null : unit(s.buy, s); },
    sell: (name) => { const s = byKey.get(nameKey(name)); return s?.sell === undefined ? null : unit(s.sell, s); },
    idOf: () => undefined,
    limitOf: (name) => byKey.get(nameKey(name))?.limit,
  };
}

export interface SnapSpec {
  levels?: Record<string, number>;
  quests?: Record<string, 'DONE' | 'NOT_DONE'>;
  /** name -> total held; a name absent is UNKNOWN unless `bankSeen` makes absence a fact. */
  items?: Record<string, number>;
  bankSeen?: boolean;
  bagCoins?: number | null;
  bankCoins?: number | null;
  restriction?: TradeRestriction;
  protections?: Protection[];
  members?: boolean;
  ironman?: boolean | null;
  position?: { x: number; y: number; plane: number } | null;
  questPoints?: number | null;
  character?: string | null;
  /** The full bag as the game reports it; omitted - unknown. */
  bag?: { name: string; count: number }[] | null;
  connected?: boolean;
}

export function fakeSnap(spec: SnapSpec = {}): FundingSnapshot {
  const levels = spec.levels ?? {};
  const items = spec.items ?? {};
  const bankSeen = spec.bankSeen ?? true;
  const bag = spec.bagCoins === undefined ? 0 : spec.bagCoins;
  const bank = spec.bankCoins === undefined ? 0 : spec.bankCoins;
  const held = (name: string): Held => {
    const n = items[name];
    if (n !== undefined) return { presence: n > 0 ? 'PRESENT' : 'MISSING', bag: n, noted: 0, bank: bankSeen ? 0 : null, equipped: 0, total: n, source: 'game' };
    if (bankSeen) return { presence: 'MISSING', bag: 0, noted: 0, bank: 0, equipped: 0, total: 0, source: 'game' };
    return { presence: 'UNKNOWN', bag: null, noted: 0, bank: null, equipped: 0, total: null, source: 'none' };
  };
  return {
    character: spec.character === undefined ? 'Tester' : spec.character,
    members: spec.members ?? false,
    ironman: spec.ironman === undefined ? false : spec.ironman,
    connected: spec.connected ?? true,
    level: (s) => levels[s],
    quest: (q) => spec.quests?.[q] ?? 'UNKNOWN',
    questPoints: spec.questPoints === undefined ? 50 : spec.questPoints,
    coins: { bag, bank },
    liquid: bag === null ? { amount: bank, complete: false } : bank === null ? { amount: bag, complete: false } : { amount: bag + bank, complete: true },
    bankSeen, bankSavedAt: null,
    held,
    bag: spec.bag ?? null,
    position: spec.position === undefined ? { x: 3093, y: 3495, plane: 0 } : spec.position,
    restriction: spec.restriction ?? tradeRestriction({ questPoints: 50, totalLevel: 500, override: 'lifted' }),
    protections: new Map((spec.protections ?? []).map((p) => [nameKey(p.name), p])),
  };
}

export const GE = { x: 3165, y: 3490, plane: 0 };
/** Straight-line tiles, as the travel model does without teleports. */
export const walk = (a: { x: number; y: number } | null, b: { x: number; y: number }) => (a ? Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) : null);

export function ctxOf(over: Partial<EvalContext> & Pick<EvalContext, 'prices' | 'snap'>): EvalContext {
  return {
    now: 1_792_000_000_000, cash: 5000, mode: 'earn', target: 1000, reach: walk, exchange: GE, ...over,
  };
}

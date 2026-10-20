// The departure check: whether everything from the step's items is in the bag before leaving the bank.
// The count comes from RuneLite (the OWNED event); the rules are the same as in the plugin (Checklist.java).

import type { Step, StepItemRequirement } from '../types';
import { alternativesOf, toolUse, toolFamilyOf, usableAt } from './toolTiers';
import { doseKind, doseName } from './doseKind';

/** How many of an item the player has, by the plugin's data. bank is undefined until the bank was opened in this session. */
export interface OwnedItem {
  name: string;
  id?: number;
  /** In the bag and worn (without banknotes). */
  carried: number;
  /** As banknotes in the bag. */
  noted: number;
  bank?: number;
  /** Older plugins may already include higher tiers in these tool quantities. Never sum them again. */
  legacyToolCount?: boolean;
}

export interface OwnedState {
  bankSeen: boolean;
  /** The bank was taken from a saved earlier session (the time of the write, ms), not read from the game just now; absent means read just now. */
  bankSavedAt?: number;
  /** By the key nameKey(name). */
  items: Map<string, OwnedItem>;
}

/** The name as a comparison key, the same way as ActiveTarget.nameKey in the plugin. */
export function nameKey(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * The quantity from the route: 1, "23 (20 to hand in, 3 for the bank)" gives 23, "20+" gives 20, "1,000" gives 1000.
 * null means the quantity is not a number ("As many as you have", "One per alchemy").
 */
export function parseAmount(amount: string | number): number | null {
  if (typeof amount === 'number') return Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : null;
  const m = amount.match(/^\s*(\d{1,3}(?:[,  ]\d{3})+|\d+)/);
  if (!m) return null;
  const n = Number(m[1].replace(/[,  ]/g, ''));
  return n > 0 ? n : null;
}

export interface PreflightItem {
  nameEn: string;
  id?: number;
  count: number;
  /** false means the route's quantity is not a number: "at least one is there" is checked. */
  exact: boolean;
  heals?: number;
  /** Other items that count in its place (every pickaxe tier for "Bronze pickaxe"). */
  alt?: string[];
  /** Food with a personal plan: what the whole remaining goal needs (`count` is one trip). */
  total?: number;
  /** A potion: the doses `count` potions hold ("Strength potion(4)" ×4 is 16); every size counts toward them (doses.ts, Checklist.java). */
  doses?: number;
}

/** What to check at the bank: the required items except those obtained during the step itself. */
export function preflightItems(step: Step): PreflightItem[] {
  return (step.itemsRequired ?? [])
    .filter((i: StepItemRequirement) => !i.inStep)
    .map((i) => {
      const n = parseAmount(i.amount);
      const alt = alternativesOf(i.nameEn, i.anyOf);
      const dose = doseKind(i.nameEn);
      return {
        nameEn: i.nameEn, id: i.wikiItemId, count: n ?? 1, exact: n !== null, heals: i.heals, ...(alt.length ? { alt } : {}),
        ...(i.totalAmount !== undefined && n !== null && i.totalAmount > n ? { total: i.totalAmount } : {}),
        ...(dose ? { doses: (n ?? 1) * dose.per } : {}),
      };
    });
}

export type PreflightState = 'IN_BAG_READY' | 'MISSING_FROM_BAG' | 'NOT_FOUND_IN_BANK';

export interface PreflightRow {
  item: PreflightItem;
  have: number;
  /** null means the bank was not opened yet. */
  inBank: number | null;
  state: PreflightState;
}

export interface PreflightResult {
  rows: PreflightRow[];
  /** READY_TO_DEPART: everything is on hand. */
  ready: boolean;
  missing: number;
}

export function evaluatePreflight(items: PreflightItem[], owned: OwnedState, levels?: Partial<Record<string, number>> | null): PreflightResult {
  const rows = items.map((item): PreflightRow => {
    // A potion counts in doses across its four sizes, each potion by its own doses: a (3) and a (1) are 4.
    const dose = item.doses !== undefined ? doseKind(item.nameEn) : null;
    const all = dose
      ? [1, 2, 3, 4].map((d) => ({ o: owned.items.get(nameKey(doseName(dose.base, d))), w: d }))
      : [...new Set([item.nameEn, ...(item.alt ?? [])].map(nameKey))]
        .filter((n) => usableAt(n, (skill) => levels?.[skill] ?? null))
        .map((n) => ({ o: owned.items.get(n), w: 1 }));
    const need = item.doses ?? item.count;
    const legacy = Boolean(toolFamilyOf(item.nameEn)) && all.some(({ o }) => o?.legacyToolCount);
    const count = (where: 'carried' | 'bank') => legacy ? Math.max(0, ...all.map(({ o }) => o?.[where] ?? 0)) : all.reduce((s, { o, w }) => s + (o?.[where] ?? 0) * w, 0);
    const have = count('carried');
    const inBank = owned.bankSeen && all.every(({ o }) => o !== undefined) ? count('bank') : null;
    let state: PreflightState;
    if (have >= need) state = 'IN_BAG_READY';
    else if (inBank === null || have + inBank >= need) state = 'MISSING_FROM_BAG';
    else state = 'NOT_FOUND_IN_BANK';
    return { item, have, inBank, state };
  });
  const missing = rows.filter((r) => r.state !== 'IN_BAG_READY').length;
  return { rows, ready: rows.length > 0 && missing === 0, missing };
}


/** Parsing of the OWNED event from the plugin; junk is dropped. */
export function parseOwned(e: unknown): OwnedState | null {
  if (!e || typeof e !== 'object') return null;
  const { bankSeen, items, bankSavedAt } = e as { bankSeen?: unknown; items?: unknown; bankSavedAt?: unknown };
  if (!Array.isArray(items)) return null;
  const map = new Map<string, OwnedItem>();
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.name !== 'string') continue;
    const exact = Object.hasOwn(r, 'exactCarried');
    const valid = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
    // A malformed exact record cannot fall back to the inflated legacy fields or turn into known zero.
    if (exact && (!valid(r.exactCarried) || !valid(r.exactNoted) || (bankSeen === true && !valid(r.exactBank)) || (r.exactBank !== undefined && !valid(r.exactBank)))) continue;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
    map.set(nameKey(r.name), {
      name: r.name,
      id: typeof r.id === 'number' ? r.id : undefined,
      carried: exact ? r.exactCarried as number : num(r.carried),
      noted: exact ? r.exactNoted as number : num(r.noted),
      bank: exact ? (valid(r.exactBank) ? r.exactBank : undefined) : typeof r.bank === 'number' ? num(r.bank) : undefined,
      ...(!exact && (toolUse(r.name) || toolFamilyOf(r.name)) ? { legacyToolCount: true } : {}),
    });
  }
  const saved = typeof bankSavedAt === 'number' && Number.isFinite(bankSavedAt) && bankSavedAt > 0 ? bankSavedAt : undefined;
  return { bankSeen: bankSeen === true, ...(saved !== undefined ? { bankSavedAt: saved } : {}), items: map };
}

/** The player's total: bag, banknotes and the bank (if it was opened). */
export function ownedTotal(owned: OwnedState | null, name: string): number | null {
  if (!owned) return null;
  const o = owned.items.get(nameKey(name));
  if (!o) return null;
  return o.carried + o.noted + (o.bank ?? 0);
}

// The departure check: whether everything from the step's items is in the bag before leaving the bank.
// The count comes from RuneLite (the OWNED event); the rules are the same as in the plugin (Checklist.java).

import type { Step, StepItemRequirement } from '../types';

/** How many of an item the player has, by the plugin's data. bank is undefined until the bank was opened in this session. */
export interface OwnedItem {
  name: string;
  id?: number;
  /** In the bag and worn (without banknotes). */
  carried: number;
  /** As banknotes in the bag. */
  noted: number;
  bank?: number;
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
  return s.replace(/<[^>]*>/g, '').replace(/00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
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
}

/** What to check at the bank: the required items except those obtained during the step itself. */
export function preflightItems(step: Step): PreflightItem[] {
  return (step.itemsRequired ?? [])
    .filter((i: StepItemRequirement) => !i.inStep)
    .map((i) => {
      const n = parseAmount(i.amount);
      return { nameEn: i.nameEn, id: i.wikiItemId, count: n ?? 1, exact: n !== null, heals: i.heals };
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

export function evaluatePreflight(items: PreflightItem[], owned: OwnedState): PreflightResult {
  const rows = items.map((item): PreflightRow => {
    const o = owned.items.get(nameKey(item.nameEn));
    const have = o?.carried ?? 0;
    const inBank = owned.bankSeen ? o?.bank ?? 0 : null;
    let state: PreflightState;
    if (have >= item.count) state = 'IN_BAG_READY';
    else if (inBank === null || have + inBank >= item.count) state = 'MISSING_FROM_BAG';
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
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
    map.set(nameKey(r.name), {
      name: r.name,
      id: typeof r.id === 'number' ? r.id : undefined,
      carried: num(r.carried),
      noted: num(r.noted),
      bank: typeof r.bank === 'number' ? num(r.bank) : undefined,
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

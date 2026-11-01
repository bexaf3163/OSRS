// Owned items shared by the engines: amounts from step text and the OWNED event from RuneLite. The departure check
// that uses them (the same rules as the plugin's Checklist.java) is in src/domain/readiness/preflight.ts.

import { toolUse, toolFamilyOf } from './toolTiers';
import { nameKey } from './itemKey';

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

// Storing the resource journal between sessions. The journal is separate for each profile and character: the gains of one
// account do not enter the totals of another. It lives in the window's storage (localStorage): the journal is a reference, not progress, so
// it has no separate file next to the app, and any damage simply starts it again.
// Records older than 30 days and over the limit are dropped; broken records are not loaded.

import type { LedgerEntry, LedgerReason } from './ledger';

export const LEDGER_KEY = 'osrs-put:ledger';
export const LEDGER_LIMIT = 2000;
export const LEDGER_MAX_AGE_MS = 30 * 24 * 3600_000;

const REASONS: ReadonlySet<string> = new Set<LedgerReason>(['LOOT', 'PICKUP', 'PURCHASE', 'SALE', 'QUEST_REWARD', 'BANK_TRANSFER', 'CONSUMED', 'UNKNOWN']);

/** The journal key: the profile and the character's name (without a name, the shared "unknown"). */
export function ledgerKey(profileId: string, player: string | null | undefined): string {
  const who = (player ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${LEDGER_KEY}:${profileId}:${who || '-'}`;
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function valid(e: unknown): e is LedgerEntry {
  if (!e || typeof e !== 'object') return false;
  const o = e as Record<string, unknown>;
  return typeof o.name === 'string' && o.name.length > 0 && o.name.length < 80
    && typeof o.quantityDelta === 'number' && Number.isFinite(o.quantityDelta)
    && typeof o.reason === 'string' && REASONS.has(o.reason)
    && typeof o.timestamp === 'number' && Number.isFinite(o.timestamp)
    && (o.estimatedGpValue === undefined || (typeof o.estimatedGpValue === 'number' && Number.isFinite(o.estimatedGpValue)));
}

/** Fresh records by time and limit; the order is kept. */
export function trim(entries: LedgerEntry[], now: number): LedgerEntry[] {
  return entries.filter((e) => now - e.timestamp <= LEDGER_MAX_AGE_MS && e.timestamp <= now + 60_000).slice(-LEDGER_LIMIT);
}

export function loadLedger(store: Store | undefined, key: string, now: number): LedgerEntry[] {
  try {
    const text = store?.getItem(key);
    if (!text) return [];
    const data: unknown = JSON.parse(text);
    if (!Array.isArray(data)) return [];
    return trim(data.filter(valid), now);
  } catch {
    return [];
  }
}

export function saveLedger(store: Store | undefined, key: string, entries: LedgerEntry[]): void {
  try {
    if (!entries.length) store?.removeItem(key);
    else store?.setItem(key, JSON.stringify(entries));
  } catch {
    // The storage is full or closed: the journal stays in memory until the end of the session.
  }
}

/** Records made from the moment since (the current session). */
export function since(entries: LedgerEntry[], from: number): LedgerEntry[] {
  return entries.filter((e) => e.timestamp >= from);
}

// The player's own say in the inventory cleanup: "Always keep" and dismissed suggestions. Saved per profile AND per character, so another
// character on the same profile starts clean and never inherits the first one's choices.

export const CLEANUP_KEY = 'osrs-put:cleanup';
const LIMIT = 300;

export function cleanupKey(profileId: string, player: string | null | undefined): string {
  const who = (player ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${CLEANUP_KEY}:${profileId}:${who || '-'}`;
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 120))].slice(0, LIMIT) : [];

/** Anything unreadable is "no preferences", never a crash. */
export function parseCleanupPrefs(raw: string | null): CleanupPrefs {
  if (!raw) return emptyCleanupPrefs();
  try {
    const o = JSON.parse(raw) as { keep?: unknown; dismissed?: unknown; account?: unknown } | null;
    if (!o || typeof o !== 'object') return emptyCleanupPrefs();
    const account: AccountKind | undefined = o.account === 'ironman' || o.account === 'normal' ? o.account : undefined;
    return { keep: strings(o.keep), dismissed: strings(o.dismissed), ...(account ? { account } : {}) };
  } catch {
    return emptyCleanupPrefs();
  }
}

export const withKeep = (p: CleanupPrefs, key: string, on: boolean): CleanupPrefs => ({
  ...p, keep: on ? [...new Set([...p.keep, key])].slice(-LIMIT) : p.keep.filter((k) => k !== key),
});
export const withDismissed = (p: CleanupPrefs, key: string, action: string, on: boolean): CleanupPrefs => {
  const id = `${key}|${action}`;
  return { ...p, dismissed: on ? [...new Set([...p.dismissed, id])].slice(-LIMIT) : p.dismissed.filter((k) => k !== id) };
};
export const withAccount = (p: CleanupPrefs, account: AccountKind | null): CleanupPrefs => {
  const { account: _drop, ...rest } = p;
  void _drop;
  return account ? { ...rest, account } : rest;
};

export type AccountKind = 'normal' | 'ironman';
export interface CleanupPrefs {
  /** nameKey of items the player marked "Always keep". */
  keep: string[];
  /** "nameKey|action" of suggestions the player dismissed: a different suggestion for the same item shows again. */
  dismissed: string[];
  /** The player's word about the account when the game did not say. */
  account?: AccountKind;
}
export const emptyCleanupPrefs = (): CleanupPrefs => ({ keep: [], dismissed: [] });

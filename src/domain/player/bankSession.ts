/** Reminder metadata only. Actual bank stock and freshness remain in the existing player/owned state. */
export interface BankSessionEntry { sessionId: string; acknowledged: boolean; liveRead: boolean }
export type BankSessionBook = Readonly<Record<string, BankSessionEntry>>;
export interface BankSessionIdentity { characterId: string; gameSessionId: string }

export function parseBankSessions(raw: unknown): BankSessionBook {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).slice(-32).filter(([id, entry]) => {
    if (!id || id.length > 160 || !entry || typeof entry !== 'object') return false;
    const value = entry as Partial<BankSessionEntry>;
    return typeof value.sessionId === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(value.sessionId)
      && typeof value.acknowledged === 'boolean' && typeof value.liveRead === 'boolean';
  }).map(([id, value]) => { const entry = value as BankSessionEntry;
    return [id, { sessionId: entry.sessionId, acknowledged: entry.acknowledged, liveRead: entry.liveRead }]; }));
}

/** Only a verified login identity starts a notice. Reconnects, navigation and price updates never do. */
export function bankSessionNotice(book: BankSessionBook, identity: BankSessionIdentity | null, liveRead: boolean): {
  book: BankSessionBook; show: boolean;
} {
  if (!identity) return { book, show: false };
  const previous = book[identity.characterId];
  const same = previous?.sessionId === identity.gameSessionId;
  const entry = same ? previous : { sessionId: identity.gameSessionId, acknowledged: false, liveRead: false };
  const seen = entry.liveRead || liveRead;
  const next = seen === entry.liveRead ? entry : { ...entry, liveRead: seen };
  const updated = same && next === previous ? book : Object.fromEntries([...Object.entries(book).filter(([id]) => id !== identity.characterId), [identity.characterId, next]].slice(-32));
  return { book: updated, show: !next.acknowledged && !next.liveRead };
}

export function acknowledgeBankNotice(book: BankSessionBook, identity: BankSessionIdentity): BankSessionBook {
  const current = bankSessionNotice(book, identity, false).book;
  const entry = current[identity.characterId];
  return entry.acknowledged ? current : { ...current, [identity.characterId]: { ...entry, acknowledged: true } };
}

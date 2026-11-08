import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBridge } from '../bridge';
import { useProfiles } from '../profiles';
import { usePlayerState } from '../playerStateContext';
import { acknowledgeBankNotice, bankSessionNotice, parseBankSessions } from '../../domain/player/bankSession';
import type { BankSessionBook } from '../../domain/player/bankSession';
import { nameKey } from '../../domain/items/itemKey';
import { STORAGE_KEYS } from '../../domain/persistence/storageKeys';

function load(): BankSessionBook {
  try { return parseBankSessions(JSON.parse(localStorage.getItem(STORAGE_KEYS.bankSessions) ?? '{}')); }
  catch { return {}; }
}
export function useBankNotice() {
  const { questStates, inGame, gate } = useBridge();
  const profiles = useProfiles();
  const { state } = usePlayerState();
  const [book, setBook] = useState(load);
  const allowed = gate.kind === 'ok' || gate.kind === 'link';
  const identity = useMemo(() => allowed && inGame && state.connected && questStates
    ? { characterId: `${profiles.active}:${nameKey(questStates.player)}`, gameSessionId: questStates.sessionId } : null,
  [allowed, inGame, state.connected, questStates?.player, questStates?.sessionId, profiles.active]);
  const liveRead = state.bankSeen && !state.owned?.bankSavedAt;
  const notice = useMemo(() => bankSessionNotice(book, identity, liveRead), [book, identity, liveRead]);
  useEffect(() => { if (notice.book !== book) setBook(notice.book); }, [notice.book, book]);
  useEffect(() => {
    if (!identity) return;
    try { localStorage.setItem(STORAGE_KEYS.bankSessions, JSON.stringify(book)); }
    catch { /* Reminder metadata stays in memory; bank holdings are never written here. */ }
  }, [book, identity]);
  const dismiss = useCallback(() => { if (identity) setBook(previous => acknowledgeBankNotice(previous, identity)); }, [identity]);
  return { show: notice.show, dismiss };
}

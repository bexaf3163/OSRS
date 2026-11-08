import { nameKey } from '../items/itemKey';

export type ObservedQuestState = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'UNKNOWN';
export interface QuestObservation {
  player: string;
  sessionId: string;
  revision: number;
  states: Readonly<Record<string, ObservedQuestState>>;
  questPoints?: number | null;
}

/** Optional protocol-6 extension. An older or malformed payload conveys no quest-start evidence. */
export function parseQuestObservation(raw: unknown): QuestObservation | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.player !== 'string' || !value.player.trim() || value.player.length > 80
    || typeof value.sessionId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(value.sessionId)
    || !Number.isSafeInteger(value.revision) || (value.revision as number) < 1
    || !value.states || typeof value.states !== 'object' || Array.isArray(value.states)) return null;
  const rows = Object.entries(value.states);
  if (value.questPoints !== undefined && value.questPoints !== null && (!Number.isInteger(value.questPoints) || (value.questPoints as number) < 0 || (value.questPoints as number) > 500)) return null;
  if (rows.length > 300 || rows.some(([id, state]) => !id.trim() || id.length > 80
    || !['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'UNKNOWN'].includes(state as string))) return null;
  return { player: value.player, sessionId: value.sessionId, revision: value.revision as number, states: Object.fromEntries(rows) as QuestObservation['states'],
    ...(value.questPoints !== undefined ? { questPoints: value.questPoints as number | null } : {}) };
}

/** Old-session SSE/status replies cannot replace a newer full observation or cross character identity. */
export function admitQuestObservation(next: QuestObservation | null, previous: QuestObservation | null, player: string | null, authoritativeSession = false): QuestObservation | null {
  if (!player) return null;
  if (!next || nameKey(next.player) !== nameKey(player)) return previous;
  if (previous && previous.sessionId !== next.sessionId && !authoritativeSession) return previous;
  if (previous && previous.sessionId === next.sessionId && nameKey(previous.player) === nameKey(next.player) && previous.revision > next.revision) return previous;
  return next;
}

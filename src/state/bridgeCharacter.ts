// The character in the game. Its levels go into the profile, and the session summary counts from its first values.

import { useCallback, useEffect, useRef, useState } from 'react';
import { levelById } from '../data';
import type { SessionBase } from '../domain/player/session';
import { gateAllows, linkPlayer } from '../domain/persistence/profiles';
import { readProfiles, writeProfiles } from './profiles';
import type { BridgeCore } from './bridgeCore';

/** Levels and the profile binding from the game, and this session's summary and XP rate. */
export function useCharacter({ progress, setLevels, state, inGame, stats, xp, player, tracker, gate, features, latest }: BridgeCore) {
  const [session, setSession] = useState<SessionBase>(() => ({
    startedAt: Date.now(), levels0: null, xp0: null,
    closed0: Object.entries(progress.steps).filter(([, v]) => v === 'done' || v === 'skipped').map(([k]) => k),
  }));

  // Levels from the game go into the level fields by themselves — only when the character is the same as in the profile.
  useEffect(() => {
    if (!features.levelsFromGame || !stats || state !== 'online' || !inGame || !gateAllows(gate)) return;
    const known: Record<string, number> = {};
    // Hitpoints too, though it has no level field: without it the last levels cannot work out a combat plan while the game is away (2.72.1).
    for (const [id, v] of Object.entries(stats)) if (levelById.has(id) || id === 'hitpoints') known[id] = v;
    setLevels(known);
  }, [stats, features.levelsFromGame, gate, setLevels, state, inGame]);

  // The first character seen is bound to the profile without a name.
  useEffect(() => {
    if (gate.kind !== 'link') return;
    const s = readProfiles();
    writeProfiles(linkPlayer(s, s.active, gate.player));
  }, [gate]);

  // The session summary is counted from the first received values; another character — a new session.
  const sessionPlayer = useRef<string | null>(null);
  useEffect(() => {
    if (player && sessionPlayer.current && sessionPlayer.current !== player) {
      setSession({ startedAt: Date.now(), levels0: null, xp0: null, closed0: Object.entries(latest.current.progress.steps).filter(([, v]) => v === 'done' || v === 'skipped').map(([k]) => k) });
      tracker.current.reset();
    }
    if (player) sessionPlayer.current = player;
  }, [player]);
  useEffect(() => {
    setSession((s) => {
      const levels0 = s.levels0 ?? stats;
      const xp0 = s.xp0 ?? xp;
      return levels0 === s.levels0 && xp0 === s.xp0 ? s : { ...s, levels0, xp0 };
    });
  }, [stats, xp]);

  const xpRate = useCallback((skill: string) => tracker.current.rate(skill), []);
  return { session, xpRate };
}

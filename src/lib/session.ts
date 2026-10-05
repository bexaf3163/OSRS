// The session summary: what changed since the app received the first levels and XP from the game.

import type { PlayerStats } from '../types';

/** What the session started with: the first levels and XP received from the game, and the steps closed by the time the app launched. */
export interface SessionBase {
  startedAt: number;
  levels0: PlayerStats | null;
  xp0: PlayerStats | null;
  closed0: string[];
}

export interface SessionSummary {
  /** How long the session has lasted, minutes. */
  minutes: number;
  /** XP by skill since the start of the session, the most first; levels is how much the levels grew. */
  xpGained: { skill: string; xp: number; levels: number }[];
  /** Steps closed in the session. */
  stepsDone: number;
}

export function sessionSummary(base: SessionBase, now: number, xp: PlayerStats | null, levels: PlayerStats | null, closedNow: readonly string[]): SessionSummary {
  const gained: SessionSummary['xpGained'] = [];
  if (base.xp0 && xp) {
    for (const [skill, value] of Object.entries(xp)) {
      const before = base.xp0[skill];
      if (before === undefined || value <= before) continue;
      const lv = base.levels0 && levels && base.levels0[skill] !== undefined && levels[skill] !== undefined ? Math.max(0, levels[skill] - base.levels0[skill]) : 0;
      gained.push({ skill, xp: value - before, levels: lv });
    }
    gained.sort((a, b) => b.xp - a.xp);
  }
  const was = new Set(base.closed0);
  return {
    minutes: Math.max(0, Math.round((now - base.startedAt) / 60_000)),
    xpGained: gained,
    stepsDone: closedNow.filter((id) => !was.has(id)).length,
  };
}

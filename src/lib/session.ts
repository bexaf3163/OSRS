// Сводка сеанса: что изменилось с тех пор, как программа получила от игры первые уровни и опыт.

import type { PlayerStats } from '../types';

/** С чего начался сеанс: первые полученные из игры уровни и опыт и шаги, закрытые к запуску программы. */
export interface SessionBase {
  startedAt: number;
  levels0: PlayerStats | null;
  xp0: PlayerStats | null;
  closed0: string[];
}

export interface SessionSummary {
  /** Сколько идёт сеанс, минут. */
  minutes: number;
  /** Опыт по навыкам с начала сеанса, больше всего — первым; levels — на сколько выросли уровни. */
  xpGained: { skill: string; xp: number; levels: number }[];
  /** Шагов закрыто за сеанс. */
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

// The XP from the game to the goal: how much is left and in how many minutes at this session's pace. The pace is from measurements only
// (at least half a minute of gain is needed): without them the time is not invented.

import { levelById } from '../data';
import { useBridge } from '../bridge';
import { etaMinutes, etaText } from '../lib/xpRate';
import { xpForLevel } from '../lib/xp';
import { ProgressBar } from './ProgressBar';

export interface XpTarget {
  skill: string;
  level: number;
}

export function LiveXp({ targets }: { targets: readonly XpTarget[] }) {
  const { xp, xpRate } = useBridge();
  if (!xp) return null;
  const rows = targets
    .filter((t) => xp[t.skill] !== undefined)
    .map((t) => {
      const have = xp[t.skill];
      const goal = xpForLevel(t.level);
      const left = Math.max(0, goal - have);
      const rate = xpRate(t.skill);
      const eta = etaMinutes(left, rate);
      return { t, have, goal, left, rate, eta };
    });
  if (!rows.length) return null;
  return (
    <div className="live-xp" aria-label="XP from the game">
      {rows.map(({ t, have, goal, left, rate, eta }) => (
        <div key={t.skill} className="live-xp-row">
          <span className="live-xp-name">{levelById.get(t.skill)?.name ?? t.skill}</span>
          {left === 0
            ? <span className="live-xp-text">✓ level {t.level} reached</span>
            : (
              <span className="live-xp-text">
                to {t.level}: {left.toLocaleString('en-US')} XP left
                {rate ? ` · ${rate.toLocaleString('en-US')}/h${eta ? ` · ${etaText(eta)}` : ''}` : ' · the pace will appear once XP starts coming'}
              </span>
            )}
          <ProgressBar value={goal > 0 ? have / goal : 0} label={`XP to level ${t.level}`} />
        </div>
      ))}
    </div>
  );
}

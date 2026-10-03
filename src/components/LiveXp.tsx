// Опыт из игры до цели: сколько осталось и через сколько минут по темпу этого сеанса. Темп — только по замерам
// (нужно хотя бы полминуты прироста): без них время не придумывается.

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
    <div className="live-xp" aria-label="Опыт из игры">
      {rows.map(({ t, have, goal, left, rate, eta }) => (
        <div key={t.skill} className="live-xp-row">
          <span className="live-xp-name">{levelById.get(t.skill)?.name ?? t.skill}</span>
          {left === 0
            ? <span className="live-xp-text">✓ уровень {t.level} взят</span>
            : (
              <span className="live-xp-text">
                до {t.level}: ещё {left.toLocaleString('ru-RU')} опыта
                {rate ? ` · ${rate.toLocaleString('ru-RU')}/ч${eta ? ` · ${etaText(eta)}` : ''}` : ' · темп появится, когда пойдёт опыт'}
              </span>
            )}
          <ProgressBar value={goal > 0 ? have / goal : 0} label={`Опыт до ${t.level} уровня`} />
        </div>
      ))}
    </div>
  );
}

// Стиль игры: «спокойно» или «эффективно». Одна настройка, которую читают все помощники, вместо отдельных переключателей:
//  — спокойно: меньше на экране, ничего не навязывается; способы прокачки — без риска и без лишних кликов;
//  — эффективно: больше подсказок и сравнений; способы — самые быстрые из доступных, с оценкой времени.
// Стиль меняет только подачу и порядок выбора. Требования к шагу, безопасность и «неизвестно — не нет» одинаковы всегда.

import type { Features } from './features';

export type PlayStyle = 'chill' | 'efficient';

export interface StyleProfile {
  style: PlayStyle;
  label: string;
  /** Шагов вперёд после текущего в «одной ходке». */
  lookAhead: number;
  /** Показывать «Позже» в одной ходке. */
  showLater: boolean;
  /** Показывать оценку времени и сравнение способов. */
  showTime: boolean;
  /** Сколько других способов показывать сразу (остальное — в «Подробнее»). */
  alternatives: number;
  /** quiet — сообщения только о главном (готово, пора вернуться); full — ещё и «что дальше в очереди». */
  announce: 'quiet' | 'full';
}

export const STYLES: Record<PlayStyle, StyleProfile> = {
  chill: { style: 'chill', label: '🌿 Спокойно', lookAhead: 2, showLater: false, showTime: false, alternatives: 0, announce: 'quiet' },
  efficient: { style: 'efficient', label: '⚡ Эффективно', lookAhead: 4, showLater: true, showTime: true, alternatives: 3, announce: 'full' },
};

export const styleOf = (f: Pick<Features, 'efficient'>): StyleProfile => (f.efficient ? STYLES.efficient : STYLES.chill);

// Тексты темпа прокачки для приложения (те же, что пишет плагин в микро-HUD).

import type { PacingState } from '../services/runeliteBridge';

export const PACING_ICON: Record<PacingState['skill'], string> = { fishing: '🐟', woodcutting: '🪵', cooking: '🍖', mining: '⛏️' };
export const PACING_SKILL: Record<PacingState['skill'], string> = { fishing: 'Fishing', woodcutting: 'Woodcutting', cooking: 'Cooking', mining: 'Mining' };

/** Форма слова для числа из «креветка|креветки|креветок»; одна форма — как есть. */
export function actionForm(forms: string, n: number): string {
  const f = forms.split('|');
  if (f.length < 3) return f[0];
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return f[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return f[1];
  return f[2];
}

/** «≈ 7 мин»; без замеров — «время рассчитывается…»; оценка из данных шага помечена «примерно». */
export function etaText(p: Pick<PacingState, 'etaSeconds' | 'estimated'>): string {
  if (p.etaSeconds === null) return 'время рассчитывается…';
  const min = Math.round(p.etaSeconds / 60);
  return `${p.estimated ? 'примерно ' : '≈ '}${min < 1 ? 'меньше минуты' : `${min} мин`}`;
}

export function pacingText(p: PacingState, actionName: string): string {
  if (p.done) return `✓ Целевой уровень достигнут: ${p.targetLevel} ${PACING_SKILL[p.skill]}`;
  const line = `${p.actionsLeft} ${actionForm(actionName, p.actionsLeft)} до ${p.targetLevel} ${PACING_SKILL[p.skill]}`;
  return p.almost ? `✓ Почти готово: ${line}` : line;
}

// Темп прокачки из игры: «🐟 34 креветки до 20 Fishing · ≈ 7 мин». Считает плагин RuneLite по опыту;
// пока замеров мало, время не выдумывается — «время рассчитывается…».

import type { Step } from '../types';
import { useBridge } from '../bridge';
import { useFeatures } from '../lib/features';
import { etaText, PACING_ICON as ICON, pacingText } from '../lib/pacing';

export function PacingLine({ step }: { step: Step }) {
  const { pacing, activeStepId } = useBridge();
  const { pacing: on } = useFeatures();
  if (!on || !step.pacing) return null;
  if (!pacing || pacing.stepId !== step.id || activeStepId !== step.id) {
    return activeStepId === step.id
      ? <p className="pacing muted small">{ICON[step.pacing.skill]} Темп появится после первого опыта в игре.</p>
      : null;
  }
  const good = pacing.almost || pacing.done;
  return (
    <p className={`pacing ${good ? 'is-good' : ''}`} role="status" aria-live="polite">
      <span className="pacing-icon" aria-hidden="true">{ICON[pacing.skill]}</span>
      <span className="pacing-main">{pacingText(pacing, step.pacing.actionName)}</span>
      {!pacing.done && !pacing.almost && <span className="pacing-eta">{etaText(pacing)}</span>}
      {pacing.actionsPerMinute !== null && !pacing.done && (
        <span className="pacing-rate muted small">{pacing.estimated ? 'оценка' : 'темп'} {pacing.actionsPerMinute.toLocaleString('ru-RU')} в минуту</span>
      )}
    </p>
  );
}

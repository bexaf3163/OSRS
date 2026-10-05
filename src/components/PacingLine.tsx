// The training pace from the game: "🐟 34 shrimps to 20 Fishing · ≈ 7 min". The RuneLite plugin counts it from XP;
// while there are few measurements, the time is not invented — "calculating the time…". In combat (attack, strength, defence to one
// goal) the skill that is growing now is shown, and what to train after it.

import type { Step } from '../types';
import { useBridge } from '../bridge';
import { useFeatures } from '../lib/features';
import { etaText, PACING_ICON as ICON, pacingNext, pacingText } from '../lib/pacing';

export function PacingLine({ step }: { step: Step }) {
  const { pacing, activeStepId } = useBridge();
  const { pacing: on } = useFeatures();
  if (!on || !step.pacing) return null;
  if (!pacing || pacing.stepId !== step.id || activeStepId !== step.id) {
    return activeStepId === step.id
      ? <p className="pacing muted small">{ICON[step.pacing.skill]} The pace will appear after the first XP in the game.</p>
      : null;
  }
  const all = [step.pacing.skill, ...(step.pacing.also ?? [])];
  // A skill reached the goal and the others have not — this is not "done" but a hint to change the style.
  const good = pacing.almost || (pacing.done && !pacing.left.length);
  const next = pacingNext(pacing);
  return (
    <p className={`pacing ${good ? 'is-good' : ''}`} role="status" aria-live="polite">
      <span className="pacing-icon" aria-hidden="true">{ICON[pacing.skill]}</span>
      <span className="pacing-main">{pacingText(pacing, step.pacing.actionName, all)}</span>
      {!pacing.done && !pacing.almost && <span className="pacing-eta">{etaText(pacing)}</span>}
      {pacing.actionsPerMinute !== null && !pacing.done && (
        <span className="pacing-rate muted small">{pacing.estimated ? 'estimate' : 'pace'} {pacing.actionsPerMinute.toLocaleString('en-US')} per minute</span>
      )}
      {next && <span className="pacing-rate muted small">{next}</span>}
    </p>
  );
}

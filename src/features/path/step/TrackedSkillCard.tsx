// The tracked skill on the Path screen: the current step of its path as a card (the action chip, where, what to do), and the sync that hands the whole path to the
// game. While a skill is tracked the plugin leads it (arrow, highlight, HUD chip) and the quest route waits; "Back to the quest route" gives it back.

import { useEffect } from 'react';
import { useBridge } from '../../../state/bridge';
import { supportsSnapshot } from '../../../services/runeliteBridge';
import { setTracked, useTracked } from '../../../state/hooks/useTracked';
import { useReadinessEngine, useTrackedTraining } from '../../../state/readinessContext';
import { f2pAdviceFor } from '../../../domain/training/f2pSkillAdvice';
import { ReadinessVerdictCard } from '../prep/ReadinessVerdict';
import { FundingCard } from '../../money/FundingCard';
import { usePrepFix } from '../prep/PrepRoute';
import { NavigateButton } from '../../../ui/NavigateButton';
import { useFeatures } from '../../../state/hooks/useFeatures';
import { priorityOf } from '../../../domain/persistence/methodPriority';
import { useTrainingFunding } from '../../../state/trainingSessionContext';
import { levelById } from '../../../data';
import { nearestBank } from '../../../domain/travel/stepPlaces';
import { hrefTo } from '../../../domain/pages/pages';

/** Sends the tracked skill's training step with every change; nothing is sent while no skill is tracked. */
export function SkillSync() {
  const { state, plugin, setTrainingStep } = useBridge();
  const training = useTrackedTraining();
  const live = state === 'online' && supportsSnapshot(plugin?.protocol ?? null);
  // A reached checkpoint remains stopped until the player explicitly returns to the quest route.
  const step = training?.step ?? null;
  const key = JSON.stringify(step);
  useEffect(() => {
    if (live) setTrainingStep(step);
    // step is rebuilt on every change of its inputs; the content is watched through key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, key, setTrainingStep]);
  return null;
}

export function TrackedSkillCard() {
  const tracked = useTracked();
  const training = useTrackedTraining();
  if (!tracked) return null;
  if (training) return <EngineTrackedCard />;
  return <section className="tracked-skill card" aria-label="Tracked skill">
    <p>{f2pAdviceFor(tracked.skill)?.reason ?? 'No supported training goal is selected for this account.'}</p>
    <button type="button" className="btn" onClick={() => setTracked(null)}>Back to the quest route</button>
  </section>;
}

function EngineTrackedCard() {
  const training = useTrackedTraining()!;
  const { step, complete, target } = training;
  const engine = useReadinessEngine();
  const queue = engine.queue(step, priorityOf(useFeatures()));
  const funding = useTrainingFunding();
  const blocked = Boolean(funding?.plan || funding?.assessment?.state !== 'COVERED');
  const fix = usePrepFix(step, () => { window.location.hash = hrefTo.shopping(); });
  const place = step.mapLocation;
  const unchecked = engine.readiness(step).unknown.some(item => item.hard);
  const bank = unchecked ? nearestBank(step) : null;
  return <section className="tracked-skill card" aria-label="Tracked skill">
    <p className="eyebrow">Your training plan · goal {target}</p>
    <h2 className="next-title">{complete ? `${step.title}: checkpoint reached` : step.inGame?.goal ?? step.title}</h2>
    {!complete && <>
      <p>{step.where ?? step.how}</p>
      {step.warning && <p className="small notice">{step.warning}</p>}
      <FundingCard step={step}>
        <ReadinessVerdictCard step={step} noPill />
        {fix.available && !(blocked && queue.tasks[0]?.kind === 'buy')
          ? <button type="button" className="btn btn-primary" onClick={() => void fix.fix()}>{queue.tasks[0]?.label ?? 'Prepare for this stage'}</button>
          : unchecked && bank ? <NavigateButton target={{ label: `${bank.label}: check your bank`, x: bank.x, y: bank.y, plane: bank.plane }} label="Check your bank" />
          : queue.ready && !unchecked && place && <NavigateButton target={{ label: place.label, x: place.x, y: place.y, plane: place.plane, npcNames: step.inGame?.npcNames, objectNames: step.inGame?.objectNames }} label="Go to the training spot" />}
      </FundingCard>
      <p className="small muted">Levels and supplies update this stage automatically. <a href={hrefTo.skills(levelById.get(step.followsMethod ?? '')?.skill ?? step.followsMethod, step.followsMethod)}>Skill plan</a></p>
    </>}
    <button type="button" className="btn btn-ghost" onClick={() => setTracked(null)}>Back to the quest route</button>
  </section>;
}


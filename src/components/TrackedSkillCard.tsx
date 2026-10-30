// The tracked skill on the Path screen: the current step of its path as a card (the action chip, where, what to do), and the sync that hands the whole path to the
// game. While a skill is tracked the plugin leads it (arrow, highlight, HUD chip) and the quest route waits; "Back to the quest route" gives it back.

import { useEffect, useMemo } from 'react';
import { guideFor } from '../data/skillGuideRegistry';
import { useBridge } from '../bridge';
import { supportsSnapshot } from '../services/runeliteBridge';
import { buildPath, chipText, currentIndex, skillPathPayload, type GuideMode, type SkillName } from '../lib/skillGuide';
import { freeOnlyOf, setTracked, useTracked } from '../lib/skillTrack';
import { laneLabel, useQuestDone, useSkillLevel } from './SkillRoadmap';
import { useReadinessEngine, useTrackedTraining } from '../readinessContext';
import { methodsFor } from '../lib/trainingRouter';
import { f2pAdviceFor } from '../lib/f2pSkillAdvice';
import { ReadinessVerdictCard } from './ReadinessVerdict';
import { FundingCard } from './FundingCard';
import { usePrepFix } from './PrepRoute';
import { NavigateButton } from './NavigateButton';
import { useFeatures } from '../lib/features';
import { styleOf } from '../lib/playStyle';
import { useTrainingFunding } from '../trainingSessionContext';
import { levelById } from '../data';
import { nearestBank } from '../lib/readiness';

/** Sends the tracked skill's path with every change of the quests done; nothing is sent while no skill is tracked. */
export function SkillSync() {
  const tracked = useTracked();
  const { state, plugin, setSkillPath, setTrainingStep } = useBridge();
  const training = useTrackedTraining();
  const done = useQuestDone();
  const live = state === 'online' && supportsSnapshot(plugin?.protocol ?? null);
  const payload = useMemo(() => {
    if (!tracked || training || methodsFor(tracked.skill).length) return null;
    const guide = guideFor(tracked.skill);
    const path = buildPath(guide, tracked.mode, done, guide.start, freeOnlyOf(tracked));
    return path.length ? skillPathPayload(tracked.skill, tracked.mode, path) : null;
  }, [tracked, done, training]);
  // A reached checkpoint remains stopped until the player explicitly returns to the quest route.
  const step = training?.step ?? null;
  const key = JSON.stringify([payload, step]);
  useEffect(() => {
    if (live) { setSkillPath(payload); setTrainingStep(step); }
    // payload is rebuilt on every change of its inputs; the content is watched through key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, key, setSkillPath, setTrainingStep]);
  return null;
}

export function TrackedSkillCard() {
  const tracked = useTracked();
  const training = useTrackedTraining();
  if (!tracked) return null;
  if (training) return <EngineTrackedCard />;
  if (methodsFor(tracked.skill).length) return <section className="tracked-skill card" aria-label="Tracked skill">
    <p>{f2pAdviceFor(tracked.skill)?.reason ?? 'No supported training goal is selected for this account.'}</p>
    <button type="button" className="btn" onClick={() => setTracked(null)}>Back to the quest route</button>
  </section>;
  return <TrackedCard skill={tracked.skill} mode={tracked.mode} freeOnly={freeOnlyOf(tracked)} />;
}

function EngineTrackedCard() {
  const training = useTrackedTraining()!;
  const { step, complete, target } = training;
  const engine = useReadinessEngine();
  const profile = styleOf(useFeatures());
  const queue = engine.queue(step, profile.style);
  const funding = useTrainingFunding();
  const blocked = Boolean(funding?.plan || funding?.assessment?.state !== 'COVERED');
  const fix = usePrepFix(step, () => { window.location.hash = '#/shopping'; });
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
      <p className="small muted">Levels and supplies update this stage automatically. <a href={`#/skills/${levelById.get(step.followsMethod ?? '')?.skill ?? step.followsMethod}/${step.followsMethod}`}>Skill plan</a></p>
    </>}
    <button type="button" className="btn btn-ghost" onClick={() => setTracked(null)}>Back to the quest route</button>
  </section>;
}

function TrackedCard({ skill, mode, freeOnly }: { skill: SkillName; mode: GuideMode; freeOnly: boolean }) {
  const level = useSkillLevel(skill);
  const done = useQuestDone();
  const path = useMemo(() => { const g = guideFor(skill); return buildPath(g, mode, done, g.start, freeOnly); }, [skill, mode, done, freeOnly]);
  const at = currentIndex(path, level);
  const step = path[at];
  const name = skill[0].toUpperCase() + skill.slice(1);
  return (
    <section className="tracked-skill card" aria-label="Tracked skill">
      <p className="eyebrow">Your {name} plan · {laneLabel(mode)}{freeOnly ? ' · free steps' : ''}</p>
      {step ? (
        <>
          <h2 className="next-title">{chipText(step, level)}</h2>
          <p>{step.description}</p>
          <p className="muted small">
            📍 {step.location.name}{step.location.objectName && <> · {step.location.objectName}</>}{step.location.npcName && <> · {step.location.npcName}</>}
            {step.recommendedXpRate && <> · {step.recommendedXpRate}</>} · step {at + 1} of {path.length}
          </p>
        </>
      ) : (
        <h2 className="next-title">{name} path complete at level {level}</h2>
      )}
      <div className="actions">
        <button type="button" className="btn" onClick={() => setTracked(null)}>Back to the quest route</button>
      </div>
    </section>
  );
}

// The tracked skill on the Path screen: the current step of its path as a card (the action chip, where, what to do), and the sync that hands the whole path to the
// game. While a skill is tracked the plugin leads it (arrow, highlight, HUD chip) and the quest route waits; "Back to the quest route" gives it back.

import { useEffect, useMemo } from 'react';
import { guideFor } from '../data/skillGuideRegistry';
import { useBridge } from '../bridge';
import { supportsSnapshot } from '../services/runeliteBridge';
import { buildPath, chipText, currentIndex, skillPathPayload, type GuideMode, type SkillName } from '../lib/skillGuide';
import { setTracked, useTracked } from '../lib/skillTrack';
import { useQuestDone, useSkillLevel } from './SkillRoadmap';

/** Sends the tracked skill's path with every change of the quests done; nothing is sent while no skill is tracked. */
export function SkillSync() {
  const tracked = useTracked();
  const { state, plugin, setSkillPath } = useBridge();
  const done = useQuestDone();
  const live = state === 'online' && supportsSnapshot(plugin?.protocol ?? null);
  const payload = useMemo(() => {
    if (!tracked) return null;
    const path = buildPath(guideFor(tracked.skill), tracked.mode, done);
    return path.length ? skillPathPayload(tracked.skill, tracked.mode, path) : null;
  }, [tracked, done]);
  const key = JSON.stringify(payload);
  useEffect(() => {
    if (live) setSkillPath(payload);
    // payload is rebuilt on every change of its inputs; the content is watched through key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, key, setSkillPath]);
  return null;
}

export function TrackedSkillCard() {
  const tracked = useTracked();
  if (!tracked) return null;
  return <TrackedCard skill={tracked.skill} mode={tracked.mode} />;
}

function TrackedCard({ skill, mode }: { skill: SkillName; mode: GuideMode }) {
  const level = useSkillLevel(skill);
  const done = useQuestDone();
  const path = useMemo(() => buildPath(guideFor(skill), mode, done), [skill, mode, done]);
  const at = currentIndex(path, level);
  const step = path[at];
  const name = skill[0].toUpperCase() + skill.slice(1);
  return (
    <section className="tracked-skill card" aria-label="Tracked skill">
      <p className="eyebrow">Tracking {name} · {mode === 'fast' ? 'Fastest' : mode === 'afk' ? 'AFK / Budget' : 'F2P only'}</p>
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

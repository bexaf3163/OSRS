// The leveling roadmap of a skill: a timeline of level brackets with the steps in the order to train them, three filters ("Fastest / Quest-Driven", "AFK / Budget",
// "F2P Only") and the "Track Skill Path" button that hands the path to the game. Shown in a drawer from the Skills page.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { guideFor } from '../data/skillGuideRegistry';
import { useBridge } from '../bridge';
import { useStore } from '../store';
import { isClosed } from '../lib/next-step';
import { levelOf } from '../lib/progress';
import { nameKey } from '../lib/checklist';
import { formatXp } from '../lib/goals';
import { bracketsOf, buildPath, currentIndex, type GuideMode, type SkillName, type SkillStep } from '../lib/skillGuide';
import { setTracked, useTracked } from '../lib/skillTrack';
import { IconClose } from './Icons';

const MODE_LABEL: Record<GuideMode, string> = { fast: 'Fastest / Quest-Driven', afk: 'AFK / Budget', f2p: 'F2P Only' };
const TYPE_LABEL = { QUEST: 'Quest', GATHER: 'Gather', CRAFT: 'Craft', COMBAT: 'Combat', MINIGAME: 'Minigame' } as const;
const CLOSE_MS = 180;

/** The real level of a skill: live from the game when it is connected, otherwise what the player entered. */
export function useSkillLevel(skill: SkillName): number {
  const { stats } = useBridge();
  const { progress } = useStore();
  const guide = guideFor(skill);
  return stats?.[skill] ?? (progress.levels[skill] !== undefined ? levelOf(progress, skill) : guide.start);
}

/** Whether the quest of a quest step is done: the same quest as a route step that is closed, or the game says so. */
export function useQuestDone(): (step: SkillStep) => boolean {
  const { questsDone } = useBridge();
  const { progress } = useStore();
  return useCallback((step: SkillStep) => {
    const r = step.reward;
    if (!r) return false;
    if (r.routeStepId && isClosed(progress, r.routeStepId)) return true;
    return Boolean(questsDone?.some((q) => nameKey(q) === nameKey(r.quest)));
  }, [progress, questsDone]);
}

export function SkillRoadmapDrawer({ skills, label, onClose }: { skills: SkillName[]; label: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);
  useEffect(() => { if (dialog.current && !dialog.current.open) dialog.current.showModal(); }, []);
  const close = useCallback(() => {
    const d = dialog.current;
    if (!d?.open) return;
    setClosing(true);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(() => { d.close(); onClose(); }, reduce ? 0 : CLOSE_MS);
  }, [onClose]);
  return createPortal(
    <dialog ref={dialog} className={`drawer skill-drawer ${closing ? 'is-closing' : ''}`} aria-label={`${label} leveling roadmap`}
      onCancel={(e) => { e.preventDefault(); close(); }} onClick={(e) => { if (e.target === dialog.current) close(); }}>
      <div className="drawer-panel">
        <button type="button" className="icon-btn drawer-close" onClick={close} aria-label="Close"><IconClose /></button>
        <Roadmap skills={skills} label={label} />
      </div>
    </dialog>,
    document.body,
  );
}

function Roadmap({ skills, label }: { skills: SkillName[]; label: string }) {
  const tracked = useTracked();
  const [skill, setSkill] = useState<SkillName>(() => (tracked && skills.includes(tracked.skill) ? tracked.skill : skills[0]));
  const [mode, setMode] = useState<GuideMode>(() => (tracked && tracked.skill === skill ? tracked.mode : 'fast'));
  const guide = guideFor(skill);
  const level = useSkillLevel(skill);
  const done = useQuestDone();
  const freeOnly = guide.f2pCap === 0;
  const path = useMemo(() => buildPath(guide, mode, done), [guide, mode, done]);
  const at = currentIndex(path, level);
  const groups = useMemo(() => bracketsOf(path), [path]);
  const isTracked = tracked?.skill === skill && tracked.mode === mode;
  return (
    <div className="drawer-body skill-roadmap">
      <header className="skill-roadmap-head">
        <h2>{label} <span className="muted small">leveling roadmap</span></h2>
        {skills.length > 1 && (
          <div className="skill-seg" role="group" aria-label="Skill">
            {skills.map((s) => <button key={s} type="button" className={`skill-seg-btn ${s === skill ? 'is-on' : ''}`} aria-pressed={s === skill} onClick={() => setSkill(s)}>{s[0].toUpperCase() + s.slice(1)}</button>)}
          </div>
        )}
        <p className="muted small">Level <strong>{level}</strong>{path.length > 0 && at < path.length && <> · now: <strong>{path[at].title}</strong></>}</p>
      </header>

      <div className="skill-seg" role="group" aria-label="Filter">
        {(Object.keys(MODE_LABEL) as GuideMode[]).map((m) => (
          <button key={m} type="button" className={`skill-seg-btn ${m === mode ? 'is-on' : ''}`} aria-pressed={m === mode} disabled={m === 'f2p' && freeOnly}
            title={m === 'f2p' && freeOnly ? 'This skill is members only' : undefined} onClick={() => setMode(m)}>{MODE_LABEL[m]}</button>
        ))}
      </div>

      <div className="skill-actions">
        {isTracked
          ? <button type="button" className="btn" onClick={() => setTracked(null)}>■ Stop tracking</button>
          : <button type="button" className="btn btn-primary" disabled={path.length === 0 || at >= path.length} onClick={() => setTracked({ skill, mode })}>🎯 Track Skill Path</button>}
        <span className="muted small">{isTracked ? 'The game leads this skill now: the quest route is paused there.' : 'Pins this skill to the card on the Path screen and leads it in the game instead of the quest route.'}</span>
      </div>

      {path.length === 0 && <p className="notice">{mode === 'f2p' ? 'There is no free-to-play method for this skill: switch the filter.' : 'No steps for this filter.'}</p>}
      {mode === 'f2p' && path.length > 0 && guide.f2pCap < 99 && <p className="muted small">Free accounts reach level {guide.f2pCap} in this skill.</p>}

      <ol className="skill-timeline">
        {groups.map((g) => (
          <li key={`${g.from}-${g.to}`} className="skill-bracket">
            <h3>Levels {g.from}–{g.to}</h3>
            <ol>
              {g.steps.map((s) => <StepRow key={s.id} step={s} state={path.indexOf(s) < at ? 'done' : path.indexOf(s) === at ? 'now' : 'next'} level={level} />)}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  );
}

function StepRow({ step, state, level }: { step: SkillStep; state: 'done' | 'now' | 'next'; level: number }) {
  return (
    <li className={`skill-step is-${state}`}>
      <p className="skill-step-head">
        <span className="badge badge-stage">{TYPE_LABEL[step.methodType]}</span>
        {step.members && <span className="badge badge-members">Members</span>}
        <strong>{step.title}</strong>
        <span className="skill-step-range">Lvl {state === 'now' ? level : step.levelRange[0]} → {step.targetLevel}</span>
        {state === 'now' && <span className="badge badge-now">now</span>}
      </p>
      <p className="skill-step-text">{step.description}</p>
      <p className="muted small">
        📍 {step.location.name}
        {step.location.objectName && <> · {step.location.objectName}</>}
        {step.location.npcName && <> · {step.location.npcName}</>}
        {step.recommendedXpRate && <> · {step.recommendedXpRate}</>}
        {step.reward && <> · reward {formatXp(step.reward.xp)} xp</>}
        {step.prerequisites?.questIds && <> · needs {step.prerequisites.questIds.join(', ')}</>}
      </p>
    </li>
  );
}


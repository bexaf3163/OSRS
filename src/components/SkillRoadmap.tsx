// The leveling roadmap of a skill: a timeline of level groups with the steps in the order to train them, and "Follow this plan", which hands the path to the
// game. Two separate questions since 2.70, not three mixed filters: the priority (Fastest, with quest XP skips first, or Low effort) and, for a free account,
// whether members steps are shown as a preview. The priority starts from Settings → Training choices. Shown in a drawer from the Skills page.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { guideFor } from '../data/skillGuideRegistry';
import { useBridge } from '../bridge';
import { useStore } from '../store';
import { isClosed } from '../lib/next-step';
import { levelOf } from '../lib/progress';
import { nameKey } from '../lib/checklist';
import { formatXp } from '../lib/goals';
import { bracketsOf, buildPath, currentIndex, type SkillName, type SkillStep } from '../lib/skillGuide';
import { freeOnlyOf, setTracked, useTracked } from '../lib/skillTrack';
import { useFeatures } from '../lib/features';
import { priorityOf } from '../lib/playStyle';
import { IconClose } from './Icons';

type Lane = 'fast' | 'afk';
const LANE_LABEL: Record<Lane, string> = { fast: 'Fastest', afk: 'Low effort' };
/** The roadmap's two priorities, by name, for the card on the Path screen too. */
export const laneLabel = (mode: string): string => (mode === 'afk' ? LANE_LABEL.afk : LANE_LABEL.fast);
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

/** The roadmap as a page section (the skill workspace's Roadmap tab); the drawer on the Skills page shows the same thing. */
export function RoadmapPane({ skills, label }: { skills: SkillName[]; label: string }) {
  return <Roadmap skills={skills} label={label} />;
}

function Roadmap({ skills, label }: { skills: SkillName[]; label: string }) {
  const tracked = useTracked();
  const [skill, setSkill] = useState<SkillName>(() => (tracked && skills.includes(tracked.skill) ? tracked.skill : skills[0]));
  const account = useStore().mode;
  const priority = priorityOf(useFeatures());
  const followed = tracked && tracked.skill === skill ? tracked : null;
  // The priority starts from Settings → Training choices ("Relaxed" means low effort) or the plan being followed.
  const [lane, setLane] = useState<Lane>(() => (followed ? (followed.mode === 'afk' ? 'afk' : 'fast') : priority === 'relaxed' ? 'afk' : 'fast'));
  // A free account sees free steps; members steps are a preview it asks for. A members account sees everything.
  const [preview, setPreview] = useState(() => (followed ? !freeOnlyOf(followed) : false));
  const guide = guideFor(skill);
  const level = useSkillLevel(skill);
  const done = useQuestDone();
  const membersOnly = guide.f2pCap === 0;
  const freeOnly = account === 'f2p' && !membersOnly && !preview;
  const path = useMemo(() => buildPath(guide, lane, done, guide.start, freeOnly), [guide, lane, done, freeOnly]);
  const at = currentIndex(path, level);
  const groups = useMemo(() => bracketsOf(path), [path]);
  const isTracked = Boolean(followed && (followed.mode === 'afk' ? 'afk' : 'fast') === lane && freeOnlyOf(followed) === freeOnly);
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

      <div className="skill-roadmap-filters">
        <div className="skill-seg" role="group" aria-label="Priority">
          {(Object.keys(LANE_LABEL) as Lane[]).map((m) => (
            <button key={m} type="button" className={`skill-seg-btn ${m === lane ? 'is-on' : ''}`} aria-pressed={m === lane} onClick={() => setLane(m)}>{LANE_LABEL[m]}</button>
          ))}
        </div>
        {account === 'f2p' && !membersOnly && (
          <label className="switch small">
            <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} />
            <span>Show members steps (preview)</span>
          </label>
        )}
      </div>

      <div className="skill-actions">
        {isTracked
          ? <button type="button" className="btn" onClick={() => setTracked(null)}>Back to the quest route</button>
          : <button type="button" className="btn btn-primary" disabled={path.length === 0 || at >= path.length} onClick={() => setTracked({ skill, mode: lane, freeOnly })}>🎯 Follow this plan</button>}
        <span className="muted small">{isTracked ? 'The game leads this plan now; the quest route waits until you go back to it.' : 'Leads this skill in the game (arrow, target and level steps) instead of the quest route, until you go back to it.'}</span>
      </div>

      {membersOnly && account === 'f2p' && <p className="notice">This skill needs membership: the steps below are a members preview.</p>}
      {!membersOnly && !freeOnly && account === 'f2p' && path.some((s) => s.members) && (
        <p className="notice">Members preview: the steps marked Members need membership.</p>
      )}
      {path.length === 0 && <p className="notice">{freeOnly ? 'There is no free-to-play method for this skill at this priority.' : 'No steps for this priority.'}</p>}
      {freeOnly && path.length > 0 && guide.f2pCap < 99 && <p className="muted small">Free accounts reach level {guide.f2pCap} in this skill.</p>}

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


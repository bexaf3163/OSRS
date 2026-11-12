import { useEffect, useId, useState } from 'react';
import type { Skill } from '../../types';
import { findSkill, levelById, xpData } from '../../data';
import { useStore } from '../../state/store';
import { isClosed } from '../../domain/quests/next-step';
import { usePlannerSkillGoals } from '../../state/decision';
import { formatXp } from '../../domain/quests/goals';
import { levelOf } from '../../domain/persistence/progress';
import { clampLevel, levelForXp, MAX_LEVEL, xpForLevel } from '../../domain/player/xp';
import { SkillGlyph } from '../../ui/SectionShell';
import { Blocks } from '../../ui/Blocks';
import { IconBack, IconCheck, IconExternal, TypeIcon } from '../../ui/Icons';
import { LevelInput } from '../../ui/LevelInput';
import { LiveXp } from '../../ui/LiveXp';
import { TrainingCard, useMethodStops, useTrainingAdvice } from './TrainingCard';
import { XpTable } from './XpTable';
import { methodStop, trainingFocus, type TrainingFocus } from '../../domain/training/skillFocus';
import { F2pSkillNote } from './F2pSkillNote';
import { f2pAdviceFor, f2pAdviceLabel } from '../../domain/training/f2pSkillAdvice';
import { useTrackedTraining } from '../../state/readinessContext';
import { setTracked } from '../../state/hooks/useTracked';
import { SKILL_NAMES, type SkillName } from '../../domain/training/skillTrack';
import { hrefTo } from '../../domain/pages/pages';

export function SkillDetailPage({ id, selectedSkill, requestedGoal }: { id: string; selectedSkill?: string; requestedGoal?: number }) {
  const skill = findSkill(id);
  if (!skill) {
    return (
      <div className="page">
        <a className="back" href={hrefTo.skills()}><IconBack />Skills</a>
        <h1>Skill not found</h1>
        <p className="muted">There is no skill with the code "{id}".</p>
      </div>
    );
  }
  const selected = selectedSkill && skill.levelSkills.includes(selectedSkill) ? selectedSkill : undefined;
  const goal = selected && Number.isInteger(requestedGoal) && requestedGoal! >= 2 && requestedGoal! <= 99 ? requestedGoal : undefined;
  return <SkillView skill={skill} selectedSkill={selected} requestedGoal={goal} />;
}

type SkillTab = 'guide' | 'plan' | 'calculator' | 'reference';

function SkillView({ skill, selectedSkill, requestedGoal }: { skill: Skill; selectedSkill?: string; requestedGoal?: number }) {
  const { progress, steps, mode } = useStore();
  const [tab, setTab] = useState<SkillTab>('guide');
  const tabs: [SkillTab, string][] = [
    ['guide', 'Train'], ['plan', 'Plan'], ['calculator', 'Calculator'], ['reference', 'Reference'],
  ];
  const related = steps.filter((s) => s.targets?.some((t) => levelById.get(t.skill)?.skill === skill.id));
  // "What to train with": the planner decides first (a level its Decision needs), the training engine's next method change only when it needs none.
  const plannerGoals = usePlannerSkillGoals();
  const goalOf = (id: string) => plannerGoals.get(id)?.level;
  const stops = useMethodStops();
  const focused = selectedSkill ? { ...skill, levelSkills: [selectedSkill] } : skill;
  const byPlanner = trainingFocus({ levelSkills: focused.levelSkills, goalOf, levelOf: (id) => levelOf(progress, id) });
  // F2P without a planner need: a group (Melee combat) opens on the lagging skill whose checkpoint is still ahead, not on one already past it
  // (Defence 20 with its checkpoint of 10 read "Goal 10" while Attack and Strength still had theirs to reach).
  const ahead = mode === 'f2p' && byPlanner.source === 'generic' ? focused.levelSkills.filter((id) => {
    const target = f2pAdviceFor(id)?.target;
    return target != null && levelOf(progress, id) < target;
  }) : [];
  const planned = ahead.length && ahead.length < focused.levelSkills.length
    ? trainingFocus({ levelSkills: ahead, goalOf, levelOf: (id) => levelOf(progress, id) }) : byPlanner;
  const checkpoint = mode === 'f2p' ? f2pAdviceFor(planned.skill)?.target : null;
  const training = useTrackedTraining();
  const ownTraining = training && focused.levelSkills.includes(training.step.followsMethod ?? '') ? training : null;
  // Without a planner need and nothing else setting the goal, one engine advice for the lagging skill sets it; the card
  // below reuses that advice. Otherwise the engine is not asked for a goal nobody sees.
  const generic = planned.source === 'generic' && !(requestedGoal !== undefined && selectedSkill) && !ownTraining && !checkpoint;
  const engine = useTrainingAdvice(generic ? planned.skill : null, MAX_LEVEL, null, true);
  const stopOf = (id: string) => (engine && id === engine.skill ? methodStop(engine) : stops(id));
  const routeFocus = generic ? trainingFocus({ levelSkills: focused.levelSkills, goalOf, levelOf: (id) => levelOf(progress, id), stopOf }) : planned;
  const focus: TrainingFocus = requestedGoal !== undefined && selectedSkill ? { skill: selectedSkill, target: requestedGoal, source: 'preparation' }
    : ownTraining ? { skill: ownTraining.step.followsMethod!, target: ownTraining.target, source: 'tracked' }
    : checkpoint ? { skill: routeFocus.skill, target: checkpoint, source: 'checkpoint' } : routeFocus;
  const level = levelOf(progress, focus.skill);
  const focusName = skill.levelSkills.length > 1 ? levelById.get(focus.skill)?.name : undefined;
  const card = focus.source === 'preparation' ? { skill: focus.skill, target: focus.target, followed: null }
    : ownTraining ? { skill: ownTraining.step.followsMethod!, target: ownTraining.target, followed: null } : { skill: focus.skill, target: focus.target, followed: null };
  const shared = engine && card.skill === engine.skill && card.target === engine.target && !card.followed ? engine : undefined;
  const f2p = mode === 'f2p' ? f2pAdviceFor(card.skill) : null;
  const defer = f2p?.target === null && requestedGoal === undefined && !ownTraining;

  return (
    <div className="page skill-detail">
      <header className="page-head">
        <SkillGlyph skill={focus.skill} size={48} />
        <h1>{selectedSkill ? levelById.get(selectedSkill)?.name ?? skill.name : skill.name}<span className="skill-level-goal">{focusName ?? 'Level'} {level}{!defer && focus.target > level && <> → Goal {focus.target}</>}</span>{skill.membersOnly && <> <span className="badge badge-members">Members</span></>}</h1>
        <p className="muted">
          {(skill.nameEn ?? skill.subtitle) !== skill.name && <>{skill.nameEn ?? skill.subtitle} · </>}
          {skill.wiki && <a href={skill.wiki} target="_blank" rel="noopener noreferrer">Wiki <IconExternal /></a>}
        </p>
      </header>
      {skill.membersOnly && mode === 'f2p' && (
        <p className="notice">This skill can be trained only with membership. Switch the mode to Members in the header to see its training.</p>
      )}

      {skill.levelSkills.length > 1 && <nav className="skill-seg" aria-label="Combat skill">
        {skill.levelSkills.map(id => <a key={id} className={`skill-seg-btn ${focus.skill === id ? 'is-on' : ''}`}
          aria-current={focus.skill === id ? 'page' : undefined} href={hrefTo.skills(skill.id, id)}>{levelById.get(id)?.name ?? id}</a>)}
      </nav>}
      <nav className="subtabs" aria-label="Skill sections" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`subtab ${tab === id ? 'is-active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === 'guide' && (
      <>
      {focus.source === 'preparation' || focus.source === 'planner' ? <FocusNote focus={focus} why={plannerGoals.get(focus.skill)?.why} /> : f2p && <p className="small muted f2p-skill-checkpoint">{f2pAdviceLabel(f2p, progress.levels?.[card.skill])} <button type="button" className="link-btn" onClick={() => setTab('reference')}>Why?</button></p>}
      {defer ? <section className="training training-summary" aria-label="What to train with">
        <p className="training-now"><strong>Save dedicated training for membership</strong></p>
        <p className="small muted">{f2p?.reason}</p>
        <button type="button" className="link-btn" onClick={() => setTab('calculator')}>Choose a custom goal</button>
      </section> : <TrainingCard skill={card.skill} target={card.target} followed={card.followed} advice={shared} view="summary" />}
      </>
      )}

      {tab === 'plan' && <>
        <FocusNote focus={focus} why={plannerGoals.get(focus.skill)?.why} />
        <TrainingCard skill={card.skill} target={card.target} followed={card.followed} advice={shared} view="analysis" />
      </>}

      {tab === 'reference' && (<>
      {mode === 'f2p' && <F2pSkillNote skill={card.skill} level={progress.levels?.[card.skill]} />}

      <section className="card skill-level-editor"><h2>Levels and live experience</h2>
      <section className="levels-card" aria-label="Levels">
        <div className="levels-row">
          {skill.levelSkills.map((lid) => <LevelInput key={lid} id={lid} label={levelById.get(lid)!.name} />)}
        </div>
        <LiveXp targets={skill.levelSkills.map((lid) => ({ skill: lid, level: Math.min(99, levelOf(progress, lid) + 1) }))} />
      </section>
      </section>

      {related.length > 0 && (
        <section className="section skill-related">
          <h2>Path steps with this skill</h2>
          <ul className="link-list">
            {related.map((s) => (
              <li key={s.id} className={isClosed(progress, s.id) ? 'is-done' : ''}>
                <a href={hrefTo.step(s.id)}>
                  <code className="code">{s.id}</code>
                  <TypeIcon type={s.type} />
                  <span>{s.title}</span>
                  {isClosed(progress, s.id) && <IconCheck className="done-mark" />}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      </>
      )}

      {tab === 'calculator' && <><Calculator levelIds={selectedSkill ? [selectedSkill] : skill.levelSkills} suggest={(lid, level) =>
        requestedGoal !== undefined && lid === selectedSkill ? requestedGoal
          : mode === 'f2p' && f2pAdviceFor(lid)?.target === null ? Math.min(99, level + 1) : trainingFocus({ levelSkills: [lid], goalOf, levelOf: () => level, stopOf }).target} /><details className="section"><summary>XP table</summary><XpTable /></details></>}

      {tab === 'reference' && (
        <>
          {skill.intro.length > 0 && <div className="prose section"><Blocks blocks={skill.intro} /></div>}

          {skill.sections.map((sec) => (
            <section key={sec.title} className="section prose"><h2>{sec.title}</h2><Blocks blocks={sec.blocks} /></section>
          ))}
          <section className="section prose"><h2>{xpData.title}</h2><XpTable /><Blocks blocks={xpData.note} />
          </section>
        </>
      )}
    </div>
  );
}

/** Says where the goal below comes from: a level the planner needs (with its action), or the training engine's next method change. */
function FocusNote({ focus, why }: { focus: TrainingFocus; why?: string }) {
  if (focus.source === 'preparation') return <p className="muted small focus-note">Preparation needs {levelById.get(focus.skill)?.name ?? focus.skill} {focus.target}.</p>;
  if (focus.source === 'checkpoint') return <p className="muted small focus-note">Suggested F2P checkpoint: {focus.target}. It is optional, not a membership requirement.</p>;
  if (focus.source === 'tracked') return <p className="muted small focus-note">Following your selected training goal: {focus.target}.</p>;
  const name = levelById.get(focus.skill)?.name ?? focus.skill;
  if (focus.source === 'planner') return <p className="muted small focus-note">The planner needs {name} {focus.target}{why ? <>: {why}</> : null}.</p>;
  return <p className="muted small focus-note">The planner needs no {name} level now. Goal {focus.target}: {focus.next ? `the training engine switches to ${focus.next} there` : focus.next === null ? 'no other training method takes over before it' : 'the next level'}.</p>;
}


interface CalcProps {
  levelIds: string[];
  /** The default goal: the level the planner needs, else where the training engine changes its method. */
  suggest: (levelId: string, level: number) => number;
}

function Calculator({ levelIds, suggest }: CalcProps) {
  const { progress, mode } = useStore();
  const [which, setWhich] = useState(levelIds[0]);
  const level = levelOf(progress, which);
  const [target, setTarget] = useState(() => String(suggest(which, level)));
  const [xpNow, setXpNow] = useState('');
  const ids = { which: useId(), target: useId(), xp: useId() };

  // A new skill or level — a new default goal.
  useEffect(() => {
    setTarget(String(suggest(which, level)));
    setXpNow('');
    // suggest and the array are recreated on every render — the goal is recomputed only when the skill or level changes.
  }, [levelIds.join(), which, level]);

  const targetLevel = clampLevel(Number(target) || 1);
  const exact = xpNow.trim() ? Number(xpNow.replace(/\D/g, '')) : NaN;
  const hasExact = Number.isFinite(exact) && levelForXp(exact) === level;
  const from = hasExact ? exact : xpForLevel(level);
  const left = Math.max(0, xpForLevel(targetLevel) - from);
  const name = levelById.get(which)!.name;

  return (
    <section className="card calc" aria-labelledby={`${ids.which}-h`}>
      <h2 className="card-title" id={`${ids.which}-h`}>How much XP is left</h2>
      <div className="calc-grid">
        {levelIds.length > 1 && (
          <div className="calc-field">
            <label htmlFor={ids.which}>Skill</label>
            <select id={ids.which} value={which} onChange={(e) => setWhich(e.target.value)}>
              {levelIds.map((lid) => <option key={lid} value={lid}>{levelById.get(lid)!.name}</option>)}
            </select>
          </div>
        )}
        <div className="calc-field">
          <span className="calc-label">Level now</span>
          <span className="calc-static">{level}</span>
        </div>
        <div className="calc-field">
          <label htmlFor={ids.target}>Goal</label>
          <input id={ids.target} type="text" inputMode="numeric" pattern="[0-9]*" value={target}
            onChange={(e) => setTarget(e.target.value.replace(/\D/g, '').slice(0, 2))} onFocus={(e) => e.target.select()} />
        </div>
        <div className="calc-field">
          <label htmlFor={ids.xp}>Exact XP</label>
          <input id={ids.xp} type="text" inputMode="numeric" value={xpNow} placeholder={formatXp(xpForLevel(level))}
            aria-describedby={`${ids.xp}-hint`}
            onChange={(e) => setXpNow(e.target.value)} />
        </div>
      </div>
      <p className="calc-result" aria-live="polite">
        {targetLevel <= level
          ? <>Level {targetLevel} is already reached.</>
          : <><strong>{formatXp(left)}</strong> XP to level {targetLevel} <span className="muted">({name.toLowerCase()})</span></>}
      </p>
      {SKILL_NAMES.includes(which as SkillName) && <button type="button" className="btn btn-primary training-custom-follow"
        disabled={targetLevel <= level || mode === 'f2p' && Boolean(findSkill(levelById.get(which)?.skill ?? '')?.membersOnly)}
        onClick={() => { if (setTracked({ skill: which as SkillName, mode: 'fast', freeOnly: mode === 'f2p', target: targetLevel })) window.location.hash = hrefTo.path(); }}>
        Follow to level {targetLevel}
      </button>}
      <p className="muted small" id={`${ids.xp}-hint`}>
        {hasExact ? `Now ${formatXp(exact)}` : `Level ${level} starts at ${formatXp(xpForLevel(level))}`} · level {targetLevel} — {formatXp(xpForLevel(targetLevel))} XP.
        {xpNow.trim() && !hasExact && ' The exact XP does not match the level — counting from the start of the level.'}
        {!xpNow.trim() && ' The exact XP from the game can be left empty — then the count is from the start of the level.'}
      </p>
    </section>
  );
}

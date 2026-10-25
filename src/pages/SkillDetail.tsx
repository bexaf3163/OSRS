import { useEffect, useId, useState } from 'react';
import type { Skill } from '../types';
import { findSkill, goals, levelById } from '../data';
import { useStore } from '../store';
import { useBridge } from '../bridge';
import { currentStage, isClosed } from '../lib/next-step';
import { formatXp, goalFor } from '../lib/goals';
import { levelOf } from '../lib/progress';
import { focusRange, rangeForLevel } from '../lib/ranges';
import { clampLevel, levelForXp, MAX_LEVEL, xpForLevel } from '../lib/xp';
import { SkillGlyph } from '../components/SectionShell';
import { Blocks } from '../components/Blocks';
import { IconBack, IconCheck, IconExternal, TypeIcon } from '../components/Icons';
import { LevelInput } from '../components/LevelInput';
import { Table } from '../components/Table';
import { LiveXp } from '../components/LiveXp';
import { TrainingCard } from '../components/TrainingCard';
import { RoadmapPane, useTrackedStep } from '../components/SkillRoadmap';
import { methodOfGuideStep } from '../lib/trainingRouter';
import { roadmapSkills } from './Skills';
import { trainingFocus, type TrainingFocus } from '../lib/skillFocus';

export function SkillDetailPage({ id }: { id: string }) {
  const skill = findSkill(id);
  if (!skill) {
    return (
      <div className="page">
        <a className="back" href="#/skills"><IconBack />Skills</a>
        <h1>Skill not found</h1>
        <p className="muted">There is no skill with the code "{id}".</p>
      </div>
    );
  }
  return <SkillView skill={skill} />;
}

type SkillTab = 'guide' | 'calculator' | 'reference';

function SkillView({ skill }: { skill: Skill }) {
  const { progress, steps, stages, mode } = useStore();
  const { xp } = useBridge();
  const [tab, setTab] = useState<SkillTab>('guide');
  const guides = roadmapSkills(skill);
  const tabs: [SkillTab, string][] = [
    ['guide', 'Training guide'], ['calculator', 'Calculator'], ['reference', 'Reference'],
  ];
  /** "Now by the plan" leads to the training plan row, which lives in the Reference tab. */
  const showPlan = () => {
    setTab('reference');
    window.setTimeout(() => document.getElementById('plan')?.scrollIntoView({ behavior: 'smooth' }), 60);
  };
  const related = steps.filter((s) => s.targets?.some((t) => levelById.get(t.skill)?.skill === skill.id));
  // "What to train with": the route decides first (a stage goal that is behind), the generic training row only when the route asks for nothing.
  const stage = currentStage(steps, progress);
  const focus = trainingFocus({
    levelSkills: skill.levelSkills, stage, goals, levelOf: (id) => levelOf(progress, id), lastStage: stages[stages.length - 1]?.id,
    rowEnd: (_id, lv) => rangeForLevel(skill.plan.ranges, lv)?.range.to ?? null,
  });
  // The level and plan row of the skill being trained (Melee: the one with a goal ahead, not a Defence kept at 1).
  const { level, hit } = focusRange(skill, progress, goals, stage, stages[stages.length - 1]?.id);
  const focusName = skill.levelSkills.length > 1 ? levelById.get(focus.skill)?.name : undefined;
  // A tracked plan of this page's skills leads the game: the card shows that skill and the plan's method, so the card and the game agree.
  const trackedStep = useTrackedStep();
  const follow = trackedStep && skill.levelSkills.includes(trackedStep.skill) ? trackedStep : null;
  const card = follow
    ? { skill: follow.skill, target: focus.skill === follow.skill ? focus.target : follow.step.targetLevel, followed: methodOfGuideStep(follow.step)?.id ?? null }
    : { skill: focus.skill, target: focus.target, followed: null };

  return (
    <div className="page skill-detail">
      <header className="page-head">
        <SkillGlyph skill={skill.levelSkills[0]} size={48} />
        <h1>{skill.name}<span className="skill-level-goal">{focusName ?? 'Level'} {level} → Goal {focus.target}</span>{skill.membersOnly && <> <span className="badge badge-members">Members</span></>}</h1>
        <p className="muted">
          {(skill.nameEn ?? skill.subtitle) !== skill.name && <>{skill.nameEn ?? skill.subtitle} · </>}
          {skill.wiki && <a href={skill.wiki} target="_blank" rel="noopener noreferrer">Wiki <IconExternal /></a>}
        </p>
      </header>
      {skill.membersOnly && mode === 'f2p' && (
        <p className="notice">This skill can be trained only with membership. Switch the mode to Members in the header to see stages 7–9.</p>
      )}

      <nav className="subtabs" aria-label="Skill sections" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`subtab ${tab === id ? 'is-active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === 'guide' && (
      <>
      <ReachedNote skill={skill} stage={stage} focus={focus} />
      <FocusNote focus={focus} />
      <TrainingCard skill={card.skill} target={card.target} followed={card.followed} />
      {guides.length > 0 && <section className="card skill-guide-roadmap" aria-label="Leveling roadmap"><RoadmapPane skills={guides} label={skill.name} /></section>}

      <details className="card skill-level-editor" open={skill.levelSkills.some(id => xp?.[id] != null)}><summary>Levels and live experience</summary>
      <section className="levels-card" aria-label="Levels">
        <div className="levels-row">
          {skill.levelSkills.map((lid) => <LevelInput key={lid} id={lid} label={levelById.get(lid)!.name} />)}
        </div>
        <LiveXp targets={skill.levelSkills.map((lid) => ({ skill: lid, level: Math.min(99, levelOf(progress, lid) + 1) }))} />
        {hit && (
          <p className="current-range">
            Now by the plan:{' '}
            <button type="button" className="link-btn" onClick={showPlan}>
              <code className="code">{hit.range.code}</code>
            </button> · {hit.range.levels}
            {focusName && <span className="muted"> ({focusName} {level})</span>}
          </p>
        )}
      </section>
      </details>

      {related.length > 0 && (
        <details className="section skill-related">
          <summary>Path steps with this skill</summary>
          <ul className="link-list">
            {related.map((s) => (
              <li key={s.id} className={isClosed(progress, s.id) ? 'is-done' : ''}>
                <a href={`#/step/${s.id}`}>
                  <code className="code">{s.id}</code>
                  <TypeIcon type={s.type} />
                  <span>{s.title}</span>
                  {isClosed(progress, s.id) && <IconCheck className="done-mark" />}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}

      </>
      )}

      {tab === 'calculator' && <Calculator levelIds={skill.levelSkills} suggest={(lid, level, stage) => defaultTarget(skill, lid, level, stage)} />}

      {tab === 'reference' && (
        <>
          {skill.intro.length > 0 && <div className="prose section"><Blocks blocks={skill.intro} /></div>}

          {skill.sections.map((sec, i) => (
            <section key={sec.title} className="section prose" id={i === skill.plan.sectionIndex ? 'plan' : undefined}>
              <h2>{sec.title}</h2>
              {i === skill.plan.sectionIndex ? <PlanBlocks skill={skill} highlight={hit?.index} blocks={sec.blocks} /> : <Blocks blocks={sec.blocks} />}
            </section>
          ))}
        </>
      )}
    </div>
  );
}

/** Says where the goal below comes from: the route stage or only the generic training row. */
/** The route's goal for this stage, when it is met: said plainly (2.70), so a finished goal never reads as work still to do. */
function ReachedNote({ skill, stage, focus }: { skill: Skill; stage: number; focus: TrainingFocus }) {
  const { progress } = useStore();
  if (focus.source === 'route') return null;
  const met = skill.levelSkills
    .map((id) => ({ id, goal: goalFor(goals, id, stage) }))
    .filter((g) => g.goal && g.goal.kind !== 'optional' && levelOf(progress, g.id) >= g.goal.min);
  if (!met.length) return null;
  return (
    <p className="small focus-reached" role="status">
      <IconCheck /> Stage {stage} goal reached: {met.map((g) => `${levelById.get(g.id)?.name ?? g.id} ${g.goal!.min}`).join(', ')}.
    </p>
  );
}

function FocusNote({ focus }: { focus: TrainingFocus }) {
  const name = levelById.get(focus.skill)?.name ?? focus.skill;
  if (focus.source === 'route') return <p className="muted small focus-note">Goal {focus.target} {name} comes from the route: stage {focus.stage}.</p>;
  if (focus.source === 'ahead') return <p className="muted small focus-note">Nothing is behind on the current stage. The next route goal is {name} {focus.target} (stage {focus.stage}).</p>;
  return <p className="muted small focus-note">The route has no further goal for this skill. Goal {focus.target} is the end of the generic training row.</p>;
}

function PlanBlocks({ skill, highlight, blocks }: { skill: Skill; highlight?: number; blocks: Skill['sections'][number]['blocks'] }) {
  const tableAt = blocks.findIndex((b) => b.t === 'table');
  return (
    <>
      <Blocks blocks={blocks.slice(0, tableAt)} />
      <Table head={skill.plan.head} rows={skill.plan.ranges.map((r) => r.cells)} highlight={highlight}
        highlightLabel="now" codeColumn caption={`Training plan: ${skill.name}`} />
      <Blocks blocks={blocks.slice(tableAt + 1)} />
    </>
  );
}

function defaultTarget(skill: Skill, levelId: string, level: number, stage: number): number {
  const goal = goalFor(goals, levelId, stage);
  if (goal && goal.kind !== 'optional' && goal.min > level) return goal.min;
  const hit = rangeForLevel(skill.plan.ranges, level);
  if (hit?.range.to && hit.range.to > level) return hit.range.to;
  return Math.min(MAX_LEVEL, level + 1);
}

interface CalcProps {
  levelIds: string[];
  /** The default goal: the stage goal or the end of the current plan row. */
  suggest: (levelId: string, level: number, stage: number) => number;
}

function Calculator({ levelIds, suggest }: CalcProps) {
  const { progress, steps } = useStore();
  const stage = currentStage(steps, progress);
  const [which, setWhich] = useState(levelIds[0]);
  const level = levelOf(progress, which);
  const [target, setTarget] = useState(() => String(suggest(which, level, stage)));
  const [xpNow, setXpNow] = useState('');
  const ids = { which: useId(), target: useId(), xp: useId() };

  // A new skill or level — a new default goal.
  useEffect(() => {
    setTarget(String(suggest(which, level, stage)));
    setXpNow('');
    // suggest and the array are recreated on every render — the goal is recomputed only when the skill or level changes.
  }, [levelIds.join(), which, level, stage]);

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
      <p className="muted small" id={`${ids.xp}-hint`}>
        {hasExact ? `Now ${formatXp(exact)}` : `Level ${level} starts at ${formatXp(xpForLevel(level))}`} · level {targetLevel} — {formatXp(xpForLevel(targetLevel))} XP.
        {xpNow.trim() && !hasExact && ' The exact XP does not match the level — counting from the start of the level.'}
        {!xpNow.trim() && ' The exact XP from the game can be left empty — then the count is from the start of the level.'}
      </p>
    </section>
  );
}

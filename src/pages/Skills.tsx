// The list of skills: what to train now in each, and the way into each skill's training guide (its method, place and leveling roadmap).
import { goals, levelById, membersGuide, membersSkills, reference, skills, xpData } from '../data';
import { useStore } from '../store';
import { currentStage } from '../lib/next-step';
import { goalFor, formatXp, isReached } from '../lib/goals';
import { levelOf } from '../lib/progress';
import { focusRange } from '../lib/ranges';
import type { Skill } from '../types';
import { Blocks } from '../components/Blocks';
import { IconCheck, IconChevron } from '../components/Icons';
import { Inline } from '../components/Inline';
import { LevelInput } from '../components/LevelInput';
import { Table } from '../components/Table';
import { SkillGlyph } from '../components/SectionShell';
import { useBridge } from '../bridge';
import { SKILL_NAMES, type SkillName } from '../lib/skillGuide';
import { useTracked } from '../lib/skillTrack';

export function SkillsPage() {
  const { progress, steps, mode } = useStore();
  const stage = currentStage(steps, progress);
  return (
    <div className="page">
      <header className="page-head">
        <h1>Skills</h1>
        <p className="muted">What to train in each skill now; a card opens its training guide. Goals are for stage {stage}.</p>
      </header>

      <details className="disclosure card">
        <summary>{reference.training.title}</summary>
        <div className="prose">
          <Blocks blocks={reference.training.blocks} />
          <h3>{xpData.title}</h3>
          <XpTable />
          <Blocks blocks={xpData.note} />
        </div>
      </details>

      <div className="skill-grid">
        {skills.map((s) => <SkillCard key={s.id} skill={s} stage={stage} />)}
      </div>

      {mode === 'members' && (
        <section className="section" aria-labelledby="members-skills">
          <h2 id="members-skills">Members skills <span className="badge badge-members">Members</span></h2>
          <details className="disclosure card">
            <summary>How the members skill plans work</summary>
            <div className="prose"><Blocks blocks={membersGuide.intro} /></div>
          </details>
          <div className="skill-grid">
            {membersSkills.map((m) => <SkillCard key={m.id} skill={m} stage={stage} />)}
          </div>
        </section>
      )}
    </div>
  );
}

export function XpTable() {
  const half = Math.ceil(xpData.points.length / 2);
  const rows = xpData.points.slice(0, half).map((p, i) => {
    const q = xpData.points[i + half];
    return [String(p.level), formatXp(p.xp), q ? String(q.level) : '', q ? formatXp(q.xp) : ''];
  });
  return <Table head={['Level', 'XP', 'Level', 'XP']} rows={rows} caption="XP to level" />;
}

/** The skills of the card that have a leveling roadmap: the melee card also opens Hitpoints. */
export function roadmapSkills(skill: Skill): SkillName[] {
  const ids = skill.id === 'ME' ? [...skill.levelSkills, 'hitpoints'] : skill.levelSkills;
  return ids.filter((id): id is SkillName => (SKILL_NAMES as readonly string[]).includes(id));
}

/** A skill card leads with what to train now and opens the skill's guide; the level is a number while the game reports it, a field to type into while it does not. */
function SkillCard({ skill, stage }: { skill: Skill; stage: number }) {
  const { progress, stages } = useStore();
  const { state, stats } = useBridge();
  const focus = focusRange(skill, progress, goals, stage, stages[stages.length - 1]?.id);
  const hit = focus.hit;
  const many = skill.levelSkills.length > 1;
  const tracked = useTracked();
  const guides = roadmapSkills(skill);
  const isTracked = tracked !== null && guides.includes(tracked.skill);
  const live = state === 'online' && skill.levelSkills.every((id) => stats?.[id as keyof typeof stats] != null);
  return (
    <article className={`skill-card card ${skill.membersOnly ? 'is-members' : ''} ${isTracked ? 'is-tracked' : ''}`}>
      <a className="skill-card-link" href={`#/skills/${skill.id}`}>
        <SkillGlyph skill={skill.levelSkills[0]} size={28} />
        <span>
          <span className="skill-name">{skill.name}</span>
          {many && <span className="skill-en">{skill.levelSkills.map((id) => levelById.get(id)!.name).join(', ')}</span>}
        </span>
        <IconChevron className="chevron" />
      </a>
      <div className={`skill-levels ${many ? 'is-many' : ''}`}>
        {skill.levelSkills.map((id) => {
          const goal = goalFor(goals, id, stage);
          const reached = goal && isReached(levelOf(progress, id), goal);
          const name = levelById.get(id)!.name;
          return (
            <div key={id} className="skill-level">
              {live
                ? <span className="skill-level-now">{many && <span className="skill-level-name">{name}</span>}<strong>{levelOf(progress, id)}</strong></span>
                : <LevelInput id={id} label={many ? name : `Level: ${name}`} hideLabel={!many} compact />}
              {goal && (
                <span className={`goal-chip ${reached ? 'is-reached' : ''}`}>
                  {goal.kind === 'optional' ? 'optional ' : ''}goal {goal.raw}{reached && <IconCheck />}
                  <span className="visually-hidden"> at stage {stage}{reached ? ', reached' : ''}</span>
                </span>
              )}
            </div>
          );
        })}
      </div>
      {hit && <p className="skill-range"><span className="muted">Now{many ? ` (${levelById.get(focus.skill)?.name ?? focus.skill})` : ''}:</span> <Inline text={hit.range.what} /></p>}
      <p className="skill-card-actions">
        <a className="btn btn-sm skill-guide-link" href={`#/skills/${skill.id}`}>Training guide</a>
        {isTracked && <span className="badge badge-now">followed in the game</span>}
      </p>
    </article>
  );
}

// The list of skills: what to train now in each, and the way into each skill's training guide (its method, place and leveling roadmap).
import { levelById, membersGuide, membersSkills, reference, skills, xpData } from '../data';
import { useStore } from '../store';
import { currentStage } from '../lib/next-step';
import { formatXp } from '../lib/goals';
import { levelOf } from '../lib/progress';
import type { Skill } from '../types';
import { Blocks } from '../components/Blocks';
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
        <p className="muted">Choose a skill for a recommended method. Goals follow stage {stage}.</p>
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

      <div className="skill-grid skill-grid-compact">
        {skills.flatMap((s) => s.levelSkills.map((id) => <SkillCard key={id} skill={s} id={id} />))}
      </div>

      {mode === 'members' && (
        <section className="section" aria-labelledby="members-skills">
          <h2 id="members-skills">Members skills <span className="badge badge-members">Members</span></h2>
          <details className="disclosure card">
            <summary>How the members skill plans work</summary>
            <div className="prose"><Blocks blocks={membersGuide.intro} /></div>
          </details>
          <div className="skill-grid skill-grid-compact">
            {membersSkills.flatMap((m) => m.levelSkills.map((id) => <SkillCard key={id} skill={m} id={id} />))}
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

/** One skill per tile; recommendations and manual level editing live on its detail page. */
function SkillCard({ skill, id }: { skill: Skill; id: string }) {
  const { progress } = useStore();
  const { state, stats } = useBridge();
  const tracked = useTracked();
  const live = state === 'online' && stats?.[id as keyof typeof stats] != null;
  const name = levelById.get(id)?.name ?? skill.name;
  const isTracked = tracked?.skill === id;
  return (
    <article className={`skill-card card skill-tile ${skill.membersOnly ? 'is-members' : ''} ${isTracked ? 'is-tracked' : ''}`}>
      <a className="skill-card-link" href={`#/skills/${skill.id}/${id}`} aria-label={`${name}, level ${levelOf(progress, id)}${live ? ', live' : ', saved'}`}>
        <SkillGlyph skill={id} size={28} />
        <span className="skill-name">{name}</span>
        <span className="muted">{levelOf(progress, id)}{isTracked && <span className="visually-hidden">, followed in the game</span>}</span>
      </a>
    </article>
  );
}

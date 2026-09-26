import { goals, levelById, membersSkills, reference, skills, xpData, type MembersSkill } from '../data';
import { useStore } from '../store';
import { currentStage } from '../lib/next-step';
import { goalFor, formatXp, isReached } from '../lib/goals';
import { levelOf } from '../lib/progress';
import { skillRange } from '../lib/ranges';
import type { Skill } from '../types';
import { Blocks } from '../components/Blocks';
import { IconCheck, IconChevron } from '../components/Icons';
import { Inline } from '../components/Inline';
import { LevelInput } from '../components/LevelInput';
import { Table } from '../components/Table';

export function SkillsPage() {
  const { progress, steps, mode } = useStore();
  const stage = currentStage(steps, progress);
  return (
    <div className="page">
      <header className="page-head">
        <h1>Навыки</h1>
        <p className="muted">Введи текущие уровни — трекер подсветит строку плана и сравнит с целью этапа {stage}.</p>
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
          <h2 id="members-skills">Навыки подписки <span className="badge badge-members">Members</span></h2>
          <p className="muted">Плана прокачки по ним в гайде нет — уровень, калькулятор опыта и ссылка на гайд OSRS Wiki.</p>
          <div className="skill-grid">
            {membersSkills.map((m) => <MembersSkillCard key={m.id} skill={m} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function MembersSkillCard({ skill }: { skill: MembersSkill }) {
  return (
    <article className="skill-card card is-members">
      <a className="skill-card-link" href={`#/skills/${skill.id}`}>
        <span>
          <span className="skill-name">{skill.name}</span>
          <span className="skill-en">{skill.nameEn}</span>
        </span>
        <IconChevron className="chevron" />
      </a>
      <div className="skill-levels">
        <div className="skill-level">
          <LevelInput id={skill.id} label={`Уровень: ${skill.name}`} hideLabel compact />
        </div>
      </div>
    </article>
  );
}

export function XpTable() {
  const half = Math.ceil(xpData.points.length / 2);
  const rows = xpData.points.slice(0, half).map((p, i) => {
    const q = xpData.points[i + half];
    return [String(p.level), formatXp(p.xp), q ? String(q.level) : '', q ? formatXp(q.xp) : ''];
  });
  return <Table head={['Уровень', 'Опыт', 'Уровень', 'Опыт']} rows={rows} caption="Опыт до уровня" />;
}

function SkillCard({ skill, stage }: { skill: Skill; stage: number }) {
  const { progress } = useStore();
  const hit = skillRange(skill, progress);
  const many = skill.levelSkills.length > 1;
  return (
    <article className="skill-card card">
      <a className="skill-card-link" href={`#/skills/${skill.id}`}>
        <span>
          <span className="skill-name">{skill.name}</span>
          <span className="skill-en">{skill.nameEn ?? skill.subtitle}</span>
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
              <LevelInput id={id} label={many ? name : `Уровень: ${name}`} hideLabel={!many} compact />
              {goal && (
                <span className={`goal-chip ${reached ? 'is-reached' : ''}`}>
                  цель {goal.raw}{reached && <IconCheck />}
                  <span className="visually-hidden"> на этапе {stage}{reached ? ', достигнута' : ''}</span>
                </span>
              )}
            </div>
          );
        })}
      </div>
      {hit && (
        <p className="skill-range">
          <code className="code">{hit.range.code}</code> <Inline text={hit.range.what} />
        </p>
      )}
    </article>
  );
}

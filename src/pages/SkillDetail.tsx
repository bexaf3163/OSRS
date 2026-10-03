import { useEffect, useId, useState } from 'react';
import type { Skill } from '../types';
import { findSkill, goals, levelById } from '../data';
import { useStore } from '../store';
import { currentStage, isClosed } from '../lib/next-step';
import { formatXp, goalFor } from '../lib/goals';
import { levelOf } from '../lib/progress';
import { rangeForLevel, skillLevel } from '../lib/ranges';
import { clampLevel, levelForXp, MAX_LEVEL, xpForLevel } from '../lib/xp';
import { Blocks } from '../components/Blocks';
import { IconBack, IconCheck, IconExternal, TypeIcon } from '../components/Icons';
import { LevelInput } from '../components/LevelInput';
import { Table } from '../components/Table';
import { LiveXp } from '../components/LiveXp';

export function SkillDetailPage({ id }: { id: string }) {
  const skill = findSkill(id);
  if (!skill) {
    return (
      <div className="page">
        <a className="back" href="#/skills"><IconBack />Навыки</a>
        <h1>Навык не найден</h1>
        <p className="muted">Кода «{id}» нет в гайде.</p>
      </div>
    );
  }
  return <SkillView skill={skill} />;
}

function SkillView({ skill }: { skill: Skill }) {
  const { progress, steps, mode } = useStore();
  const level = skillLevel(skill, progress);
  const hit = rangeForLevel(skill.plan.ranges, level);
  const related = steps.filter((s) => s.targets?.some((t) => levelById.get(t.skill)?.skill === skill.id));

  return (
    <div className="page">
      <a className="back" href="#/skills"><IconBack />Навыки</a>
      <header className="page-head">
        <h1>{skill.name}{skill.membersOnly && <> <span className="badge badge-members">Members</span></>}</h1>
        <p className="muted">
          {skill.nameEn ?? skill.subtitle}
          {skill.wiki && <> · <a href={skill.wiki} target="_blank" rel="noopener noreferrer">Вики <IconExternal /></a></>}
        </p>
      </header>
      {skill.membersOnly && mode === 'f2p' && (
        <p className="notice">Навык качается только с подпиской. Переключи режим на Members в шапке, чтобы увидеть этапы 7–9.</p>
      )}

      <section className="card levels-card" aria-label="Уровни">
        <div className="levels-row">
          {skill.levelSkills.map((lid) => <LevelInput key={lid} id={lid} label={levelById.get(lid)!.name} />)}
        </div>
        <LiveXp targets={skill.levelSkills.map((lid) => ({ skill: lid, level: Math.min(99, levelOf(progress, lid) + 1) }))} />
        {hit && (
          <p className="current-range">
            Сейчас по плану:{' '}
            <button type="button" className="link-btn" onClick={() => document.getElementById('plan')?.scrollIntoView({ behavior: 'smooth' })}>
              <code className="code">{hit.range.code}</code>
            </button> · {hit.range.levels}
            {skill.levelSkills.length > 1 && <span className="muted"> (по отстающему, ур. {level})</span>}
          </p>
        )}
      </section>

      <Calculator levelIds={skill.levelSkills} suggest={(lid, level, stage) => defaultTarget(skill, lid, level, stage)} />

      {related.length > 0 && (
        <section className="section">
          <h2>Шаги пути с этим навыком</h2>
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
        </section>
      )}

      {skill.intro.length > 0 && <div className="prose section"><Blocks blocks={skill.intro} /></div>}

      {skill.sections.map((sec, i) => (
        <section key={sec.title} className="section prose" id={i === skill.plan.sectionIndex ? 'plan' : undefined}>
          <h2>{sec.title}</h2>
          {i === skill.plan.sectionIndex ? <PlanBlocks skill={skill} highlight={hit?.index} blocks={sec.blocks} /> : <Blocks blocks={sec.blocks} />}
        </section>
      ))}
    </div>
  );
}

function PlanBlocks({ skill, highlight, blocks }: { skill: Skill; highlight?: number; blocks: Skill['sections'][number]['blocks'] }) {
  const tableAt = blocks.findIndex((b) => b.t === 'table');
  return (
    <>
      <Blocks blocks={blocks.slice(0, tableAt)} />
      <Table head={skill.plan.head} rows={skill.plan.ranges.map((r) => r.cells)} highlight={highlight}
        highlightLabel="сейчас" codeColumn caption={`План прокачки: ${skill.name}`} />
      <Blocks blocks={blocks.slice(tableAt + 1)} />
    </>
  );
}

function defaultTarget(skill: Skill, levelId: string, level: number, stage: number): number {
  const goal = goalFor(goals, levelId, stage);
  if (goal && goal.min > level) return goal.min;
  const hit = rangeForLevel(skill.plan.ranges, level);
  if (hit?.range.to && hit.range.to > level) return hit.range.to;
  return Math.min(MAX_LEVEL, level + 1);
}

interface CalcProps {
  levelIds: string[];
  /** Цель по умолчанию: цель этапа или конец текущей строки плана. */
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

  // Новый навык или уровень — новая цель по умолчанию.
  useEffect(() => {
    setTarget(String(suggest(which, level, stage)));
    setXpNow('');
    // suggest и массив пересоздаются на каждом рендере — цель пересчитывается только при смене навыка или уровня.
  }, [levelIds.join(), which, level, stage]);

  const targetLevel = clampLevel(Number(target) || 1);
  const exact = xpNow.trim() ? Number(xpNow.replace(/\D/g, '')) : NaN;
  const hasExact = Number.isFinite(exact) && levelForXp(exact) === level;
  const from = hasExact ? exact : xpForLevel(level);
  const left = Math.max(0, xpForLevel(targetLevel) - from);
  const name = levelById.get(which)!.name;

  return (
    <section className="card calc" aria-labelledby={`${ids.which}-h`}>
      <h2 className="card-title" id={`${ids.which}-h`}>Сколько опыта осталось</h2>
      <div className="calc-grid">
        {levelIds.length > 1 && (
          <div className="calc-field">
            <label htmlFor={ids.which}>Навык</label>
            <select id={ids.which} value={which} onChange={(e) => setWhich(e.target.value)}>
              {levelIds.map((lid) => <option key={lid} value={lid}>{levelById.get(lid)!.name}</option>)}
            </select>
          </div>
        )}
        <div className="calc-field">
          <span className="calc-label">Уровень сейчас</span>
          <span className="calc-static">{level}</span>
        </div>
        <div className="calc-field">
          <label htmlFor={ids.target}>Цель</label>
          <input id={ids.target} type="text" inputMode="numeric" pattern="[0-9]*" value={target}
            onChange={(e) => setTarget(e.target.value.replace(/\D/g, '').slice(0, 2))} onFocus={(e) => e.target.select()} />
        </div>
        <div className="calc-field">
          <label htmlFor={ids.xp}>Точный опыт</label>
          <input id={ids.xp} type="text" inputMode="numeric" value={xpNow} placeholder={formatXp(xpForLevel(level))}
            aria-describedby={`${ids.xp}-hint`}
            onChange={(e) => setXpNow(e.target.value)} />
        </div>
      </div>
      <p className="calc-result" aria-live="polite">
        {targetLevel <= level
          ? <>Уровень {targetLevel} уже взят.</>
          : <><strong>{formatXp(left)}</strong> опыта до {targetLevel} уровня <span className="muted">({name.toLowerCase()})</span></>}
      </p>
      <p className="muted small" id={`${ids.xp}-hint`}>
        {hasExact ? `Сейчас ${formatXp(exact)}` : `Уровень ${level} начинается с ${formatXp(xpForLevel(level))}`} · уровень {targetLevel} — {formatXp(xpForLevel(targetLevel))} опыта.
        {xpNow.trim() && !hasExact && ' Точный опыт не подходит к уровню — считаю от начала уровня.'}
        {!xpNow.trim() && ' Точный опыт из игры можно не вводить — тогда счёт от начала уровня.'}
      </p>
    </section>
  );
}

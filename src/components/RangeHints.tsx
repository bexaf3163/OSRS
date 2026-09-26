// Подходящая строка «Плана прокачки» для шага — по текущим уровням.

import type { Step } from '../types';
import { levelById, skillById } from '../data';
import { useStore } from '../store';
import { skillLevel, skillRange } from '../lib/ranges';
import { Inline } from './Inline';

export function stepSkills(step: Step) {
  const ids = [...new Set((step.targets ?? []).map((t) => levelById.get(t.skill)?.skill).filter(Boolean) as string[])];
  return ids.map((id) => skillById.get(id)!).filter(Boolean);
}

export function RangeHints({ step }: { step: Step }) {
  const { progress } = useStore();
  const skills = stepSkills(step);
  if (!skills.length) return null;
  return (
    <ul className="hints" aria-label="Строки плана прокачки по твоим уровням">
      {skills.map((skill) => {
        const hit = skillRange(skill, progress);
        if (!hit) return null;
        const r = hit.range;
        return (
          <li key={skill.id} className="hint">
            <a className="hint-code" href={`#/skills/${skill.id}`}>{r.code}</a>
            <div className="hint-body">
              <div className="hint-title">
                <span className="muted">{skill.name}, ур. {skillLevel(skill, progress)} · {r.levels}</span>
              </div>
              <div><Inline text={r.what} /></div>
              {skill.plan.head.slice(3).map((h, i) => {
                const cell = r.cells[i + 3];
                return cell && cell !== '—'
                  ? <div key={h} className="muted small">{h}: <Inline text={cell} /></div>
                  : null;
              })}
              {hit.beyond && <div className="muted small">Уровень выше последней строки плана.</div>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

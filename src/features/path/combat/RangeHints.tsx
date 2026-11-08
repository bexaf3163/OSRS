// The matching row of the "Training plan" for a step — by the current levels.

import type { Step } from '../../../types';
import { levelById, skillById } from '../../../data';
import { useStore } from '../../../state/store';
import { focusRange } from '../../../domain/training/ranges';
import { usePlannerSkillGoals } from '../../../state/decision';
import { Inline } from '../../../ui/Inline';
import { hrefTo } from '../../../domain/pages/pages';

export function stepSkills(step: Step) {
  const ids = [...new Set((step.targets ?? []).map((t) => levelById.get(t.skill)?.skill).filter(Boolean) as string[])];
  return ids.map((id) => skillById.get(id)!).filter(Boolean);
}

export function RangeHints({ step }: { step: Step }) {
  const { progress } = useStore();
  const skills = stepSkills(step);
  const goals = usePlannerSkillGoals();
  if (!skills.length) return null;
  return (
    <ul className="hints" aria-label="Training plan rows for your levels">
      {skills.map((skill) => {
        const focus = focusRange(skill, progress, (id) => goals.get(id)?.level);
        const hit = focus.hit;
        if (!hit) return null;
        const r = hit.range;
        return (
          <li key={skill.id} className="hint">
            <a className="hint-code" href={hrefTo.skills(skill.id)}>{r.code}</a>
            <div className="hint-body">
              <div className="hint-title">
                <span className="muted">{skill.name}, {skill.levelSkills.length > 1 ? levelById.get(focus.skill)?.name ?? 'level' : 'level'} {focus.level} · {r.levels}</span>
              </div>
              <div><Inline text={r.what} /></div>
              {skill.plan.head.slice(3).map((h, i) => {
                const cell = r.cells[i + 3];
                return cell && cell !== '—'
                  ? <div key={h} className="muted small">{h}: <Inline text={cell} /></div>
                  : null;
              })}
              {hit.beyond && <div className="muted small">The level is above the last plan row.</div>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

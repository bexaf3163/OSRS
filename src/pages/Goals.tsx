import { BASE_QP, goals, levelSkills, steps } from '../data';
import { useStore } from '../store';
import { currentStage } from '../lib/next-step';
import { isReached } from '../lib/goals';
import { levelOf } from '../lib/progress';
import { stageQuestPoints } from '../lib/qp';
import { IconCheck } from '../components/Icons';

export function GoalsPage() {
  const { progress, qp } = useStore();
  const stage = currentStage(steps, progress);
  const levelRows = goals.rows.filter((r) => r.id !== 'qp');
  const qpRow = goals.rows.find((r) => r.id === 'qp');

  return (
    <div className="page">
      <header className="page-head">
        <h1>Цели по этапам</h1>
        <p className="muted">{goals.intro}</p>
      </header>

      <div className="legend" aria-hidden="true">
        <span className="legend-item"><span className="swatch is-reached" />достигнуто</span>
        <span className="legend-item"><span className="swatch" />ещё нет</span>
        <span className="legend-item"><span className="swatch is-current" />текущий этап</span>
      </div>

      <div className="table-wrap goals-wrap" tabIndex={0} role="region" aria-label="Цели по этапам">
        <table className="table goals-table">
          <thead>
            <tr>
              <th scope="col">Навык</th>
              {goals.stages.map((label, i) => (
                <th key={label} scope="col" className={i + 1 === stage ? 'is-current-col' : undefined}>
                  {label.replace('Этап ', '')}<span className="visually-hidden"> этап</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {levelRows.map((row) => {
              const level = levelOf(progress, row.id);
              return (
                <tr key={row.id}>
                  <th scope="row">
                    <a href={`#/skills/${levelSkills.find((l) => l.id === row.id)?.skill}`}>{row.label}</a>
                    <span className="row-level">{level}</span>
                  </th>
                  {row.values.map((v, i) => {
                    const ok = isReached(level, v);
                    return (
                      <td key={i} className={`goal ${ok ? 'is-reached' : ''} ${i + 1 === stage ? 'is-current-col' : ''}`}>
                        {v.raw}{ok && <IconCheck />}
                        <span className="visually-hidden">{ok ? ', достигнуто' : ', не достигнуто'}</span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {qpRow && (
              <tr className="qp-row">
                <th scope="row">{qpRow.label}<span className="row-level">{qp}</span></th>
                {qpRow.values.map((v, i) => {
                  // Пропущенный необязательный квест снижает цель: его очки взять негде.
                  const effective = Math.min(v.min, stageQuestPoints(steps, i + 1, BASE_QP, progress));
                  const ok = qp >= effective;
                  const lowered = effective < v.min;
                  return (
                    <td key={i} className={`goal ${ok ? 'is-reached' : ''} ${i + 1 === stage ? 'is-current-col' : ''}`}
                      title={lowered ? `С учётом пропущенного квеста — ${effective}` : undefined}>
                      {v.raw}{lowered && <sup>*</sup>}{ok && <IconCheck />}
                      <span className="visually-hidden">{ok ? ', достигнуто' : ', не достигнуто'}{lowered ? `, с учётом пропуска цель ${effective}` : ''}</span>
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {qpRow && steps.some((s) => s.qp && progress.steps[s.id] === 'skipped') && (
        <p className="muted small">* Цель по очкам снижена на очки пропущенного необязательного квеста.</p>
      )}
      {goals.note && <p className="muted">{goals.note}</p>}
      <p className="muted small">Цель вида «50–60» считается достигнутой с нижней границы. Уровни вводятся на вкладке «Навыки» или прямо в шагах.</p>
    </div>
  );
}

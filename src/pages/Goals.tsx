// The "Goals" screen: the levels for each stage.
import { BASE_QP, goals, levelSkills } from '../data';
import { useStore } from '../store';
import { currentStage } from '../lib/next-step';
import { isReached } from '../lib/goals';
import { levelOf } from '../lib/progress';
import { stageQuestPoints } from '../lib/qp';
import { IconCheck } from '../components/Icons';
import { SplitsCard } from '../components/SplitsCard';

/** The goals of the current stage that are not reached yet: the short answer to "what do I still need here". */
function RelevantNow({ stage }: { stage: number }) {
  const { progress } = useStore();
  const behind = goals.rows
    .filter((r) => r.id !== 'qp')
    .map((r) => ({ row: r, goal: r.values[stage - 1], level: levelOf(progress, r.id) }))
    .filter((x) => x.goal && !isReached(x.level, x.goal));
  return (
    <section className="card section-card goals-now" aria-label="Goals for the current stage">
      <h2 className="card-title">Still to reach in stage {stage}</h2>
      {behind.length === 0
        ? <p className="small">Every level goal of this stage is reached.</p>
        : (
          <ul className="goals-now-list">
            {behind.map(({ row, goal, level }) => (
              <li key={row.id}><a href={`#/skills/${levelSkills.find((l) => l.id === row.id)?.skill}`}>{row.label}</a> {level} <span aria-hidden="true">→</span> <span className="visually-hidden">goal </span><strong>{goal?.raw}</strong></li>
            ))}
          </ul>
        )}
    </section>
  );
}

export function GoalsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { progress, qp, steps } = useStore();
  const stage = currentStage(steps, progress);
  const levelRows = goals.rows.filter((r) => r.id !== 'qp');
  const qpRow = goals.rows.find((r) => r.id === 'qp');

  return (
    <div className={embedded ? 'journal-pane' : 'page'}>
      <header className="page-head">
        {embedded ? <h2>Goals by stage</h2> : <h1>Goals by stage</h1>}
        <p className="muted">{goals.intro}</p>
      </header>

      <RelevantNow stage={stage} />

      <div className="legend" aria-hidden="true">
        <span className="legend-item"><span className="swatch is-reached" />reached</span>
        <span className="legend-item"><span className="swatch" />not yet</span>
        <span className="legend-item"><span className="swatch is-current" />current stage</span>
      </div>

      <div className="table-wrap goals-wrap" tabIndex={0} role="region" aria-label="Goals by stage">
        <table className="table goals-table">
          <thead>
            <tr>
              <th scope="col">Skill</th>
              {goals.stages.map((label, i) => (
                <th key={label} scope="col" className={i + 1 === stage ? 'is-current-col' : undefined}>
                  {label.replace('Stage ', '')}<span className="visually-hidden"> stage</span>
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
                        <span className="visually-hidden">{ok ? ', reached' : ', not reached'}</span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {qpRow && (
              <tr className="qp-row">
                <th scope="row">{qpRow.label}<span className="row-level">{qp}</span></th>
                {goals.stages.map((_, i) => {
                  // The quest points goal is counted from the V2 route: the sum of quest points up to the end of the stage.
                  // A skipped optional quest lowers the goal: there is nowhere to take its points.
                  const planned = stageQuestPoints(steps, i + 1, BASE_QP);
                  const effective = stageQuestPoints(steps, i + 1, BASE_QP, progress);
                  const ok = qp >= effective;
                  const lowered = effective < planned;
                  return (
                    <td key={i} className={`goal ${ok ? 'is-reached' : ''} ${i + 1 === stage ? 'is-current-col' : ''}`}
                      title={lowered ? `Taking the skipped quest into account — ${effective}` : undefined}>
                      {planned}{lowered && <sup>*</sup>}{ok && <IconCheck />}
                      <span className="visually-hidden">{ok ? ', reached' : ', not reached'}{lowered ? `, with the skip the goal is ${effective}` : ''}</span>
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {qpRow && steps.some((s) => s.qp && progress.steps[s.id] === 'skipped') && (
        <p className="muted small">* The points goal is lowered by the points of a skipped optional quest.</p>
      )}
      {goals.note && <p className="muted">{goals.note}</p>}
      <p className="muted small">Quest points are counted by the V2 route; the levels are a guideline for stages 1–6 (F2P).</p>
      <p className="muted small">A goal like "50–60" counts as reached from the lower bound. Levels are entered on the "Skills" tab or right in the steps.</p>
      <SplitsCard />
    </div>
  );
}

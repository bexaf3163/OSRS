// The "Goals" screen: the levels for each stage.
import { BASE_QP, goals, levelById } from '../data';
import { useStore } from '../store';
import { useQuestPoints } from '../lib/useQuestPoints';
import { currentStage } from '../lib/next-step';
import { isReached } from '../lib/goals';
import { levelOf } from '../lib/progress';
import { stageQuestPoints } from '../lib/qp';
import { IconCheck } from '../components/Icons';
import { SplitsCard } from '../components/SplitsCard';

/** The goals of the current stage that are not reached yet: the short answer to "what do I still need here". */
function RelevantNow({ stage }: { stage: number }) {
  const { progress } = useStore();
  // An optional cell (the Bond branch) is never "still to reach": the player may skip the step it belongs to.
  const behind = goals.rows
    .filter((r) => r.id !== 'qp')
    .map((r) => ({ row: r, goal: r.values[stage - 1], level: levelOf(progress, r.id) }))
    .filter((x) => x.goal && x.goal.kind !== 'optional' && !isReached(x.level, x.goal));
  return (
    <section className="card section-card goals-now" aria-label="Goals for the current stage">
      <h2 className="card-title">Still to reach in stage {stage}</h2>
      {behind.length === 0
        ? <p className="small">Every level goal of this stage is reached.</p>
        : (
          <ul className="goals-now-list">
            {behind.map(({ row, goal, level }) => (
              <li key={row.id}><a href={`#/skills/${levelById.get(row.id)?.skill}`}>{row.label}</a> {level} <span aria-hidden="true">→</span> <span className="visually-hidden">goal </span><strong>{goal?.raw}</strong></li>
            ))}
          </ul>
        )}
    </section>
  );
}

export function GoalsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { progress, steps, stages } = useStore();
  const qp = useQuestPoints();
  const stage = currentStage(steps, progress);
  const shown = stages.map((s) => s.id);
  const hasOptional = goals.rows.some((r) => r.values.some((v, i) => v.kind === 'optional' && shown.includes(i + 1)));
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
        {hasOptional && <span className="legend-item"><span className="swatch is-optional" />optional (Bond branch)</span>}
      </div>

      <div className="table-wrap goals-wrap" tabIndex={0} role="region" aria-label="Goals by stage">
        <table className="table goals-table">
          <thead>
            <tr>
              <th scope="col">Skill</th>
              {goals.stages.map((label, i) => shown.includes(i + 1) && (
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
                    <a href={`#/skills/${levelById.get(row.id)?.skill}`}>{row.label}</a>
                    <span className="row-level">{level}</span>
                  </th>
                  {row.values.map((v, i) => {
                    if (!shown.includes(i + 1)) return null;
                    const ok = isReached(level, v);
                    const opt = v.kind === 'optional';
                    return (
                      <td key={i} className={`goal ${ok ? 'is-reached' : ''} ${opt ? 'is-optional' : ''} ${i + 1 === stage ? 'is-current-col' : ''}`}
                        title={v.from?.length ? `From ${v.from.join(', ')}${v.max ? ` · up to ${v.max} with the likely extras` : ''}` : undefined}>
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
                  if (!shown.includes(i + 1)) return null;
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
      <p className="muted small">Your quest points are the game's own count while it is connected, else counted from the route steps of your mode; the stage targets come from the route. The levels are what the route itself gives by the end of each stage.</p>
      <p className="muted small">A goal like "20–25" counts as reached from the lower bound: the upper number is what the likely extras reach. Levels are entered on the "Skills" tab or right in the steps.</p>
      <SplitsCard />
    </div>
  );
}

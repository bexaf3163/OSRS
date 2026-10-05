// "Time per stage": the real pace of the route, stage by stage (lib/splits.ts). Only what was timed is shown; the rest is counted apart, never guessed.

import { useMemo } from 'react';
import { allStages } from '../data';
import { useStore } from '../store';
import { BREAK_SECONDS, computeSplits, durationText } from '../lib/splits';

export function SplitsCard() {
  const { progress, steps } = useStore();
  const report = useMemo(() => computeSplits(steps, progress), [steps, progress]);
  const title = (n: number) => allStages.find((s) => s.id === n)?.title ?? `Stage ${n}`;
  const titleOf = (id: string) => steps.find((s) => s.id === id)?.title ?? id;

  return (
    <section className="card section-card splits-card" aria-label="Time per stage">
      <h2 className="card-title">⏱ Time per stage</h2>
      {report.stages.length === 0 ? (
        <p className="muted small">Times start with the next step you mark done: each step is timed from the previous one.</p>
      ) : (
        <>
          <p className="small">
            Active time so far: <strong>{durationText(report.activeSeconds)}</strong>. A step is timed from the previous one, so walking between them is included;
            a gap over {BREAK_SECONDS / 60} minutes counts as a break and is left out.
          </p>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Time per stage table">
            <table className="table">
              <thead>
                <tr><th scope="col">Stage</th><th scope="col">Timed steps</th><th scope="col">Active time</th><th scope="col">Breaks</th></tr>
              </thead>
              <tbody>
                {report.stages.map((g) => (
                  <tr key={g.stage}>
                    <th scope="row">{g.stage}. {title(g.stage)}</th>
                    <td>{g.steps.filter((s) => s.kind !== 'first').length}</td>
                    <td>{durationText(g.activeSeconds)}</td>
                    <td>{g.breaks || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report.slowest.length > 0 && (
            <p className="small muted">Slowest: {report.slowest.map((s) => `${s.id} ${titleOf(s.id)} (${durationText(s.seconds!)})`).join(', ')}.</p>
          )}
        </>
      )}
      {report.untimed > 0 && (
        <p className="small muted">{report.untimed} done {report.untimed === 1 ? 'step has' : 'steps have'} no time: marked in bulk from the game or before times were kept.</p>
      )}
    </section>
  );
}

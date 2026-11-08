// The planner's live order of the open quests, apart from the guide's walkthrough order below it. Every row says why it is
// or is not next, with its own minutes or the parts whose time is unknown; a low-confidence choice says it was not optimised.
import { Eyebrow } from '../../ledger';
import type { PlannerRow } from '../../state/decision';

export function PlannerOrder({ rows, confidence, selectedId, onSelect }: {
  rows: readonly PlannerRow[]; confidence: string | null; selectedId: string; onSelect: (stepId: string) => void;
}) {
  if (!rows.length) return null;
  return (
    <section className="planner-order" aria-label="Planner's order">
      <Eyebrow>PLANNER'S ORDER · LIVE</Eyebrow>
      {confidence === 'LOW' && <p className="muted small">Low confidence: some times are unknown, so this order is not a proven optimum.</p>}
      <ol>
        {rows.map((row) => (
          <li key={row.id} data-objective={row.id}>
            <button type="button" className="planner-row" data-step={row.stepId ?? ''} disabled={!row.stepId}
              aria-current={row.stepId === selectedId ? 'step' : undefined} onClick={() => row.stepId && onSelect(row.stepId)}>
              <strong>{row.rank}. {row.id}</strong>
              <span className="muted small"> · {row.minutes !== null ? `about ${row.minutes} min` : row.unknown.length ? `time unknown (${row.unknown.join(', ')})` : 'time unknown'}</span>
              <span className="muted small planner-why">{row.verdict}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

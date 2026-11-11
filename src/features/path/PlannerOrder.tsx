// The planner's live order of the open quests. Every row says why it is
// or is not next, with its own minutes or the parts whose time is unknown; a low-confidence choice says it was not optimised. The
// line under it says when the plan updates: the evidence that ends the current action, and the facts it always watches.
import { Eyebrow } from '../../ledger';
import type { PlannerRow } from '../../state/decision';

export function PlannerOrder({ rows, confidence, selectedId, onSelect, updatesWhen = [], empty }: {
  rows: readonly PlannerRow[]; confidence: string | null; selectedId: string; onSelect: (stepId: string) => void;
  /** What ends the current action (the Decision's completion evidence). */
  updatesWhen?: readonly string[];
  /** What to say when nothing is open (every F2P quest done or set aside). */
  empty?: string;
}) {
  if (!rows.length) return empty ? <p className="muted planner-empty">{empty}</p> : null;
  return (
    <section className="planner-order" aria-label="Planner's order">
      <Eyebrow>PLANNER'S ORDER · LIVE</Eyebrow>
      {confidence === 'LOW' && <p className="muted small">Low confidence: some times are unknown, so this order is not a proven optimum.</p>}
      <ol>
        {rows.map((row) => (
          <li key={row.id} data-objective={row.id}>
            <button type="button" className="planner-row" data-step={row.stepId ?? ''} disabled={!row.stepId}
              aria-current={row.stepId === selectedId ? 'step' : undefined} onClick={() => row.stepId && onSelect(row.stepId)}>
              <strong>{row.rank}. {row.title}</strong>
              {row.minutes !== null && <span className="muted small"> · about {row.minutes} min</span>}
              <span className="muted small planner-why">{row.verdict}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="muted small planner-replan">The plan updates when {updatesWhen.length ? `${updatesWhen.join('; ')}, or when` : ''} your levels, items, coins, quests or goal change.</p>
    </section>
  );
}

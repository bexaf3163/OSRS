// "How to make up the money" on steps that need coins (moneyGoal, magicPlan): the funding catalogue, evaluator and ranking of the
// Money page, in short. The method it recommends, the next ones the player can do now, and those a few levels away with what to
// train. Details and Start live on the Money page.
import { useMemo } from 'react';
import type { Step } from '../../../types';
import { formatGp } from '../../../domain/prep/shopping';
import { browse, DEFAULT_FILTERS, unlockOf, type BrowseRow } from '../../../domain/economy/funding/browse';
import { hrefTo } from '../../../domain/pages/pages';
import { useMoneyScreen } from '../../../state/fundingContext';

const SHOWN = 3;

export function MoneyPlan({ step }: { step: Step }) {
  return step.moneyGoal || step.magicPlan ? <MoneyPlanBody step={step} /> : null;
}

function MoneyPlanBody({ step }: { step: Step }) {
  const m = useMoneyScreen(step);
  const result = useMemo(() => browse(m.evals, m.ranking, DEFAULT_FILTERS, 'recommended'), [m.evals, m.ranking]);
  const missing = m.shortfall?.coins ?? null;
  const now = result.rows.slice(0, SHOWN);
  const soon = result.soon.slice(0, SHOWN);
  const row = (r: BrowseRow, hint: string) => (
    <li key={r.evaluation.method.id} className="money-method">
      <p><strong>{r.evaluation.method.title}</strong> <span className="muted small">· {r.net} · {r.capital}</span></p>
      <p className="small">{hint}</p>
    </li>
  );
  return (
    <details className="step-section money-plan" open={missing !== null}>
      <summary><strong>How to make up the money</strong>{missing !== null && <span className="muted small"> — {formatGp(missing)} gp missing</span>}</summary>
      {!m.snap && <p className="muted small">Connect RuneLite so the methods match your levels; until then nothing is confirmed.</p>}
      {now.length > 0
        ? <ul className="money-list">{now.map((r) => row(r, r.evaluation === result.recommended ? 'Recommended: the quickest way for you.' : r.badge.text))}</ul>
        : <p className="small">Nothing you can do now was found.</p>}
      {soon.length > 0 && (
        <>
          <h5 className="subhead">Opens with a few more levels</h5>
          <ul className="money-list">{soon.map((r) => row(r, `${unlockOf(r.evaluation)!.text} opens it`))}</ul>
        </>
      )}
      <p className="small"><a href={hrefTo.money()}>All {m.evals.length} methods, with details and Start, on the Money page</a></p>
    </details>
  );
}

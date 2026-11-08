// "Am I ready for this?" in one line above the preparation list: the status, the next action with the real item and count, and how fresh the bank
// is. The reasons, grouped (access, needed for the activity, safety, optional, not checked), and the cautions are one click away. The answer is
// lib/readinessVerdict.ts on top of the preparation plan and, for a fight, the kit check (lib/combatReadiness.ts). Advice only: nothing is moved.

import { useMemo } from 'react';
import type { Step } from '../../../types';
import { useBridge } from '../../../state/bridge';
import { useReadinessEngine } from '../../../state/readinessContext';
import type { CombatReadiness } from '../../../domain/combat/combatReadiness';
import { GROUP_LABEL, type ReadinessVerdict, type ReasonGroup } from '../../../domain/readiness/readinessVerdict';
import { useCombatPlan } from '../combat/CombatPlan';
import { assessStepReadiness } from '../../../domain/readiness/stepAssessment';

/** The verdict for a step with what the app knows now; recomputed when the plan, the kit or the bank changes. */
export function useReadinessVerdict(step: Step): { verdict: ReadinessVerdict; combat: CombatReadiness | null } {
  const engine = useReadinessEngine();
  const execution = engine.ctx.steps.find(candidate => candidate.id === step.id) ?? step;
  const plan = engine.plan(execution, { ahead: 0 });
  const { state, owned, gear, stats } = useBridge();
  const view = useCombatPlan(execution);
  const connected = state === 'online';
  return useMemo(() => assessStepReadiness({ step: execution, plan, connected, owned, stats, gear, view }),
    [execution, plan, view, gear, owned, connected, stats]);
}

const upperFirst = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const ORDER: ReasonGroup[] = ['access', 'equipment', 'safety', 'unknown', 'optional'];
const MARK = { ok: '✓', bank: '↗', missing: '!', unknown: '○', caution: '⚠' } as const;

/** noPill: the panel's own status line above already names the level ("Preparation required"); the pill would say it a second time. */
export function ReadinessVerdictCard({ step, noPill = false }: { step: Step; noPill?: boolean }) {
  const { verdict: v, combat } = useReadinessVerdict(step);
  const groups = ORDER.map((g) => ({ g, rows: v.reasons.filter((r) => r.group === g) })).filter((x) => x.rows.length);
  return (
    <section className={`readiness-verdict is-${v.level.toLowerCase()}`} aria-label="Readiness">
      <p className="verdict-head" role="status">
        {/* "Preparation needed: bring food…" already starts with the level: the pill would say it twice (seen in the compact view). */}
        {!noPill && !v.headline.startsWith(v.label) && <span className="verdict-pill">{v.label}</span>}
        {/* Under the status line ("Preparation required (1 item)") the level prefix is a third telling of the same thing: it stays for screen readers. */}
        {noPill && v.headline.startsWith(`${v.label}: `)
          ? <span className="verdict-line"><span className="visually-hidden">{v.label}: </span>{upperFirst(v.headline.slice(v.label.length + 2))}</span>
          : <span className="verdict-line">{v.headline}</span>}
      </p>
      {combat?.variant && <p className="small verdict-variant">{combat.variant}</p>}
      {!v.bankInHeadline && <p className="small muted verdict-bank">{v.bank.text}</p>}
      {(groups.length > 0 || v.cautions.length > 0) && (
        <details className="zen-more verdict-why">
          <summary className="small">Why</summary>
          {groups.map(({ g, rows }) => (
            <div key={g} className={`verdict-group is-${g}`}>
              <p className="small subhead">{GROUP_LABEL[g]}</p>
              <ul className="small verdict-reasons">
                {rows.map((r) => (
                  <li key={r.text} className={`is-${r.state}`}><span aria-hidden="true">{MARK[r.state]}</span> {r.text}</li>
                ))}
              </ul>
            </div>
          ))}
          {v.cautions.length > 0 && (
            <ul className="small verdict-cautions">{v.cautions.map((c) => <li key={c}>⚠ {c}</li>)}</ul>
          )}
          <p className="small muted">
            Advice only: nothing is equipped, withdrawn or bought for you. Food numbers are estimates from your levels and gear; no kit guarantees
            survival. {v.percentNote}
          </p>
        </details>
      )}
    </section>
  );
}

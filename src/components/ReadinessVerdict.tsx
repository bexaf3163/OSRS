// "Am I ready for this?" in one line above the preparation list: the status, the next action with the real item and count, and how fresh the bank
// is. The reasons, grouped (access, needed for the activity, safety, optional, not checked), and the cautions are one click away. The answer is
// lib/readinessVerdict.ts on top of the preparation plan and, for a fight, the kit check (lib/combatReadiness.ts). Advice only: nothing is moved.

import { useMemo } from 'react';
import type { Step } from '../types';
import { useBridge } from '../bridge';
import { useReadinessEngine } from '../readinessContext';
import { combatReadiness, type CombatReadiness } from '../lib/combatReadiness';
import { healsOf } from '../lib/combatEstimate';
import { GROUP_LABEL, readinessVerdict, type ReadinessVerdict, type ReasonGroup } from '../lib/readinessVerdict';
import { useCombatPlan } from './CombatPlan';
import { equippedBySlot, gearData } from '../services/gearAdvisor';

/** The verdict for a step with what the app knows now; recomputed when the plan, the kit or the bank changes. */
export function useReadinessVerdict(step: Step): { verdict: ReadinessVerdict; combat: CombatReadiness | null } {
  const plan = useReadinessEngine().plan(step, { ahead: 0 });
  const { state, owned, gear } = useBridge();
  const view = useCombatPlan(step);
  const connected = state === 'online';
  return useMemo(() => {
    const food = new Set((step.itemsRequired ?? []).filter((i) => typeof i.heals === 'number').flatMap((i) => [i.nameEn, ...(i.anyOf ?? [])]).map((n) => n.toLowerCase()));
    const isFood = (n: string) => food.has(n.toLowerCase()) || healsOf(n) !== null;
    const combat = combatReadiness(step, view, gear, owned?.bankSeen === true);
    const w = gear?.equipment ? equippedBySlot(gear, gearData).weapon : undefined;
    const worn = w ? { weapon: w.name, twoHanded: Boolean(w.piece?.twoHanded) } : null;
    return { verdict: readinessVerdict({ plan, connected, owned, isFood, combat, worn }), combat };
  }, [step, plan, view, gear, owned, connected]);
}

const ORDER: ReasonGroup[] = ['access', 'equipment', 'safety', 'unknown', 'optional'];
const MARK = { ok: '✓', bank: '↗', missing: '!', unknown: '○', caution: '⚠' } as const;

export function ReadinessVerdictCard({ step }: { step: Step }) {
  const { verdict: v, combat } = useReadinessVerdict(step);
  const groups = ORDER.map((g) => ({ g, rows: v.reasons.filter((r) => r.group === g) })).filter((x) => x.rows.length);
  return (
    <section className={`readiness-verdict is-${v.level.toLowerCase()}`} aria-label="Readiness">
      <p className="verdict-head" role="status">
        <span className="verdict-pill">{v.label}</span>
        <span className="verdict-line">{v.headline}</span>
      </p>
      {combat?.variant && <p className="small verdict-variant">{combat.variant}</p>}
      <p className="small muted verdict-bank">{v.bank.text}</p>
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

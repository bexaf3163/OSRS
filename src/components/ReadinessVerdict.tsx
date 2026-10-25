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
import { ownedFood } from '../lib/combatPlan';
import { estimateStepFights, fightLine, stepFightNames } from '../lib/fightEstimate';
import { COMBAT_FOES, foeLabel } from '../lib/combatEstimate';
import { equippedBySlot, gearData } from '../services/gearAdvisor';

/** The verdict for a step with what the app knows now; recomputed when the plan, the kit or the bank changes. */
export function useReadinessVerdict(step: Step): { verdict: ReadinessVerdict; combat: CombatReadiness | null } {
  const plan = useReadinessEngine().plan(step, { ahead: 0 });
  const { state, owned, gear, stats } = useBridge();
  const view = useCombatPlan(step);
  const connected = state === 'online';
  return useMemo(() => {
    const food = new Set((step.itemsRequired ?? []).filter((i) => typeof i.heals === 'number').flatMap((i) => [i.nameEn, ...(i.anyOf ?? [])]).map((n) => n.toLowerCase()));
    const isFood = (n: string) => food.has(n.toLowerCase()) || healsOf(n) !== null;
    const combat = combatReadiness(step, view, gear, owned?.bankSeen === true);
    const w = gear?.equipment ? equippedBySlot(gear, gearData).weapon : undefined;
    const worn = w ? { weapon: w.name, twoHanded: Boolean(w.piece?.twoHanded) } : null;
    // A quest fight: one fight with the kit worn now, and the step's food carried, counted by healing.
    const fights = estimateStepFights(step, stats as Partial<Record<string, number>> | null, gear)
      .map((f) => ({ line: fightLine(f), foodHigh: f.food.high, foodMid: f.food.mid, foodName: f.foodName, foe: foeLabel(f.foe), name: f.foe.name }));
    const fightNames = stepFightNames(step).map((name) => ({ name, known: COMBAT_FOES.some((f) => f.name === name) }));
    const carriedFood = ownedFood(step, owned)?.carriedEq ?? null;
    return { verdict: readinessVerdict({ plan, connected, owned, isFood, combat, worn, fights, fightNames, carriedFood }), combat };
  }, [step, plan, view, gear, owned, connected, stats]);
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

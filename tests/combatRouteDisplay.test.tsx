import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CombatRoute } from '../src/components/CombatRoute';
import type { CombatPlanEntry } from '../src/playerStateContext';
import { evaluatePlans } from '../src/lib/combatRoute/plans';
import { selectPlan } from '../src/lib/combatRoute/selection';
import { planInput } from './combatRoute/fixture';

const view = vi.hoisted(() => ({ entry: null as CombatPlanEntry | null }));
vi.mock('../src/playerStateContext', () => ({ usePlayerState: () => ({ combatPlans: { 'S4-03': view.entry }, choosePlan: vi.fn() }) }));

describe('compact combat comparison economics', () => {
  it.each([-500, 0, 500, null])('shows net %s rather than gross drops, inside the existing folded comparison', net => {
    const input = planInput();
    const report = evaluatePlans(input)!;
    report.plans = report.plans.map(p => ({ ...p, net, income: { ...p.income, net: 999999 } }));
    view.entry = { report, selection: selectPlan(report, undefined, { inProgress: false }), lastKnown: false };
    const html = renderToStaticMarkup(<CombatRoute step={input.step} />);
    const figures = [...html.matchAll(/<div class="cpr-figs small"[^>]*>(.*?)<\/div>/g)].map(m => m[1]);
    expect(figures.length).toBeGreaterThan(1);
    expect(figures.length).toBeLessThanOrEqual(4);
    for (const row of figures) {
      expect(row).toContain(net === null ? 'Not priced' : `${net > 0 ? '+' : ''}${net} gp net`);
      expect(row).not.toContain('999999');
      expect(row).toContain('consumed potions and needed armour');
    }
    expect(html).not.toMatch(/<details[^>]*\sopen/);
  });
});

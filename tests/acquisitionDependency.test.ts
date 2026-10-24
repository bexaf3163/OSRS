// T05: a step that exists to acquire items is met for the steps after it when the game confirms the items are owned: the Anti-dragon shield
// already worn does not block Elvarg because "Get the Anti-dragon shield" was never ticked. Positive only, and never from a shared name.
import { describe, expect, it } from 'vitest';
import { allSteps, stepById } from '../src/data';
import { blockersOf, dependencyFacts } from '../src/lib/next-step';
import { emptyProgress, withStep } from '../src/lib/progress';
import type { Progress } from '../src/types';

const elvarg = stepById.get('S5-08')!;
const ned = stepById.get('S5-07')!;
/** Everything before the step done, except the ones left open. */
const before = (id: string, open: string[]): Progress => {
  let p = emptyProgress();
  for (const s of allSteps) { if (s.id === id) break; if (!open.includes(s.id)) p = withStep(p, s.id, 'done'); }
  return p;
};
const facts = (owned: Record<string, number | null>) => dependencyFacts(allSteps, null, () => undefined, (n) => (n in owned ? owned[n] : null));

describe('equivalent acquisition: owning the items meets the acquisition step', () => {
  it('the shield owned (here worn) unblocks Elvarg while S5-02 is unticked', () => {
    const p = before('S5-08', ['S5-02']);
    expect(blockersOf(elvarg, p, 99, facts({}))?.steps).toContain('S5-02');
    expect(blockersOf(elvarg, p, 99, facts({ 'Anti-dragon shield': 1 }))?.steps ?? []).not.toContain('S5-02');
  });

  it('an unread or absent item proves nothing and does not revoke a done mark', () => {
    const open = before('S5-08', ['S5-02']);
    expect(blockersOf(elvarg, open, 99, facts({ 'Anti-dragon shield': 0 }))?.steps).toContain('S5-02');
    const done = before('S5-08', []);
    expect(blockersOf(elvarg, done, 99, facts({ 'Anti-dragon shield': 0 }))?.steps ?? []).not.toContain('S5-02');
  });

  it('the map pieces share one name: owning "Map part" never proves a particular piece; the whole Crandor map does', () => {
    const p = before('S5-07', ['S5-03', 'S5-04', 'S5-05']);
    expect(blockersOf(ned, p, 99, facts({ 'Map part': 3 }))?.steps).toEqual(expect.arrayContaining(['S5-03', 'S5-04', 'S5-05']));
    expect(blockersOf(ned, p, 99, facts({ 'Crandor map': 1 }))?.steps ?? []).not.toEqual(expect.arrayContaining(['S5-03']));
  });

  it('a multi-item purchase is met only when every item is owned', () => {
    const consumer = stepById.get('S5-06')!;
    const p = before('S5-06', ['S4-05']);
    const all = Object.fromEntries((stepById.get('S4-05')!.inGame!.completionTrigger!.items ?? []).map((it) => [it.names[0], it.count ?? 1]));
    expect(blockersOf(consumer, p, 99, facts(all))?.steps ?? []).not.toContain('S4-05');
    expect(blockersOf(consumer, p, 99, facts({ ...all, Plank: 2 }))?.steps).toContain('S4-05');
  });
});

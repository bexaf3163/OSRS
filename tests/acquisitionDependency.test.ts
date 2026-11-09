// T05: a step that exists to acquire items is met for the steps after it when the game confirms the items are owned: Elvarg's
// head already in the bank does not block the finale because the slaying step was never ticked. Positive only, and never from a shared name.
import { describe, expect, it } from 'vitest';
import { allSteps, stepById } from '../src/data';
import { blockersOf, dependencyFacts } from '../src/domain/quests/next-step';
import { emptyProgress, withStep } from '../src/domain/persistence/progress';
import type { Progress } from '../src/types';

const finale = stepById.get('S5-09')!;
const ned = stepById.get('S5-07')!;
/** Everything before the step done, except the ones left open. */
const before = (id: string, open: string[]): Progress => {
  let p = emptyProgress();
  for (const s of allSteps) { if (s.id === id) break; if (!open.includes(s.id)) p = withStep(p, s.id, 'done'); }
  return p;
};
const facts = (owned: Record<string, number | null>) => dependencyFacts(allSteps, null, () => undefined, (n) => (n in owned ? owned[n] : null));

describe('equivalent acquisition: owning the items meets the acquisition step', () => {
  it('the head owned unblocks the finale while S5-08 is unticked', () => {
    const p = before('S5-09', ['S5-08']);
    expect(blockersOf(finale, p, 99, facts({}))?.steps).toContain('S5-08');
    expect(blockersOf(finale, p, 99, facts({ "Elvarg's head": 1 }))?.steps ?? []).not.toContain('S5-08');
  });

  it('an unread or absent item proves nothing and does not revoke a done mark', () => {
    const open = before('S5-09', ['S5-08']);
    expect(blockersOf(finale, open, 99, facts({ "Elvarg's head": 0 }))?.steps).toContain('S5-08');
    const done = before('S5-09', []);
    expect(blockersOf(finale, done, 99, facts({ "Elvarg's head": 0 }))?.steps ?? []).not.toContain('S5-08');
  });

  it('the map pieces share one name: owning "Map part" never proves a particular piece; the whole Crandor map does', () => {
    const p = before('S5-07', ['S5-03', 'S5-04', 'S5-05']);
    expect(blockersOf(ned, p, 99, facts({ 'Map part': 3 }))?.steps).toEqual(expect.arrayContaining(['S5-03', 'S5-04', 'S5-05']));
    expect(blockersOf(ned, p, 99, facts({ 'Crandor map': 1 }))?.steps ?? []).not.toEqual(expect.arrayContaining(['S5-03']));
  });
});

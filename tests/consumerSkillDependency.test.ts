import { describe, expect, it } from 'vitest';
import { allSteps, stepById } from '../src/data';
import { dependencyFacts, blockersOf, openAfter } from '../src/lib/next-step';
import { emptyProgress, withStep } from '../src/lib/progress';
import { contextOf } from '../src/lib/readiness';
import { createReadinessEngine } from '../src/lib/readinessEngine';
import type { Step } from '../src/types';

const producer = stepById.get('S8-04')!;
const city = stepById.get('S9-01')!;
const animal = stepById.get('S8-05')!;
const facts = (levels: Record<string, number | undefined>, steps: Step[] = allSteps) => dependencyFacts(steps, null, s => levels[s]);
const progress = () => {
  let p = emptyProgress();
  for (const step of allSteps) { if (step.id === city.id) break; p = withStep(p, step.id, step.id === producer.id ? 'skipped' : 'done'); }
  return p;
};

describe('a consumer uses its actual skill subset without completing the producer', () => {
  it('Lost City does not demand unrelated Ranged, Slayer or Cooking training once its entry skills are known', () => {
    const levels = { crafting: 31, woodcutting: 36, ranged: 1, slayer: 1, cooking: 1 };
    const p = progress();
    const fact = facts(levels);
    expect(blockersOf(city, p, 200, fact)).toBeNull();
    expect(fact(producer.id)).toBeUndefined();
    const engine = createReadinessEngine(contextOf({ step: city, steps: allSteps, progress: p, qp: 200, mode: 'members', stats: levels, owned: null, gear: null }));
    expect(engine.readiness(city).problems.some(r => r.kind === 'step' && r.label.includes(producer.id))).toBe(false);
    expect(engine.chain(city).some(link => link.step.id === producer.id)).toBe(false);
    expect(openAfter(allSteps, p, 'S8-06', 200, fact)?.id).toBe(city.id);
    expect(p.steps[producer.id]).toBe('skipped');
  });

  it('Animal Magnetism and Lost City require different known subsets of the same producer', () => {
    const fact = facts({ ranged: 30, slayer: 18, crafting: 19, woodcutting: 35, cooking: 1 });
    const p = progress(); delete p.steps[animal.id];
    expect(blockersOf(animal, p, 200, fact)).toBeNull();
    expect(blockersOf(city, p, 200, fact)?.steps).toContain(producer.id);
    expect(fact(producer.id)).toBeUndefined();
  });

  it.each([{ crafting: 30, woodcutting: 36 }, { crafting: 31 }, { crafting: 31, woodcutting: NaN }])('insufficient or unread consumer skills do not bypass the training step: %j', levels => {
    expect(blockersOf(city, progress(), 200, facts(levels))?.steps).toContain(producer.id);
  });

  it('does not replace an item/carryover producer with skill-only proof', () => {
    const carrying: Step = { ...producer, carryover: [{ item: 'Test stock', count: 1, forStep: city.id, where: 'bank', why: 'Required retained stock' }] };
    const list = allSteps.map(s => s.id === producer.id ? carrying : s);
    expect(blockersOf(city, progress(), 200, facts({ crafting: 31, woodcutting: 36 }, list))?.steps).toContain(producer.id);
  });

  it('a consumer without explicit overlapping skill requirements keeps its original dependency', () => {
    const unknown = { ...city, requirements: [] };
    expect(blockersOf(unknown, progress(), 200, facts({ crafting: 31, woodcutting: 36 }))?.steps).toContain(producer.id);
  });
  it('does not send a missing independent Magic level back to a producer that cannot train Magic', () => {
    const levels = { crafting: 31, woodcutting: 36, magic: 12, ranged: 1, slayer: 1, cooking: 1 };
    const fact = facts(levels);
    expect(fact(producer.id, city)).toBe(true);
    expect(fact(producer.id)).toBeUndefined();
    const engine = createReadinessEngine(contextOf({ step: city, steps: allSteps, progress: progress(), qp: 200, mode: 'members', stats: levels, owned: null, gear: null }));
    expect(engine.readiness(city).problems.some(req => req.stat?.skill === 'magic' && req.state === 'MISSING')).toBe(true);
    expect(engine.readiness(city).problems.some(req => req.kind === 'step' && req.label.includes(producer.id))).toBe(false);
  });

});

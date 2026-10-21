import { describe, expect, it } from 'vitest';
import { allSteps, stepById } from '../src/data';
import { emptyProgress } from '../src/lib/progress';
import { contextOf, readinessOf } from '../src/lib/readiness';
import { STAFFS } from '../src/lib/magicPlan';
import { nameKey } from '../src/lib/checklist';

describe('Magic training uses an owned elemental staff', () => {
  it.each(Object.values(STAFFS))('$name satisfies the staff requirement from the bank', staff => {
    const step = stepById.get('S2-04')!;
    const names = ['Staff', ...Object.values(STAFFS).map(s => s.name)];
    const owned = { bankSeen: true, items: new Map(names.map(name => [nameKey(name), { name, carried: 0, noted: 0, bank: name === staff.name ? 1 : 0 }])) };
    const result = readinessOf(step, contextOf({ step, steps: allSteps, progress: emptyProgress(), qp: 100, mode: 'f2p', stats: { magic: 10 }, gear: null, owned }));
    expect(result.requirements.find(r => r.item === 'Staff')?.state).toBe('BANK');
    expect(result.requirements.find(r => r.item === 'Staff')?.detail).not.toMatch(/Buy /);
  });

  it.each([true, false])('staff absence needs complete per-alternative evidence: reported=%s', reported => {
    const step = stepById.get('S2-04')!;
    const names = ['Staff', ...Object.values(STAFFS).map(s => s.name)];
    const owned = { bankSeen: true, items: new Map(names.map(name => [nameKey(name), { name, carried: 0, noted: 0, bank: name === 'Staff of fire' && !reported ? undefined : 0 }])) };
    const result = readinessOf(step, contextOf({ step, steps: allSteps, progress: emptyProgress(), qp: 100, mode: 'f2p', stats: { magic: 10 }, gear: null, owned }));
    expect(result.requirements.find(r => r.item === 'Staff')?.state).toBe(reported ? 'MISSING' : 'UNKNOWN');
  });
});

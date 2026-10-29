import { describe, expect, it } from 'vitest';
import { stepById } from '../src/data';
import { meleeHintApplies } from '../src/lib/gearAdvice';

describe('melee hints belong to their training context', () => {
  it.each(['S2-04', 'S6-01', 'S6-02', 'S6-03', 'S6-04', 'S8-04', 'S1-08'])('%s does not borrow a future melee upgrade during non-melee training', id => {
    expect(meleeHintApplies(stepById.get(id)!)).toBe(false);
  });
  it.each(['S1-13', 'S3-08', 'S4-03'])('%s keeps its existing melee or future-fight hint behavior', id => {
    expect(meleeHintApplies(stepById.get(id)!)).toBe(true);
  });
  it('a selected ranged method also suppresses a stale melee hint', () => {
    const step = stepById.get('S3-08')!;
    expect(meleeHintApplies({ ...step, followsMethod: 'ranged' })).toBe(false);
  });
});

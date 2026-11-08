import { describe, expect, it } from 'vitest';
import { allSteps } from '../../data';
import { emptyProgress } from '../persistence/progress';
import { decisionWatch, WATCH_MAX } from './watch';

describe('the items the plugin counts for the planner', () => {
  it('lists each open step item once within the plugin limit and drops closed steps', () => {
    const f2p = allSteps.filter(step => !step.membersOnly);
    const open = decisionWatch(f2p, emptyProgress());
    expect(new Set(open).size).toBe(open.length);
    expect(open.length).toBeLessThanOrEqual(WATCH_MAX);
    const step = f2p.find(s => s.itemsRequired?.length)!;
    expect(open).toContain(step.itemsRequired![0].nameEn);
    const closedAll = { ...emptyProgress(), steps: Object.fromEntries(f2p.map(s => [s.id, 'done' as const])) };
    expect(decisionWatch(f2p, closedAll)).toEqual([]);
  });
});

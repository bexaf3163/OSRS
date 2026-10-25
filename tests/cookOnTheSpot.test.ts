// Cook on the spot (2.80): a gathering method whose catches a processing recipe takes, at a station beside the spot, trains both skills at once
// (skillingRates.alongRate). The step with both goals takes it when it reaches both goals sooner (methodPick), and says so in one line.

import { describe, expect, it } from 'vitest';
import { alongRate, gatherRate } from '../src/lib/skillingRates';
import { pickMethods } from '../src/lib/methodPick';
import { withTrainingMethod } from '../src/lib/methodStep';
import { trainingMethods, type TrainingMethod } from '../src/lib/trainingRouter';
import { buildPlayerState } from '../src/lib/playerState';
import { emptyProgress } from '../src/lib/progress';
import { nameKey } from '../src/lib/checklist';
import { stepById } from '../src/data';
import { market } from './funding/market';

const fly = trainingMethods.find((m) => m.id === 'fi-fly') as TrainingMethod;
const stateOf = (fishing: number, cooking: number) => buildPlayerState({
  mode: 'f2p', stats: { fishing, cooking } as never, progress: emptyProgress(), gear: null, questsDone: [], connected: true,
  owned: { bankSeen: true, items: new Map([['Fly fishing rod', 1], ['Feather', 1000]].map(([n, q]) => [nameKey(n as string), { name: n as string, carried: q as number, noted: 0, bank: 0 }])) } as never,
});
const s602 = stepById.get('S6-02')!;
const pickFor = (fishing: number, cooking: number) => pickMethods([s602], stateOf(fishing, cooking), 'f2p', 'chill', 'balanced', { prices: market() })['S6-02'];

describe('fishing and cooking the same catches at the fire beside the spot', () => {
  it('the Barbarian Village fly spot has the fire beside it: both skills train, fishing a little slower than fishing alone', () => {
    const along = alongRate(fly, 'fishing', 'cooking', stateOf(30, 20), { prices: market() })!;
    const alone = gatherRate(fly, 'fishing', stateOf(30, 20), { prices: market() })!;
    expect(along.station.label).toBe('Barbarian Village fire');
    expect(along.gather[1]).toBeLessThan(alone.xph[1]);
    expect(along.process[0]).toBeGreaterThan(0);
  });
  it('only what the cooking level allows is cooked: salmon from 25 (the wiki recipe), trout from 15', () => {
    expect(alongRate(fly, 'fishing', 'cooking', stateOf(35, 20), { prices: market() })!.products).toEqual(['Trout']);
    expect(alongRate(fly, 'fishing', 'cooking', stateOf(35, 30), { prices: market() })!.products).toEqual(['Salmon', 'Trout']);
    expect(alongRate(fly, 'fishing', 'cooking', stateOf(30, 10), { prices: market() })).toBeNull();
  });
  it('S6-02 (Fishing 50 and Cooking 50) takes it while it reaches both goals sooner, and the step says it in one line', () => {
    const pick = pickFor(30, 20);
    expect(typeof pick === 'string' ? null : pick.along?.station.label).toBe('Barbarian Village fire');
    const step = withTrainingMethod(s602, pick);
    expect(step.quickSteps?.at(-1)).toMatch(/^Cook the trout on the Barbarian Village fire beside the spot, then (drop|bank) them/);
    expect(step.inGame?.objectNames).toContain('Fire');
  });
  it('not when cooking alone is faster later (wine from Cooking 35): Fishing 45 / Cooking 40 just fishes', () => {
    const pick = pickFor(45, 40);
    expect(typeof pick === 'string' ? undefined : pick.along).toBeUndefined();
  });
});

// Money and Skills time the same processing work with one model (2.79.1): a money method that makes a registry product at a registry station is
// personalised by processingRates.processPace; anything else keeps the published pace.

import { describe, expect, it } from 'vitest';
import { processPersonaliser } from '../../src/lib/funding/processAdapter';
import { methodById } from '../../src/lib/funding/methods';
import { evaluate } from '../../src/lib/funding/evaluate';
import { processPace } from '../../src/lib/processingRates';
import { buildPlayerState } from '../../src/lib/playerState';
import { emptyProgress } from '../../src/lib/progress';
import { ctxOf, fakePrices, fakeSnap } from './helpers';

const stateOf = (levels: Record<string, number>) =>
  buildPlayerState({ mode: 'f2p', stats: null, progress: { ...emptyProgress(), levels }, gear: null, questsDone: null, connected: false, owned: null });
const steel = methodById('smelt-steel-bars')!;

describe('a money method at a registry station is timed by the processing engine', () => {
  it('steel bars at the Edgeville furnace: the recipe\'s ticks, at the station the method names', () => {
    const p = processPersonaliser(stateOf({ smithing: 40 }))(steel)!;
    expect(p.basis).toMatch(/Edgeville furnace/);
    expect(p.secondsPerUnit).toEqual(processPace('Steel bar', steel.spot!, stateOf({ smithing: 40 }))!.seconds);
    // The wiki recipe: 4 ticks a bar at the Make-X pace.
    expect(p.secondsPerUnit.fast).toBeCloseTo(2.4, 6);
  });
  it('below the recipe\'s level, or with the level unknown, there is no model: the published pace applies', () => {
    expect(processPersonaliser(stateOf({ smithing: 20 }))(steel)).toBeNull();
    expect(processPersonaliser(stateOf({}))(steel)).toBeNull();
  });
  it('a product the registry does not make (pie shells, jugs of water) keeps the published pace', () => {
    expect(processPersonaliser(stateOf({ smithing: 99, cooking: 99, crafting: 99 }))(methodById('pie-shells')!)).toBeNull();
    expect(processPersonaliser(stateOf({ smithing: 99, cooking: 99, crafting: 99 }))(methodById('fill-jugs-falador')!)).toBeNull();
  });
  it('an iron bar\'s 50% chance doubles the time a bar takes', () => {
    const near = { x: 3110, y: 3499, plane: 0 };
    expect(processPace('Iron bar', near, stateOf({ smithing: 40 }))!.seconds.fast).toBeCloseTo(2 * 2.4, 6);
  });
  it('the evaluator takes the engine\'s pace and says so', () => {
    const state = stateOf({ smithing: 40 });
    const snap = fakeSnap({ levels: { smithing: 40 } });
    const prices = fakePrices({ 'Iron ore': { buy: 100, sell: 95 }, Coal: { buy: 150, sell: 145 }, 'Steel bar': { buy: 500, sell: 480 } });
    const e = evaluate(steel, ctxOf({ prices, snap, personalise: processPersonaliser(state) }));
    expect(e.notes[0]).toBe("Pace from the wiki's recipe for your level at the Edgeville furnace");
  });
});

// Money and Skills time the same gathering work with one model (hardening, 2.78.1): a money method at a spot of the gathering registry is personalised
// by skillingRates.gatherPace, the tool the evaluator plans included; a method the registry has no spot for keeps the published pace.

import { describe, expect, it } from 'vitest';
import { gatherPersonaliser } from '../../src/lib/funding/gatherAdapter';
import { methodById } from '../../src/lib/funding/methods';
import { evaluate } from '../../src/lib/funding/evaluate';
import { gatherPace } from '../../src/lib/skillingRates';
import { buildPlayerState } from '../../src/lib/playerState';
import { emptyProgress } from '../../src/lib/progress';
import { nameKey, type OwnedItem } from '../../src/lib/checklist';
import { ctxOf, fakePrices, fakeSnap } from './helpers';

const stateOf = (levels: Record<string, number>, bank: Record<string, number> | null) => buildPlayerState({
  mode: 'f2p', stats: null, progress: { ...emptyProgress(), levels }, gear: null, questsDone: null, connected: true,
  owned: { bankSeen: bank !== null, items: new Map(Object.entries(bank ?? {}).map(([name, n]) => [nameKey(name), { name, carried: 0, noted: 0, bank: n } as OwnedItem])) },
});
const yew = methodById('chop-yew-edgeville')!;

describe('a money method at a registry spot is timed by the gathering engine', () => {
  it('the pace follows the level and the tool the evaluation plans, as the Skills page would time them', () => {
    const at = (wc: number, tool: string) => gatherPersonaliser(stateOf({ woodcutting: wc, attack: 1 }, { [tool]: 1 }))(yew, tool)!;
    expect(at(90, 'Rune axe').secondsPerUnit.typical).toBeLessThan(at(60, 'Rune axe').secondsPerUnit.typical);
    expect(at(60, 'Rune axe').secondsPerUnit.typical).toBeLessThan(at(60, 'Bronze axe').secondsPerUnit.typical);
    expect(at(60, 'Rune axe').basis).toMatch(/Rune axe/);
    // The same function the Skills ranking reads, at the same spot.
    expect(at(60, 'Rune axe').secondsPerUnit).toEqual(gatherPace('Yew logs', yew.spot!, stateOf({ woodcutting: 60, attack: 1 }, { 'Rune axe': 1 }), 'Rune axe')!.seconds);
  });
  it('a tool whose ownership is unknown leaves the pace unknown: the published pace applies', () => {
    expect(gatherPersonaliser(stateOf({ woodcutting: 60 }, null))(yew, null)).toBeNull();
  });
  it('a place the registry has no spot for (inside the Dwarven Mine) keeps the published pace', () => {
    expect(gatherPersonaliser(stateOf({ mining: 60 }, { 'Rune pickaxe': 1 }))(methodById('mine-iron-dwarven')!, 'Rune pickaxe')).toBeNull();
  });
  it('a spot whose number of trees is unknown is not timed as endless (the one oak east of Draynor Bank)', () => {
    expect(gatherPersonaliser(stateOf({ woodcutting: 60 }, { 'Rune axe': 1 }))(methodById('chop-oak-draynor')!, 'Rune axe')).toBeNull();
  });
  it('the evaluator takes the engine\'s pace and says so', () => {
    const state = stateOf({ woodcutting: 70, attack: 40 }, { 'Rune axe': 1 });
    const snap = fakeSnap({ levels: { woodcutting: 70, attack: 40 }, items: { 'Rune axe': 1 } });
    const prices = fakePrices({ 'Yew logs': { buy: 300, sell: 290 }, 'Rune axe': { buy: 12000, sell: 11500 } });
    const e = evaluate(yew, ctxOf({ prices, snap, personalise: gatherPersonaliser(state) }));
    expect(e.notes).toContain("Pace from the wiki's success chance for your level with a Rune axe");
    expect(e.notes.join(' ')).not.toMatch(/scaled to/);
    // Without the engine the same evaluation scales the published pace by a rule.
    expect(evaluate(yew, ctxOf({ prices, snap })).notes[0]).toBe('Pace from the wiki guide, scaled');
  });
});

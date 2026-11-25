import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fasterBehindQuests, withHourlyCoins } from './trainingGoal';
import { trainingMethods } from './trainingRouter';
import { supplyPrice } from '../market/itemPrice';
import { fakePrices } from '../../../tests/funding/helpers';

const prices = fakePrices(JSON.parse(readFileSync('tests/fixtures/gePrices.json', 'utf8')).prices);
const foundry = trainingMethods.find((m) => m.id === 'sm-foundry-30')!;

describe('an activity without a rate model takes its coins from what it uses and makes in an hour', () => {
  it('Giants Foundry pays its reward less the bars it melts', () => {
    const bars = 224 * (supplyPrice('Iron bar', prices, 'members')! + supplyPrice('Steel bar', prices, 'members')!);
    expect(withHourlyCoins(foundry, prices, 'members').marketNetPerHour).toBe(Math.round(267840 - bars));
  });

  it('names the cost after what it uses and its fees', () => {
    expect(withHourlyCoins(foundry, prices, 'members').costName).toBe('iron bar, steel bar');
    expect(withHourlyCoins({ ...foundry, perHour: { coins: -500 } }, prices, 'members').costName).toBe('fees');
  });
  it('an unknown price leaves the coins uncounted', () => {
    const m = { ...foundry, perHour: { uses: [{ name: 'No such item', qty: 1 }] } };
    expect(withHourlyCoins(m, prices, 'members').marketNetPerHour).toBeUndefined();
  });
});

describe('a clearly faster method behind quests alone', () => {
  const view = (id: string, xph: number, missing: { kind: string; label: string; state: string }[] = []) =>
    ({ method: { ...trainingMethods[0], id, name: id, xph: [xph, xph] as [number, number] }, status: missing.length ? 'LOCKED' : 'READY', missing });
  const open = view('open', 20_000);
  const quest = { kind: 'quest', label: 'Children of the Sun', state: 'MISSING' };

  it('names the quests when it is at least a quarter faster', () => {
    expect(fasterBehindQuests([open, view('crab', 50_000, [quest])], open)).toMatchObject({ method: { id: 'crab' }, quests: ['Children of the Sun'] });
  });

  it('stays silent for a small gain or a missing skill level', () => {
    expect(fasterBehindQuests([open, view('crab', 22_000, [quest])], open)).toBeNull();
    expect(fasterBehindQuests([open, view('nagua', 60_000, [quest, { kind: 'skill', label: 'Slayer 48', state: 'MISSING' }])], open)).toBeNull();
  });
});

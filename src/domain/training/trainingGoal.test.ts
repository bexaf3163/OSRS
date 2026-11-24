import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { withHourlyCoins } from './trainingGoal';
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
  it('an unknown price leaves the coins uncounted', () => {
    const m = { ...foundry, perHour: { uses: [{ name: 'No such item', qty: 1 }] } };
    expect(withHourlyCoins(m, prices, 'members').marketNetPerHour).toBeUndefined();
  });
});

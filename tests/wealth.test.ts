import { describe, expect, it } from 'vitest';
import { moneyGoalProgress, wealthOf } from '../src/lib/wealth';
import { parseGear } from '../src/services/runeliteBridge';
import { allSteps } from '../src/data';

const gear = (coins: number, bankCoins: number | null, carriedValue: number | null, bankValue: number | null) =>
  ({ equipment: [], inventory: [], coins, bankCoins, carriedValue, bankValue });

describe('money: exact coins apart from the item estimate (§75–77)', () => {
  it('coins and items are not mixed; the total — only when everything is known', () => {
    const w = wealthOf(gear(420, 10_250, 1_400, 17_000))!;
    expect(w.cash).toEqual({ bag: 420, bank: 10_250, total: 10_670 });
    expect(w.items.total).toBe(18_400);
    expect(w.estimatedTotal).toBe(29_070);
    const noBank = wealthOf(gear(420, null, 1_400, null))!;
    expect(noBank).toMatchObject({ bankUnknown: true, estimatedTotal: null, cash: { total: null } });
  });

  it('an item moved to the bank — wealth did not grow (no double counting)', () => {
    const before = wealthOf(gear(0, 5_000, 28 * 150, 0))!;
    const after = wealthOf(gear(0, 5_000, 0, 28 * 150))!;
    expect(after.estimatedTotal).toBe(before.estimatedTotal);
  });

  it('earning step goal: coins against the goal, selling the loot — separately and with "~"', () => {
    const p = moneyGoalProgress(20_000, wealthOf(gear(300, 12_000, 4_200, 5_000)))!;
    expect(p).toMatchObject({ cash: 12_300, missingCash: 7_700, itemsValue: 9_200, withItems: 21_500, done: false, doneIfSold: true });
    expect(moneyGoalProgress(20_000, wealthOf(gear(0, 20_000, 0, 0)))!.done).toBe(true);
    // The bank was not opened — we do not invent progress.
    expect(moneyGoalProgress(20_000, wealthOf(gear(300, null, 0, null)))).toBeNull();
  });

  it('an old plugin without an estimate — no estimate, coins present', () => {
    const g = parseGear({ equipment: [], inventory: [], coins: 5, bankCoins: 100 })!;
    expect(wealthOf(g)).toMatchObject({ cash: { total: 105 }, items: { total: null } });
    const g2 = parseGear({ equipment: [], inventory: [], coins: 5, bankCoins: 100, carriedValue: 50, bankValue: 7 })!;
    expect(wealthOf(g2)!.estimatedTotal).toBe(162);
  });

  it('the earning goals of steps match "Done when"', () => {
    expect(allSteps.filter((s) => s.moneyGoal).map((s) => [s.id, s.moneyGoal])).toEqual([['S1-13', 20_000], ['S3-06', 2_500]]);
  });
});

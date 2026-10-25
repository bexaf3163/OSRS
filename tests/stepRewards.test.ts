// The reward text read one way for every feature: the coin tip of the upgrade prompt finds its step by the reward, not by a step code.

import { describe, expect, it } from 'vitest';
import { allSteps } from '../src/data';
import { coinRewardAhead, rewardCoins } from '../src/lib/stepRewards';

describe('step rewards', () => {
  it('reads the coins of a reward, the total before a breakdown', () => {
    expect(rewardCoins('10,000 Coins (2,000 + 3,000 + 5,000), boots and 4 emotes.')).toBe(10000);
    expect(rewardCoins('3 QP, 2,500 Coins.')).toBe(2500);
    expect(rewardCoins('1 QP, 150 XP Crafting.')).toBe(0);
    expect(rewardCoins(undefined)).toBe(0);
  });

  it('the coin tip is the open step of the stage that pays the most, for any stage: the Stronghold in stage 1, the next one once it is done', () => {
    expect(coinRewardAhead(allSteps, 1, () => false)?.step.id).toBe('S1-09');
    expect(coinRewardAhead(allSteps, 1, () => false)?.coins).toBe(10000);
    const s3 = coinRewardAhead(allSteps, 3, () => false)!;
    expect(s3.coins).toBe(2500);
    // Done steps drop out; small rewards are not worth a tip.
    expect(coinRewardAhead(allSteps, 3, (id) => id === s3.step.id)?.coins).toBe(2000);
    expect(coinRewardAhead(allSteps, 1, (id) => id === 'S1-09')).toBeNull();
  });
});

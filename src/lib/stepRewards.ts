// What a step's reward text gives, read one way for every feature. The numbers are written with comma thousands ("10,000 Coins"); check-data keeps
// the route so, since a space ("2 500") would be read as 500.

import type { Step } from '../types';

const num = (s: string) => Number(s.replace(/,/g, ''));

/** The coins a reward gives: "10,000 Coins (2,000 + 3,000 + 5,000)" is 10,000. */
export function rewardCoins(reward: string | undefined): number {
  const m = /([\d,]+) Coins\b/i.exec(reward ?? '');
  return m ? num(m[1]) : 0;
}

/** A reward this size is worth a detour for the money an upgrade lacks. */
export const COIN_TIP_MIN = 1000;

/** The open step of a stage that pays the most coins (at least COIN_TIP_MIN), or null. */
export function coinRewardAhead(steps: readonly Step[], stage: number, closed: (id: string) => boolean): { step: Step; coins: number } | null {
  let best: { step: Step; coins: number } | null = null;
  for (const s of steps) {
    if (s.stage !== stage || closed(s.id)) continue;
    const coins = rewardCoins(typeof s.reward === 'string' ? s.reward : undefined);
    if (coins >= COIN_TIP_MIN && (!best || coins > best.coins)) best = { step: s, coins };
  }
  return best;
}

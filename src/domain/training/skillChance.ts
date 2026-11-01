// The skilling success function of the OSRS Wiki ("Skilling success rate"): every gathering roll in the game uses it, with the action's low and high
// values from its {{Skilling success chart}} (data/skilling.json). One formula for every tree, rock and fishing spot, members ones included.

/** The chance one roll succeeds at this level: (1 + floor(low·(99−L)/98 + high·(L−1)/98 + 0.5)) / 256, the level clamped to 1–99, the chance to 0–1. */
export function skillChance(low: number, high: number, level: number): number {
  const l = Math.min(99, Math.max(1, level));
  return Math.min(1, Math.max(0, (1 + Math.floor((low * (99 - l)) / 98 + (high * (l - 1)) / 98 + 0.5)) / 256));
}

/**
 * A cascade (a fishing spot with two fish): the best catch the level allows is rolled first, the next only if it failed. The chance of each catch per
 * roll, in the given order; a catch above the level has 0.
 */
export function cascade(lines: readonly { low: number; high: number; level: number }[], level: number): number[] {
  let miss = 1;
  return lines.map((l) => {
    if (level < l.level) return 0;
    const p = skillChance(l.low, l.high, level);
    const got = miss * p;
    miss *= 1 - p;
    return got;
  });
}

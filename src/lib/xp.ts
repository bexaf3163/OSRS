// The standard OSRS XP formula. check-data compares it with the "How much XP is needed per level" table in src/data/xp.json.

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 99;

const table: number[] = [0, 0];
for (let level = 2, points = 0; level <= MAX_LEVEL; level++) {
  points += Math.floor(level - 1 + 300 * 2 ** ((level - 1) / 7));
  table[level] = Math.floor(points / 4);
}

export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return MIN_LEVEL;
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.floor(level)));
}

/** The XP at which a level begins. */
export function xpForLevel(level: number): number {
  return table[clampLevel(level)];
}

/** How much XP from the start of level `from` to the start of level `to`. */
export function xpBetween(from: number, to: number): number {
  return Math.max(0, xpForLevel(to) - xpForLevel(from));
}

/** The level by the amount of XP. */
export function levelForXp(xp: number): number {
  let level = MIN_LEVEL;
  while (level < MAX_LEVEL && table[level + 1] <= xp) level++;
  return level;
}

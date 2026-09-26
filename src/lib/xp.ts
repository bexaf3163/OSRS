// Стандартная формула опыта OSRS. check-data сверяет её с таблицей
// «Сколько опыта нужно до уровня» из гайда.

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

/** Опыт, с которого начинается уровень. */
export function xpForLevel(level: number): number {
  return table[clampLevel(level)];
}

/** Сколько опыта от начала уровня `from` до начала уровня `to`. */
export function xpBetween(from: number, to: number): number {
  return Math.max(0, xpForLevel(to) - xpForLevel(from));
}

/** Уровень по количеству опыта. */
export function levelForXp(xp: number): number {
  let level = MIN_LEVEL;
  while (level < MAX_LEVEL && table[level + 1] <= xp) level++;
  return level;
}

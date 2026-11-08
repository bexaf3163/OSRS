// The standard OSRS XP formula. check-data compares it with the "How much XP is needed per level" table in src/data/xp.json.

/** Levels by skill name; undefined means unknown. */
export type Levels = Readonly<Record<string, number | undefined>>;

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

/** A live exact XP value must also fit its independently reported real level. */
export function coherentSkillXp(xp: unknown, level?: number): xp is number {
  return typeof xp === 'number' && Number.isSafeInteger(xp) && xp >= 0 && xp <= 200_000_000
    && (level === undefined || (Number.isInteger(level) && level >= MIN_LEVEL && level <= MAX_LEVEL
      && xp >= xpForLevel(level) && (level === MAX_LEVEL || xp < xpForLevel(level + 1))));
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

/** The combat level by the game's formula; null means Attack, Strength or Defence is unknown. */
export function combatLevel(l: Levels): number | null {
  const { attack, strength, defence } = l;
  if (attack === undefined || strength === undefined || defence === undefined) return null;
  const hp = l.hitpoints ?? 10;
  const base = 0.25 * (defence + hp + Math.floor((l.prayer ?? 1) / 2));
  const melee = 0.325 * (attack + strength);
  const ranged = 0.325 * Math.floor(1.5 * (l.ranged ?? 1));
  const magic = 0.325 * Math.floor(1.5 * (l.magic ?? 1));
  return Math.floor(base + Math.max(melee, ranged, magic));
}

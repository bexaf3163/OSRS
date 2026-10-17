// Tool tiers. The route names a tool by its weakest tier ("Bronze pickaxe"); a better one does the same job, so any tier counts.
// No imports: the checklist, the player state and the bridge all read it.

/** Weakest first. */
export const PICKAXES = ['Bronze pickaxe', 'Iron pickaxe', 'Steel pickaxe', 'Black pickaxe', 'Mithril pickaxe', 'Adamant pickaxe', 'Rune pickaxe', 'Dragon pickaxe', 'Crystal pickaxe', 'Infernal pickaxe', '3rd age pickaxe', 'Gilded pickaxe'] as const;
export const AXES = ['Bronze axe', 'Iron axe', 'Steel axe', 'Black axe', 'Mithril axe', 'Adamant axe', 'Rune axe', 'Dragon axe', 'Crystal axe', 'Infernal axe', '3rd age axe', 'Gilded axe'] as const;

const key = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Every tier that does the job of this name, or null when the name is not a tool the route names by its weakest tier. */
export function toolFamilyOf(nameEn: string): readonly string[] | null {
  const k = key(nameEn);
  if (k === 'bronze pickaxe' || k === 'pickaxe') return PICKAXES;
  if (k === 'bronze axe' || k === 'axe') return AXES;
  return null;
}

/**
 * The level a tier needs to be used for its skill (OSRS Wiki, "Pickaxe" and "Axe"): a Rune pickaxe needs Mining 41. Wielding is another matter
 * (Attack); a tool in the bag is used by its skill level alone.
 */
const TIER_LEVEL: Record<string, number> = {
  bronze: 1, iron: 1, steel: 6, black: 11, mithril: 21, adamant: 31, rune: 41, gilded: 41, dragon: 61, infernal: 61, '3rd age': 61, crystal: 71,
};

/** What a pickaxe or axe tier needs: the skill and the level; null for anything else. */
export function toolUse(nameEn: string): { skill: 'mining' | 'woodcutting'; level: number } | null {
  const k = key(nameEn);
  const kind = k.endsWith(' pickaxe') ? 'pickaxe' : k.endsWith(' axe') ? 'axe' : null;
  if (!kind) return null;
  const level = TIER_LEVEL[k.slice(0, k.length - kind.length - 1)];
  return level === undefined ? null : { skill: kind === 'pickaxe' ? 'mining' : 'woodcutting', level };
}

/** Whether the player can use this tool for its skill; an unknown level counts as able (unknown is not missing). */
export function usableAt(nameEn: string, levelOf: (skill: string) => number | null): boolean {
  const u = toolUse(nameEn);
  if (!u) return true;
  const lv = levelOf(u.skill);
  return lv === null || lv >= u.level;
}

/** The other names that count in place of this one: the step's own list, else the tool family without the name itself. */
export function alternativesOf(nameEn: string, own?: readonly string[]): string[] {
  const names = own?.length ? own : toolFamilyOf(nameEn) ?? [];
  return names.filter((n) => key(n) !== key(nameEn));
}

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

/** The other names that count in place of this one: the step's own list, else the tool family without the name itself. */
export function alternativesOf(nameEn: string, own?: readonly string[]): string[] {
  const names = own?.length ? own : toolFamilyOf(nameEn) ?? [];
  return names.filter((n) => key(n) !== key(nameEn));
}

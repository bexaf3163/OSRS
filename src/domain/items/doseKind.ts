// Which items are potions counted in doses, and how many doses a name holds. Kept apart from doses.ts, with no imports, so the low-level modules
// (checklist.ts) can use it without an import cycle.

export interface DoseKind {
  /** "Strength potion". */
  base: string;
  /** Doses in the named potion: 4 for "Strength potion(4)". */
  per: number;
}

const SIZED = /^(.*\S)\s*\(([1-4])\)$/;
// Potions only: an Amulet of glory(4) or a Games necklace(8) holds charges, not doses, and two of them cannot be poured into one.
const POTION = /(potion|brew|restore|antipoison|antidote\+*|serum|balm|guthix rest|super (attack|strength|defence|energy|combat))$/i;

/** The potion and its doses, from the name; null for anything that is not a potion with a dose count. */
export function doseKind(name: string): DoseKind | null {
  const m = SIZED.exec(name.trim());
  if (!m || !POTION.test(m[1])) return null;
  return { base: m[1], per: Number(m[2]) };
}

export const doseName = (base: string, size: number): string => `${base}(${size})`;

/** The four sizes of the potion a name belongs to ("Strength potion(1)" … "(4)"); empty for anything else. */
export function doseNames(name: string): string[] {
  const k = doseKind(name);
  return k ? [1, 2, 3, 4].map((s) => doseName(k.base, s)) : [];
}

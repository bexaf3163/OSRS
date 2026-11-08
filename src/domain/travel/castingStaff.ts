// One casting loadout, using the existing equipment registry and eligibility rules.
import type { GearItem } from '../../services/runeliteBridge';
import { transportJson } from '../../data';
import { gearPieceByName } from '../items/gearRegistry';
import { canWear } from '../items/gearRequirements';
import { nameKey } from '../items/itemKey';

export interface RuneStaff { item: string; runes: string[]; members: boolean }
interface StaffInput {
  carried: readonly GearItem[] | null;
  worn?: readonly GearItem[] | null;
  members?: boolean | null;
  levels?: Readonly<Record<string, number | undefined>>;
}
const STAVES = transportJson.staves.list as readonly RuneStaff[];
const BY_NAME = new Map(STAVES.map(staff => [nameKey(staff.item), staff]));

export function stavesFor(rune: string, members?: boolean | null): string[] {
  return STAVES.filter(staff => staff.runes.includes(rune) && !(staff.members && members === false)).map(staff => staff.item);
}

/** Select once for all runes of a cast. An unread worn list never turns inventory into worn gear. */
export function selectCastingStaff(inp: StaffInput, castRunes: readonly string[]): { staff: string; worn: boolean; runes: readonly string[] } | null {
  const candidates: { staff: RuneStaff; worn: boolean; covers: number }[] = [];
  for (const [items, worn] of [[inp.worn, true], [inp.carried, false]] as const) for (const item of items ?? []) {
    const staff = BY_NAME.get(nameKey(item.name));
    if (!staff || (item.count ?? 1) < 1 || (staff.members && inp.members !== true)) continue;
    if (!worn) {
      const piece = gearPieceByName(staff.item);
      if (!piece || piece.reqUnverified || !canWear(piece, inp.levels ?? {})) continue;
    }
    const covers = castRunes.filter(name => staff.runes.includes(name)).length;
    if (covers) candidates.push({ staff, worn, covers });
  }
  // Prefer the current weapon; otherwise one usable carried staff with the broadest coverage, stable on ties.
  candidates.sort((a, b) => Number(b.worn) - Number(a.worn) || b.covers - a.covers || a.staff.item.localeCompare(b.staff.item, 'en'));
  const selected = candidates[0];
  return selected ? { staff: selected.staff.item, worn: selected.worn, runes: selected.staff.runes } : null;
}

/** Compatibility projection for a single rune; multi-rune callers share one selected casting loadout. */
export function staffCover(rune: string, inp: StaffInput, castRunes: readonly string[] = [rune]): { staff: string; worn: boolean } | null {
  const selected = selectCastingStaff(inp, castRunes);
  return selected?.runes.includes(rune) ? { staff: selected.staff, worn: selected.worn } : null;
}

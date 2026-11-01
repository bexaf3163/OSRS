// How much of an item the player has, in its requirement's units (potions by dose).
import { nameKey } from '../items/itemKey';
import { heldOf, type Held, type PlayerState } from './playerState';
import { doseKind, doseName } from '../items/doseKind';
import { DOSE_SIZES, type DoseSize } from '../items/doses';

export interface HeldUnits extends Held {
  /** Doses for a potion, pieces for anything else. */
  unit: 'dose' | 'piece';
  /** For a potion: how many potions of each size, largest first: what fills bag slots. */
  sizes?: DoseSize[];
}
/**
 * How much of an item the player has, in the units its requirement is counted in. Anything but a potion is heldOf as it is. A potion is counted in
 * doses across its four sizes, with the same rules heldOf keeps for one item: a known bank and a full report from the game make it complete; a manual
 * mark (in doses) is the player's word; a bag that shows doses without the bank is a lower bound; nothing reported is UNKNOWN, never "none".
 * `legacy` names manual marks made before doses were counted, in potions of the named size.
 */
export function heldUnits(
  s: Pick<PlayerState, 'owned' | 'equipment' | 'manual' | 'bankSeen'> & { levels?: PlayerState['levels'] }, name: string, manualKey?: string, legacy?: readonly string[],
): HeldUnits {
  const kind = doseKind(name);
  if (!kind) return { ...heldOf(s, name, manualKey), unit: 'piece' };
  const records = DOSE_SIZES.map((size) => ({ size, o: s.owned?.items.get(nameKey(doseName(kind.base, size))) }));
  // The game reports every size together (ItemCounts.report); a size it did not report is not "none" but "not counted".
  const reported = records.every((r) => r.o !== undefined);
  const bankReported = s.bankSeen && records.every((r) => r.o?.bank !== undefined);
  const sizes: DoseSize[] = records.map(({ size, o }) => ({
    size, bag: o?.carried ?? 0, noted: o?.noted ?? 0, bank: bankReported ? o!.bank! : null,
  }));
  const bag = sizes.reduce((a, x) => a + x.size * x.bag, 0);
  const noted = sizes.reduce((a, x) => a + x.size * x.noted, 0);
  const anyRecord = records.some((r) => r.o !== undefined);
  const base = { equipped: 0, unit: 'dose' as const, sizes };
  if (reported && bankReported) {
    const bank = sizes.reduce((a, x) => a + x.size * (x.bank ?? 0), 0);
    const total = bag + noted + bank;
    return { ...base, presence: total > 0 ? 'PRESENT' : 'MISSING', bag, noted, bank, total, source: 'game' };
  }
  const legacyMark = (legacy ?? []).map((k) => s.manual[k]).find((v) => v !== undefined);
  const manual = manualKey && s.manual[manualKey] !== undefined ? s.manual[manualKey] : legacyMark !== undefined ? legacyMark * kind.per : undefined;
  if (manual !== undefined) {
    const total = Math.max(manual, bag + noted);
    return { ...base, presence: total > 0 ? 'PRESENT' : 'MISSING', bag: anyRecord ? bag : null, noted, bank: null, total, source: 'manual' };
  }
  if (bag + noted > 0) return { ...base, presence: 'PRESENT', bag, noted, bank: null, total: bag + noted, source: 'game' };
  return { ...base, presence: 'UNKNOWN', bag: anyRecord ? bag : null, noted, bank: null, total: null, source: 'none' };
}

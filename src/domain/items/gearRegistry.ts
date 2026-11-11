// Shared equipment facts; lower-level travel and combat use the same source and indexes.
import type { GearData, GearPiece } from '../../types';
import { gearJson } from '../../data';
import { nameKey } from './itemKey';

export const gearData = gearJson as GearData;
export const gearById = new Map(gearData.items.map(piece => [piece.id, piece]));
export const gearByName = new Map(gearData.items.map(piece => [nameKey(piece.name), piece]));
export const gearPieceByName = (name: string): GearPiece | null => gearByName.get(nameKey(name)) ?? null;
/** A weapon that only shoots (a bow): it has no melee hit, so a melee estimate never uses it. */
export const shootsOnly = (piece: GearPiece | null | undefined): boolean =>
  Boolean(piece) && piece!.attack.ranged > Math.max(0, piece!.attack.stab, piece!.attack.slash, piece!.attack.crush);

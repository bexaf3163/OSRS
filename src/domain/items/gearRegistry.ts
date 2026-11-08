// Shared equipment facts; lower-level travel and combat use the same source and indexes.
import type { GearData, GearPiece } from '../../types';
import { gearJson } from '../../data';
import { nameKey } from './itemKey';

export const gearData = gearJson as GearData;
export const gearById = new Map(gearData.items.map(piece => [piece.id, piece]));
export const gearByName = new Map(gearData.items.map(piece => [nameKey(piece.name), piece]));
export const gearPieceByName = (name: string): GearPiece | null => gearByName.get(nameKey(name)) ?? null;

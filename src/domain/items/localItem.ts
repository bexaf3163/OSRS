// An item by English name or ID from the bundled item data (f2p-items.json).
import type { WikiItemDetail } from '../../types';
import { itemById, items } from '../../data';
import { fold } from '../text/md';

export function findLocalItem(query: string | number): WikiItemDetail | undefined {
  if (typeof query === 'number') return itemById.get(query);
  const q = fold(query.trim());
  return items.find((i) => fold(i.nameEn) === q);
}

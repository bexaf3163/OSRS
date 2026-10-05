// The in-game arrow for a training method: the point is taken only from the place dictionary by the method key — without guessing from the text.

import { matchStrict } from '../services/locationResolver';
import { navPayload } from './places';
import type { NavTargetPayload } from '../services/runeliteBridge';
import type { TrainingMethod } from './trainingRouter';

export function trainingNav(m: Pick<TrainingMethod, 'place'>): NavTargetPayload | null {
  if (!m.place) return null;
  const p = matchStrict(m.place);
  return p ? navPayload({ kind: 'city', location: m.place }, p) : null;
}

/** A target to the Grand Exchange for an item: the plugin highlights the item and clears the target when it is in the bag. */
export function exchangeNav(itemName: string): NavTargetPayload | null {
  const p = matchStrict('Grand Exchange');
  return p ? { label: `Grand Exchange: buy ${itemName}`.slice(0, 200), x: p.x, y: p.y, plane: p.plane, itemName } : null;
}

// The in-game arrow for a training method: the point is taken only from the place dictionary by the method key — without guessing from the text.

import { matchStrict } from '../services/locationResolver';
import { navPayload } from './places';
import type { NavTargetPayload } from '../services/runeliteBridge';
import type { TrainingMethod } from './trainingRouter';

export function trainingNav(m: Pick<TrainingMethod, 'place' | 'objectNames' | 'spot'>): NavTargetPayload | null {
  // The spot the gathering engine picked for this player wins over the method's general place (both are wiki-checked points).
  // A spot under the ground: the arrow goes to its way in (the plugin's one target cannot follow a ladder).
  const door = m.spot?.waypoints?.[0];
  if (m.spot && door) return { label: `${m.spot.label} (way in)`, x: door.x, y: door.y, plane: door.plane };
  if (m.spot) return { label: m.spot.label, x: m.spot.place.x, y: m.spot.place.y, plane: m.spot.place.plane, ...(m.objectNames ? { objectNames: m.objectNames } : {}) };
  if (!m.place) return null;
  const p = matchStrict(m.place);
  return p ? { ...navPayload({ kind: 'city', location: m.place }, p), ...(m.objectNames ? { objectNames: m.objectNames } : {}) } : null;
}

/** A target to the Grand Exchange for an item: the plugin highlights the item and clears the target when it is in the bag. */
export function exchangeNav(itemName: string): NavTargetPayload | null {
  const p = matchStrict('Grand Exchange');
  return p ? { label: `Grand Exchange: buy ${itemName}`.slice(0, 200), x: p.x, y: p.y, plane: p.plane, itemName } : null;
}

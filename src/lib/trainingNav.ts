// Стрелка в игре для способа прокачки: точка берётся только из словаря мест по ключу способа — без догадок по тексту.

import { matchStrict } from '../services/locationResolver';
import { navPayload } from './places';
import type { NavTargetPayload } from '../services/runeliteBridge';
import type { TrainingMethod } from './trainingRouter';

export function trainingNav(m: Pick<TrainingMethod, 'place'>): NavTargetPayload | null {
  if (!m.place) return null;
  const p = matchStrict(m.place);
  return p ? navPayload({ kind: 'city', location: m.place }, p) : null;
}

/** Цель к Grand Exchange за предметом: плагин подсветит предмет и снимет цель, когда он окажется в сумке. */
export function exchangeNav(itemName: string): NavTargetPayload | null {
  const p = matchStrict('Grand Exchange');
  return p ? { label: `Grand Exchange: купить ${itemName}`.slice(0, 200), x: p.x, y: p.y, plane: p.plane, itemName } : null;
}

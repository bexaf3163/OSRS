// A bounded starter kit, not a ranged DPS/food forecast. Levels and arrow compatibility reuse StyleGear.
import { STYLE_GEAR, ammoFits, usableStyleOption } from './styleGear';
import { heldOf, levelOf, questOf, wornItemsOf, type PlayerState } from './playerState';
import { countWorn } from './equipmentCount';
import { nameKey } from './checklist';
import type { MethodNeed } from './trainingRouter';

// Ordinary F2P longbows share their corresponding shortbow's unlock and arrow cap (OSRS Wiki: Bow).
const LONG: Readonly<Record<string, string>> = { Shortbow: 'Longbow', 'Oak shortbow': 'Oak longbow', 'Willow shortbow': 'Willow longbow', 'Maple shortbow': 'Maple longbow' };
const bows = STYLE_GEAR.ranged.weapon.map(o => ({ ...o, names: [...o.names, ...o.names.flatMap(n => LONG[n] ? [LONG[n]] : [])] }));
const ammo = STYLE_GEAR.ranged.ammo;
export const RANGED_WATCH = [...bows.flatMap(o => o.names), ...ammo.flatMap(o => o.names)];

// App preparation thresholds, not predicted consumption: refill a low stack, but do not interrupt after every shot.
const STARTER_ARROWS = 100;
const LOW_ARROWS = 20;

/** Ordinary starter bows occupy both hands; every prediction uses the kit that preparation actually equips. */
export function bowEquipment(worn: Readonly<Record<string, string>>, bow: string, arrow: string): Record<string, string> {
  const equipment = { ...worn, weapon: bow, ammo: arrow };
  delete (equipment as Record<string, string>).shield;
  return equipment;
}

export function rangedNeeds(state: PlayerState): MethodNeed[] {
  const usable = bows.filter(o => usableStyleOption(o, (s) => levelOf(state, s), (q) => questOf(state, q) === 'DONE'));
  const options = usable.flatMap(o => o.names.map(name => ({ name, canonical: o.names[0] })));
  const worn = new Set(Object.values(state.equipment).map(nameKey));
  const bow = options.find(o => worn.has(nameKey(o.name)))
    ?? options.find(o => (heldOf(state, o.name).total ?? 0) > 0)
    ?? options.find(o => o.name === 'Shortbow') ?? { name: 'Shortbow', canonical: 'Shortbow' };
  const compatible = ammo.filter(o => !ammoFits(o, bow.canonical, STYLE_GEAR.ranged.weapon));
  const candidates = compatible.flatMap(o => o.names.map(name => {
    const held = heldOf(state, name);
    const equipped = countWorn(wornItemsOf(state), n => nameKey(n) === nameKey(name)).count;
    return { name, held, equipped };
  }));
  // Reuse an adequate worn/owned stack. Unread compatible stock must settle before an absent stack can justify a purchase.
  const arrow = candidates.find(o => o.equipped >= LOW_ARROWS)
    ?? candidates.find(o => (o.held.total ?? 0) >= STARTER_ARROWS)
    ?? candidates.find(o => o.held.bank === null)
    ?? [...candidates].sort((a, b) => (b.held.total ?? 0) - (a.held.total ?? 0)).find(o => (o.held.total ?? 0) > 0)
    ?? candidates.find(o => o.name === 'Bronze arrow')!;
  const arrowOption = compatible.find(o => o.names.includes(arrow.name))!;
  const bowAlternatives = options.filter(o => !ammoFits(arrowOption, o.canonical, STYLE_GEAR.ranged.weapon)).map(o => o.name).filter(n => n !== bow.name);
  return [
    ...(levelOf(state, 'ranged') === undefined ? [{ type: 'skill' as const, skill: 'ranged', min: 1 }] : []),
    { type: 'item', name: bow.name, equip: true, ...(bowAlternatives.length ? { anyOf: bowAlternatives } : {}) },
    { type: 'item', name: arrow.name, count: arrow.equipped >= LOW_ARROWS ? LOW_ARROWS : STARTER_ARROWS, equip: true },
  ];
}

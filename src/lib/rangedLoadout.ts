// One level-appropriate ranged kit for preparation and forecasts; unlocks and arrow compatibility reuse StyleGear.
import { STYLE_GEAR, ammoFits, usableStyleOption, type StyleOption } from './styleGear';
import { heldOf, levelOf, questOf, wornItemsOf, type PlayerState } from './playerState';
import { countWorn } from './equipmentCount';
import { nameKey } from './checklist';
import type { MethodNeed } from './trainingRouter';
import { coinsOf } from './playerState';
import { supplyPrice } from './sourceRouter';
import type { PriceView } from './funding/quotes';
import rangedGearJson from '../data/rangedGear.json';

// Ordinary F2P longbows share their corresponding shortbow's unlock and arrow cap (OSRS Wiki: Bow).
const LONG: Readonly<Record<string, string>> = { Shortbow: 'Longbow', 'Oak shortbow': 'Oak longbow', 'Willow shortbow': 'Willow longbow', 'Maple shortbow': 'Maple longbow' };
const bows = STYLE_GEAR.ranged.weapon.map(o => ({ ...o, names: [...o.names, ...o.names.flatMap(n => LONG[n] ? [LONG[n]] : [])] }));
const ammo = STYLE_GEAR.ranged.ammo;
export const RANGED_WATCH = [...new Set([...bows.flatMap(o => o.names), ...Object.values(STYLE_GEAR.ranged).flatMap(options => options.flatMap(o => o.names))])];
const stats = rangedGearJson.items;
const armourSlots = ['head', 'body', 'legs', 'hands', 'neck', 'feet', 'cape'] as const;
const starter = (options: readonly StyleOption[]) => options.filter(o => !o.reqs.length && !o.quests.length).flatMap(o => o.names)
  .filter(name => stats.some(g => g.name === name && g.rangedAttack >= 0))
  .sort((a, b) => (stats.find(g => g.name === b)?.rangedAttack ?? 0) - (stats.find(g => g.name === a)?.rangedAttack ?? 0))[0];

/** Project exactly the equipped kit requested by preparation, rather than forecasting in the old melee armour. */
export function rangedEquipment(worn: Readonly<Record<string, string>>, needs: readonly MethodNeed[]): Record<string, string> {
  const equipment = { ...worn };
  for (const n of needs) {
    if (n.type !== 'item' || !n.equip) continue;
    const declaredSlot = stats.find(g => nameKey(g.name) === nameKey(n.name))?.slot
      ?? Object.entries(STYLE_GEAR.ranged).find(([, options]) => options.some(o => o.names.includes(n.name)))?.[0];
    const slot = declaredSlot === '2h' ? 'weapon' : declaredSlot;
    if (slot) equipment[slot] = n.name;
  }
  delete equipment.shield;
  return equipment;
}

// App preparation thresholds, not predicted consumption: refill a low stack, but do not interrupt after every shot.
const STARTER_ARROWS = 100;
const LOW_ARROWS = 20;

/** Ordinary starter bows occupy both hands; every prediction uses the kit that preparation actually equips. */
export function bowEquipment(worn: Readonly<Record<string, string>>, bow: string, arrow: string): Record<string, string> {
  const equipment = { ...worn, weapon: bow, ammo: arrow };
  delete (equipment as Record<string, string>).shield;
  return equipment;
}

export function rangedNeeds(state: PlayerState, prices?: PriceView | null): MethodNeed[] {
  const usable = bows.filter(o => usableStyleOption(o, (s) => levelOf(state, s), (q) => questOf(state, q) === 'DONE'));
  const options = usable.flatMap(o => o.names.map(name => ({ name, canonical: o.names[0] })));
  const worn = new Set(Object.values(state.equipment).map(nameKey));
  let bow = options.find(o => worn.has(nameKey(o.name)))
    ?? options.find(o => (heldOf(state, o.name).total ?? 0) > 0)
    ?? options.find(o => o.name === 'Shortbow') ?? { name: 'Shortbow', canonical: 'Shortbow' };
  const owned = (name: string) => { const h = heldOf(state, name); return worn.has(nameKey(name)) || h.presence === 'PRESENT' || h.equipped > 0; };
  const price = (name: string) => supplyPrice(name, prices, state.mode);
  const cash = coinsOf(state).total;
  const arrowReserve = price('Bronze arrow');
  const foodReserve = price('Salmon');
  const armourReserve = armourSlots.filter(slot => !['neck', 'cape'].includes(slot)).reduce<number | null>((total, slot) => {
    const allowed = (STYLE_GEAR.ranged[slot] ?? []).filter(o => usableStyleOption(o, s => levelOf(state, s), q => questOf(state, q) === 'DONE'));
    if (allowed.some(o => o.names.some(owned))) return total;
    const name = starter(allowed);
    const cost = name ? price(name) : 0;
    return total === null || cost === null ? null : total + cost;
  }, 0);
  // Reserve one starter stack, food and cheap armour before optional upgrades; unknown cash/prices justify no purchases.
  let budget = cash !== null && arrowReserve !== null && foodReserve !== null && armourReserve !== null ? Math.max(0, cash - 100 * arrowReserve - 10 * foodReserve - armourReserve) : null;
  const canBuy = (name: string) => {
    const p = price(name);
    return heldOf(state, name).presence === 'MISSING' && p !== null && budget !== null && p <= budget;
  };
  for (const o of usable) {
    const name = o.names[0]; // Buy shortbows, not their slower longbow alternatives.
    if (o.names.includes(bow.name)) break;
    if (owned(name) || canBuy(name)) {
      if (!owned(name)) budget! -= price(name)!;
      bow = { name, canonical: name };
      break;
    }
  }
  const compatible = ammo.filter(o => !ammoFits(o, bow.canonical, STYLE_GEAR.ranged.weapon));
  const candidates = compatible.flatMap(o => o.names.map(name => {
    const held = heldOf(state, name);
    const equipped = countWorn(wornItemsOf(state), n => nameKey(n) === nameKey(name)).count;
    return { name, held, equipped };
  }));
  // Reuse an adequate worn/owned stack. Unread compatible stock must settle before an absent stack can justify a purchase.
  let arrow = candidates.find(o => o.equipped >= LOW_ARROWS || (o.held.total ?? 0) >= STARTER_ARROWS)
    ?? candidates.find(o => o.held.bank === null)
    ?? [...candidates].sort((a, b) => (b.held.total ?? 0) - (a.held.total ?? 0)).find(o => (o.held.total ?? 0) > 0)
    ?? candidates.find(o => o.name === 'Bronze arrow')!;
  if (candidates.every(o => o.held.bank !== null && (o.held.total ?? 0) === 0 && o.equipped === 0)) {
    // Buy economical compatible ammunition; an adequate better stack already owned wins above.
    const priced = candidates.filter(o => price(o.name) !== null).sort((a, b) => price(a.name)! - price(b.name)!);
    arrow = priced[0] ?? arrow;
  }
  const armour: MethodNeed[] = [];
  for (const slot of armourSlots) {
    const allowed = (STYLE_GEAR.ranged[slot] ?? []).filter(o => usableStyleOption(o, s => levelOf(state, s), q => questOf(state, q) === 'DONE'));
    const seen = allowed.flatMap(o => o.names).find(owned);
    let chosen = seen;
    const paid = allowed.flatMap(o => o.names).filter(name => stats.some(g => g.name === name) && canBuy(name))
      .sort((a, b) => (stats.find(g => g.name === b)?.rangedAttack ?? 0) - (stats.find(g => g.name === a)?.rangedAttack ?? 0) || price(a)! - price(b)!);
    const better = paid.find(name => !seen || (stats.find(g => g.name === name)?.rangedAttack ?? 0) > (stats.find(g => g.name === seen)?.rangedAttack ?? 0));
    if (better && !['feet', 'cape'].includes(slot)) {
      chosen = better;
      budget! -= price(better)!;
    }
    if (!chosen && !['neck', 'cape'].includes(slot)) {
      chosen = starter(allowed);
    }
    if (chosen) armour.push({ type: 'item', name: chosen, count: 1, equip: true });
  }
  return [
    ...(levelOf(state, 'ranged') === undefined ? [{ type: 'skill' as const, skill: 'ranged', min: 1 }] : []),
    { type: 'item', name: bow.name, equip: true },
    { type: 'item', name: arrow.name, count: arrow.equipped >= LOW_ARROWS ? LOW_ARROWS : STARTER_ARROWS, equip: true },
    ...armour,
  ];
}

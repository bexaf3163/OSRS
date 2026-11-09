// What to do with a training drop (the Big bones of frogs and giants): bury bones while a Prayer goal is above the current
// level, sell what earns coins after tax, bury bones that sell for nothing, and leave the rest. One rule for every card.
import { processingJson } from '../../data';
import { nameKey } from '../items/itemKey';

interface Recipe { skill: string; xp: number; inputs: readonly { name: string }[] }

/** Prayer XP of burying one bone, by name (the processing recipes "bury-…"). */
const BURY_XP = new Map((processingJson as unknown as { recipes: Recipe[] }).recipes
  .filter((r) => r.skill === 'prayer' && r.inputs.length === 1).map((r) => [nameKey(r.inputs[0].name), r.xp]));

export interface DropUse { action: 'bury' | 'sell' | 'leave'; text: string }

/** The best use of one kind of drop for this player. prayerGoal is a Prayer level the player works towards (a quest's need or a
 * followed goal); coinsEach is the sale after tax, null when it cannot be sold or has no price. */
export function dropUse(item: string, o: { prayer: number | null; prayerGoal: number | null; coinsEach: number | null }): DropUse {
  const xp = BURY_XP.get(nameKey(item));
  if (xp && o.prayerGoal !== null && (o.prayer ?? 1) < o.prayerGoal) {
    return { action: 'bury', text: `${item}: bury them, ${xp} Prayer XP each toward Prayer ${o.prayerGoal}.` };
  }
  if (o.coinsEach !== null && o.coinsEach > 0) {
    return { action: 'sell', text: `${item}: sell them, about ${Math.round(o.coinsEach).toLocaleString('en-US')} gp each after tax${xp ? '; no Prayer goal needs them' : ''}.` };
  }
  if (xp) return { action: 'bury', text: `${item}: bury them, ${xp} Prayer XP each; they sell for nothing.` };
  return { action: 'leave', text: `${item}: leave them; they sell for nothing.` };
}

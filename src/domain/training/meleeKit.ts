// A melee training plan's future kit: what the Gear page would wear or buy at each level, as Ranged plans its bows.
import { adviseGear, gearData, gearPieceByName, type AdvisorInput, type Levels } from '../combat/gearAdvisor';
import { gearMarketPrices } from '../combat/gearAdvice';
import { coinsOf, type PlayerState } from '../player/playerState';
import type { PriceView } from '../market/quotes';
import { rateKeyOf } from './methodRates';

/** The levels of a melee skill where some gear piece becomes wearable. */
const unlockCache = new Map<string, Set<number>>();
export const meleeUnlocks = (skill: string): Set<number> => {
  let out = unlockCache.get(skill);
  if (!out) unlockCache.set(skill, out = new Set(gearData.items.flatMap((p) => p.req?.[skill as keyof Levels] ?? [])));
  return out;
};

/** What the gear advisor (the Gear page) would wear or buy with this state's levels and coins, as equip needs; unpriced buys are left out. */
// The Attack, Strength, Defence and Slayer plans of one turn ask for the same kit from equal levels in different state
// copies; the gear advisor behind it was a fourteenth of a Members gate turn (profile, 2.179.0).
const kits = new WeakMap<PriceView, Map<string, ReturnType<typeof plannedMeleeKitFresh>>>();
export function plannedMeleeKit(state: PlayerState, prices: PriceView): { type: 'item'; name: string; count: number; equip: boolean }[] {
  let byState = kits.get(prices);
  if (!byState) kits.set(prices, byState = new Map());
  const key = rateKeyOf(state);
  let kit = byState.get(key);
  if (!kit) {
    if (byState.size > 2_000) byState.clear();
    byState.set(key, kit = plannedMeleeKitFresh(state, prices));
  }
  return kit;
}

function plannedMeleeKitFresh(state: PlayerState, prices: PriceView): { type: 'item'; name: string; count: number; equip: boolean }[] {
  const levels = Object.fromEntries(Object.entries(state.levels).flatMap(([k, v]) => (v.known ? [[k, v.value]] : [])));
  const { bag, bank } = coinsOf(state);
  const equipment = Object.entries(state.equipment).flatMap(([slot, name]) => {
    const piece = gearPieceByName(name);
    return piece ? [{ id: piece.id, name, count: 1, slot }] : [];
  });
  const gear = { equipment, inventory: [], coins: bag, bankCoins: bank } as unknown as AdvisorInput['gear'];
  const advice = adviseGear({ levels, gear, owned: state.owned, mode: state.mode, geQuotes: gearMarketPrices(prices),
    ...(state.quests.known ? { questsDone: new Set(state.quests.value) } : {}) });
  return [...advice.actions, ...advice.armour].filter((a) => a.cost !== null).map((a) => ({ type: 'item' as const, name: a.item.name, count: 1, equip: true }));
}

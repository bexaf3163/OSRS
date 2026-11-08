import { nameKey } from '../items/itemKey';
import { currentBankView, heldExact, wornItemsOf } from '../player/playerState';
import { countWorn } from '../items/equipmentCount';
import type { PlayerState } from '../player/playerState';
import { levelForXp } from '../player/xp';
import { liquidOf } from '../economy/funding/snapshot';
import type { ConditionalResources, PlanningSnapshot, Projection, ResourceChange, ResourceQuantity } from './contracts';
import { acceptsDecision } from './scope';

const validCount = (value: number) => Number.isSafeInteger(value) && value >= 0;
const validQuantity = (value: ResourceQuantity) => validCount(value.floor) && typeof value.complete === 'boolean';
const unread = (): ResourceQuantity => ({ floor: 0, complete: false });
const calculatorCache = new WeakMap<Projection, { snapshot: PlanningSnapshot; state: PlayerState }>();
const trainingCache = new WeakMap<Projection, { snapshot: PlanningSnapshot; state: PlayerState | null }>();
let calculatorRevision = 0;

/** Total-stock input for procurement pricing only. Never use for combat rates, live readiness, location proof, saves or bridge payloads. */
export function projectedProcurementState(snapshot: PlanningSnapshot, projection: Projection): PlayerState | null {
  if (!projection.scope || !acceptsDecision(snapshot.scope, projection.scope) || projection.invalidResources || !projection.resources) return null;
  const cached = calculatorCache.get(projection);
  if (cached?.snapshot === snapshot) return cached.state;
  const { resources } = projection;
  if (!validQuantity(resources.gp) || Object.values(resources.items).some(quantity => !validQuantity(quantity))) return null;
  const items = new Map(Object.entries(resources.items).map(([name, quantity]) => [nameKey(name), {
    name, carried: quantity.floor, noted: 0, ...(quantity.complete ? { bank: 0 } : {}),
  }]));
  const levels = { ...snapshot.player.levels };
  for (const [skill, floor] of Object.entries(projection.levels ?? {})) {
    if (Number.isInteger(floor) && floor >= 1 && floor <= 99) levels[skill] = { known: true, value: floor, source: 'profile' };
  }
  for (const [skill, xp] of Object.entries(projection.xp)) if (validCount(xp) && xp <= 200_000_000) {
    levels[skill] = { known: true, value: levelForXp(xp), source: 'profile' };
  }
  const state: PlayerState = { ...snapshot.player, levels, manual: {},
    // Total physical quantities only. Their bag/bank locations are intentionally unavailable to execution.
    equipment: {}, equipmentItems: [], equipmentKnown: false, owned: { bankSeen: true, items }, bankSeen: true,
    coins: { bag: { known: true, value: resources.gp.floor, source: 'profile' },
      bank: resources.gp.complete ? { known: true, value: 0, source: 'profile' } : { known: false } },
    quests: snapshot.player.quests.known ? { known: true, value: [...new Set([...snapshot.player.quests.value, ...projection.completed])], source: 'profile' } : snapshot.player.quests,
    position: resources.position ? { known: true, value: resources.position, source: 'profile' } : { known: false },
    fingerprint: `${snapshot.player.fingerprint}:conditional-cost:${++calculatorRevision}` };
  calculatorCache.set(projection, { snapshot, state });
  return state;
}

/** Training-cost input: conditional stock/cash/stats with only the original observed worn kit. Never executable readiness. */
export function projectedTrainingState(snapshot: PlanningSnapshot, projection: Projection): PlayerState | null {
  const cached = trainingCache.get(projection);
  if (cached?.snapshot === snapshot) return cached.state;
  const stock = projectedProcurementState(snapshot, projection);
  if (!stock) return null;
  const worn = wornItemsOf(snapshot.player);
  const items = new Map(stock.owned?.items);
  for (const key of new Set(worn?.map(item => nameKey(item.name)) ?? [])) {
    const amount = countWorn(worn, name => nameKey(name) === key).count;
    const row = items.get(key);
    if (!row || row.carried < amount || (projection.resources?.worn?.[key] ?? 0) < amount) {
      trainingCache.set(projection, { snapshot, state: null });
      return null; // The branch no longer proves this kit survived. Do not resurrect it or equip a future purchase.
    }
    items.set(key, { ...row, carried: row.carried - amount });
  }
  const state: PlayerState = { ...stock, equipment: snapshot.player.equipment, equipmentItems: snapshot.player.equipmentItems,
    equipmentKnown: snapshot.player.equipmentKnown, owned: { bankSeen: true, items } };
  trainingCache.set(projection, { snapshot, state });
  return state;
}

/** Seed search from physical observations, with lower bounds when the bank/row was not read. No allocation is duplicated here. */
export function observedResources(snapshot: PlanningSnapshot): ConditionalResources {
  const player = currentBankView(snapshot.player);
  const names = new Set([...[...player.owned?.items.values() ?? []].map(item => item.name), ...Object.values(player.equipment)]);
  const items = Object.fromEntries([...names].flatMap(name => {
    if (nameKey(name) === 'coins') return []; // Cash has one pool, never an additional item balance.
    const held = heldExact(player, name);
    const floor = (held.total ?? ((held.bag ?? 0) + held.noted + (held.bank ?? 0))) + held.equipped;
    return validCount(floor) ? [[nameKey(name), { floor, complete: held.bank !== null }]] : [];
  }));
  const cash = liquidOf(player);
  const cashKnown = cash.amount !== null && validCount(cash.amount);
  const worn = wornItemsOf(player);
  const surviving = worn ? Object.fromEntries([...new Set(worn.map(item => nameKey(item.name)))].map(key => [key,
    countWorn(worn, name => nameKey(name) === key).count])) : null;
  return { items, gp: { floor: cashKnown ? cash.amount! : 0, complete: cashKnown && cash.complete },
    position: player.position.known ? player.position.value : null, worn: surviving };
}

/** Apply an already costed, hypothetical transaction atomically. A missing acquisition cannot make negative stock or free money. */
export function projectResources(before: ConditionalResources, changes: readonly ResourceChange[]): ConditionalResources | null {
  const items = { ...before.items };
  let gp = { ...before.gp }, position = before.position;
  const worn = before.worn ? { ...before.worn } : before.worn;
  if (!validQuantity(gp) || Object.values(worn ?? {}).some(count => !validCount(count))) return null;
  for (const change of changes) {
    if (!change.source.trim() || !Number.isSafeInteger(change.gp)) return null;
    const cash = gp.floor + change.gp;
    if (!validCount(cash)) return null;
    gp = { ...gp, floor: cash };
    for (const name of change.unknownItems ?? []) {
      const key = nameKey(name);
      if (!key || key === 'coins') return null; // Cash has one pool, never an item alias.
      items[key] = unread();
      if (worn) worn[key] = 0; // No original worn unit can be promised to have survived this exchange.
    }
    // Aggregate one transaction's repeated physical names before changing balances.
    const deltas = new Map<string, { delta: number; spent: number; uncertain: boolean }>();
    for (const item of change.items) {
      const key = nameKey(item.name);
      if (!key || key === 'coins' || !Number.isSafeInteger(item.delta) || (item.uncertain !== undefined && item.uncertain !== true)) return null;
      const previous = deltas.get(key), delta = (previous?.delta ?? 0) + item.delta;
      if (!Number.isSafeInteger(delta)) return null;
      const spent = (previous?.spent ?? 0) + Math.max(0, -item.delta);
      if (!Number.isSafeInteger(spent)) return null;
      deltas.set(key, { delta, spent, uncertain: Boolean(previous?.uncertain || item.uncertain) });
    }
    for (const [key, { delta, spent, uncertain }] of deltas) {
      const prior = items[key] ?? unread(), floor = prior.floor + delta;
      if (!validQuantity(prior) || !validCount(floor) || spent > prior.floor) return null;
      if (worn?.[key]) {
        // Unworn stock is used first. A consumed original cannot become worn again through a later purchase/reward of the same name.
        const unworn = Math.max(0, prior.floor - worn[key]);
        worn[key] = Math.max(0, worn[key] - Math.max(0, spent - unworn));
      }
      items[key] = { floor, complete: prior.complete && !uncertain };
    }
    if (change.destination === null) position = null;
    else if (change.destination) {
      const { x, y, plane } = change.destination;
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < 0 || y < 0 || ![0, 1, 2, 3].includes(plane)) return null;
      position = { x, y, plane };
    }
  }
  return { items, gp, position, ...(worn !== undefined ? { worn } : {}) };
}

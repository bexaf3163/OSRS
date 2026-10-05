import { describe, expect, it } from 'vitest';
import { allSteps as routeSteps, stepById } from '../src/data';
import { buildPlayerState } from '../src/lib/playerState';
import { createReadinessEngine } from '../src/lib/readinessEngine';
import { emptyProgress } from '../src/lib/progress';
import { nameKey, type OwnedItem, type OwnedState } from '../src/lib/checklist';
import { stepPlaces } from '../src/lib/stepPlaces';
import { procurementDetour } from '../src/lib/detours';
import { bankOnRoute, dist, travelOptions, type TravelInput } from '../src/lib/travel';
import { bankWithdrawalsOf, planPayload } from '../src/lib/prepEnvelope';
import type { GearItem } from '../src/services/runeliteBridge';

// What the bank holds is never bought: the plan says "take it from the bank", the stop on the way is a bank, and the plugin is told what to withdraw.

const at = (x: number, y: number, plane = 0) => ({ x, y, plane });
const owned = (rows: Record<string, Partial<OwnedItem>>, bankSeen = true): OwnedState => {
  const items = new Map<string, OwnedItem>();
  for (const [name, o] of Object.entries(rows)) items.set(nameKey(name), { name, carried: 0, noted: 0, ...o });
  return { bankSeen, items };
};
const planFor = (id: string, rows: Record<string, Partial<OwnedItem>>, bankSeen = true) => {
  const state = buildPlayerState({
    mode: 'f2p', stats: null, progress: { levels: {} }, owned: owned(rows, bankSeen), gear: { equipment: [], inventory: [], coins: 600, bankCoins: 0 }, questsDone: null, connected: true,
  });
  return createReadinessEngine({ steps: routeSteps, progress: emptyProgress(), qp: 0, mode: 'f2p', state }).plan(stepById.get(id)!);
};
const bag = (...rows: [string, number][]): GearItem[] => rows.map(([name, count], i) => ({ id: i + 1, name, count }));

describe('bank snapshot: what the bank holds is withdrawn, not bought', () => {
  const draynor = at(3093, 3244);
  const goblinVillage = () => stepPlaces(stepById.get('S2-12')!)[0];
  const heldInBank = { 'Blue dye': { carried: 1 }, 'Orange dye': { carried: 0, bank: 1 }, 'Red dye': { carried: 0, bank: 0 }, 'Yellow dye': { carried: 0, bank: 0 } };

  it('the plan line for an item in the bank is a take from the bank, never a purchase', () => {
    const plan = planFor('S2-12', heldInBank);
    const line = [...plan.now, ...plan.soon].find((l) => l.name === 'Orange dye');
    expect(line?.where).toBe('BANK');
    expect(line?.action?.kind).toBe('TAKE');
    expect([...plan.now, ...plan.soon].filter((l) => l.name === 'Orange dye' && l.action?.kind === 'BUY')).toHaveLength(0);
  });

  it('the stop on the way is the bank that costs the least walk, worded "Bank: Withdraw", with no exchange or crafting stop for it', () => {
    const plan = planFor('S2-12', heldInBank);
    const to = goblinVillage();
    const d = procurementDetour({ plan, stepId: 'S2-12', from: draynor, to, coins: 600 });
    expect(d, 'a bank stop is offered').not.toBeNull();
    expect(d!.actionType).toBe('WITHDRAW');
    expect(d!.text).toMatch(/^Bank: Withdraw Orange dye at /);
    expect(d!.text).not.toMatch(/Grand Exchange|Aggie|Buy/);
    const bank = bankOnRoute(draynor, to)!;
    expect(d!.stop).toMatchObject({ x: bank.x, y: bank.y });
  });

  it('the payload carries the withdrawals, and with the detour a non-null activeDetour of kind WITHDRAW', () => {
    const plan = planFor('S2-12', heldInBank);
    const to = goblinVillage();
    const d = procurementDetour({ plan, stepId: 'S2-12', from: draynor, to, coins: 600 })!;
    const payload = planPayload(plan, { detour: d });
    expect(payload.bankWithdrawals).toEqual(expect.arrayContaining([expect.objectContaining({ itemName: 'Orange dye', quantity: 1 })]));
    expect(payload.activeDetour).toMatchObject({ actionType: 'WITHDRAW', targetTile: { plane: 0 } });
    expect(bankWithdrawalsOf(plan).every((w) => w.quantity >= 1 && w.itemId >= 0)).toBe(true);
  });

  it('without the item in the bank, the line is not a withdrawal', () => {
    const plan = planFor('S2-12', { 'Blue dye': { carried: 1 }, 'Orange dye': { carried: 0, bank: 0 } });
    expect(bankWithdrawalsOf(plan).find((w) => w.itemName === 'Orange dye')).toBeUndefined();
  });

  it('a tablet the bank holds is fetched there on the way, not bought at the exchange', () => {
    const bank = new Map([[nameKey('Falador teleport'), 2]]);
    const inp: TravelInput = { from: draynor, to: at(2957, 3512), levels: {}, carried: bag(['Coins', 100]), bankSeen: true, bank };
    const o = travelOptions(inp).find((x) => x.id === 'falador-tab-acquire');
    expect(o?.acquire).toMatchObject({ source: 'bank' });
    expect(o!.acquire!.cost).toBe(0);
    expect(o!.walkTiles).toBeLessThan(dist(draynor, inp.to) - 40);
  });

  it('the bank not opened yet is unknown, not empty: nothing is claimed to be in it', () => {
    const plan = planFor('S2-12', {}, false);
    expect(bankWithdrawalsOf(plan)).toEqual([]);
  });
});

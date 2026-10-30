// The processing engine (2.79): the wiki's recipes at the wiki's stations, held to the wiki's own guide rates; costs and gains by the shared rules; a
// new recipe or station inherits them. Synthetic recipes below exist only in this test.

import { describe, expect, it } from 'vitest';
import { PROCESSING, processPace, processRate, type ProcessingRegistry } from '../src/lib/processingRates';
import { personalize, trainingMethods, viewMethod, type TrainingMethod } from '../src/lib/trainingRouter';
import { buildPlayerState } from '../src/lib/playerState';
import { emptyProgress } from '../src/lib/progress';
import type { PriceView } from '../src/lib/funding/quotes';

const method = (id: string) => trainingMethods.find((m) => m.id === id) as TrainingMethod;
const stateOf = (levels: Record<string, number>, mode: 'f2p' | 'members' = 'f2p') =>
  buildPlayerState({ mode, stats: null, progress: { ...emptyProgress(), levels }, owned: null, gear: null, questsDone: [], connected: false });
const unit = (price: number) => ({ price, basis: 'side' as const, confidence: 'HIGH' as const, ageMinutes: 0, volumePerHour: null, notes: [] });
const prices = (buy: Record<string, number>, sell: Record<string, number>): PriceView => ({
  status: 'live', at: 1, idOf: () => undefined, limitOf: () => undefined,
  buy: (n) => (buy[n] === undefined ? null : unit(buy[n])), sell: (n) => (n === 'Cowhide' ? unit(116) : sell[n] === undefined ? null : unit(sell[n])),
});

describe('the processing engine against the wiki', () => {
  // Free-to-play Smithing training (the anvil south of Varrock West bank) and Free-to-play Crafting training (1,350 gold items an hour).
  const guide: [string, string, number, number][] = [
    ['sm-bronze-items', 'smithing', 2, 13_500], ['sm-bronze-items', 'smithing', 6, 25_500], ['sm-bronze-items', 'smithing', 10, 36_000],
    ['sm-iron', 'smithing', 40, 100_000], ['sm-steel', 'smithing', 50, 150_000], ['sm-mithril', 'smithing', 70, 200_000], ['sm-adamant', 'smithing', 90, 250_000],
    ['cr-gold', 'crafting', 5, 20_250],
  ];
  it.each(guide)('%s at %s %i: the wiki guide rate %i lies inside the range (within 10% of its fast end)', (id, skill, level, wiki) => {
    const r = processRate(method(id), skill, stateOf({ [skill]: level }))!;
    expect(r.xph[0]).toBeLessThanOrEqual(wiki);
    expect(r.xph[1] * 1.1).toBeGreaterThanOrEqual(wiki);
  });
  it('a bag holds the materials of whole actions: five bars a platebody, a hammer in the bag', () => {
    // 27 slots for bars: 5 platebodies a trip. The trip is the wiki's 10 tiles from the anvil to the bank.
    const r = processRate(method('sm-steel'), 'smithing', stateOf({ smithing: 50 }))!;
    expect(r.spot?.label).toBe('Varrock anvil building');
    expect(r.basis).toBe('Steel platebody');
  });
  it('cooking burns less as the level rises (the wiki success chart): more XP an hour on the same food', () => {
    const at = (lv: number) => processRate(method('ck-trout'), 'cooking', stateOf({ cooking: lv }))!.xph[1];
    expect(at(25)).toBeGreaterThan(at(16));
    expect(processRate(method('ck-trout'), 'cooking', stateOf({ cooking: 25 }))!.spot).toMatchObject({ label: 'Barbarian Village fire', bank: 'Edgeville Bank' });
  });
  it('the best recipe open at the level: gold amulets from 8, gems by their level', () => {
    expect(processRate(method('cr-gold'), 'crafting', stateOf({ crafting: 8 }))!.basis).toBe('Gold amulet (u)');
    expect(processRate(method('cr-gems'), 'crafting', stateOf({ crafting: 34 }))!.basis).toBe('Ruby');
    expect(processRate(method('cr-gems'), 'crafting', stateOf({ crafting: 19 }))).toBeNull();
  });
  it('every registry method is a catalogue method of the same skill, and every recipe it lists is built', () => {
    for (const [id, list] of Object.entries(PROCESSING.methods)) {
      const m = method(id);
      expect(m, id).toBeTruthy();
      for (const rid of list) expect(PROCESSING.recipes.find((r) => r.id === rid)?.skill, `${id} ${rid}`).toBe(m.skills[0]);
    }
  });
  it('every generated recipe has usable timing, quantities and an explicit source, including new mechanics', () => {
    for (const r of PROCESSING.recipes) {
      expect(r.ticks, r.id).toBeGreaterThan(0);
      expect(Number.isFinite(r.ticks), r.id).toBe(true);
      expect(r.xp, r.id).toBeGreaterThan(0);
      expect(r.level, r.id).toBeGreaterThanOrEqual(1);
      expect(r.inputs.length, r.id).toBeGreaterThan(0);
      expect(r.source, r.id).toMatch(/^https:\/\/oldschool\.runescape\.wiki\/w\//);
      for (const i of r.inputs) {
        expect(i.qty, `${r.id}: ${i.name}`).toBeGreaterThan(0);
        expect(Number.isFinite(i.qty), r.id).toBe(true);
        expect(typeof i.stacks, r.id).toBe('boolean');
      }
      if (r.batchSize !== undefined) expect(r.batchSize, r.id).toBeLessThanOrEqual(28);
      if (r.batchWaitTicks !== undefined) expect(r.batchWaitTicks, r.id).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('costs and gains by the shared rules', () => {
  const steel = (p: PriceView, restriction?: 'RESTRICTED' | 'LIFTED') => processRate(method('sm-steel'), 'smithing', stateOf({ smithing: 50 }), { prices: p, restriction, objective: 'balanced' })!;
  it('materials are a cost, the product a gain after tax; both known', () => {
    const r = steel(prices({ 'Steel bar': 500 }, { 'Steel platebody': 2_400 }));
    expect(r.costPerHour).toBeGreaterThan(0);
    expect(r.lootPerHour).toBeGreaterThan(0);
    // 5 bars at 500 against one platebody at 2,400 less 2% tax: a loss each.
    expect(r.lootPerHour!).toBeLessThan(r.costPerHour!);
  });
  it('a material or product without a price leaves the coins unknown: no cost, and no gain shown as profit', () => {
    const r = steel(prices({}, { 'Steel platebody': 2_600 }));
    expect(r.costPerHour).toBeNull();
    expect(r.lootPerHour).toBeUndefined();
    expect(steel(prices({ 'Steel bar': 500 }, {})).costPerHour).toBeNull();
  });
});

// A synthetic recipe and stations: two furnaces, one far and one members-only near the bank. Not game data.
const SYNTHETIC: ProcessingRegistry = {
  stations: [
    { kind: 'furnace', label: 'Far furnace', place: { x: 3200, y: 3200, plane: 0, label: 'Far furnace' }, bankTiles: 60, members: false },
    { kind: 'furnace', label: 'Members furnace', place: { x: 3210, y: 3210, plane: 0, label: 'Members furnace' }, bankTiles: 5, members: true },
  ],
  recipes: [{ id: 'test-bar', skill: 'smithing', level: 1, xp: 10, ticks: 4, facility: 'furnace', tools: [], inputs: [{ name: 'Test ore', qty: 1, stacks: false }], output: { name: 'Test bar', qty: 1 }, chance: 0.5 }],
  methods: { 'sm-test': ['test-bar'] },
};
const TEST = { id: 'sm-test', kind: 'method', skills: ['smithing'] } as unknown as TrainingMethod;

describe('a recipe must be feasible with the player’s current kit and budget', () => {
  const reg: ProcessingRegistry = {
    stations: [],
    recipes: [
      { id: 'future-fast', skill: 'smithing', level: 1, xp: 1000, ticks: 4, facility: null, tools: [], inputs: [{ name: 'Expensive input', qty: 1, stacks: false }], output: null },
      { id: 'future-owned', skill: 'smithing', level: 1, xp: 10, ticks: 4, facility: null, tools: [], inputs: [{ name: 'Owned input', qty: 1, stacks: false }], output: null },
    ], methods: { 'future-budget-method': ['future-fast', 'future-owned'] },
  };
  const m = { ...TEST, id: 'future-budget-method' };
  const state = (cash: number | null, stock: boolean) => buildPlayerState({
    mode: 'f2p', stats: null, progress: { ...emptyProgress(), levels: { smithing: 10 } }, questsDone: [], connected: true,
    gear: cash === null ? null : { equipment: [], inventory: [], coins: cash, bankCoins: 0 } as never,
    owned: { bankSeen: stock, items: new Map([
      ['expensive input', { name: 'Expensive input', carried: 0, noted: 0, bank: stock ? 0 : undefined }],
      ['owned input', { name: 'Owned input', carried: 0, noted: 0, bank: stock ? 28 : undefined }],
    ]) },
  });
  const quotes = prices({ 'Expensive input': 100, 'Owned input': 1 }, {});

  it.each(['balanced', 'fastest', 'profit'] as const)('chooses owned inputs over a kit the known wallet cannot buy (%s)', objective => {
    expect(processRate(m, 'smithing', state(0, true), { prices: quotes, objective }, reg)?.basis).toBe('Owned input');
  });

  it('sizes a faster first batch to the known wallet without assuming future income', () => {
    expect(processRate(m, 'smithing', state(99, true), { prices: quotes, objective: 'fastest' }, reg)?.basis).toBe('Owned input');
    const small = processRate(m, 'smithing', state(100, true), { prices: quotes, objective: 'fastest' }, reg);
    expect(small?.basis).toBe('Expensive input');
    expect(small?.batchActions).toBe(1);
    expect(small?.needs).toContainEqual({ type: 'item', name: 'Expensive input', count: 1 });
    expect(small?.warning).toContain('replenishment is not assumed');
    expect(processRate(m, 'smithing', state(2800, true), { prices: quotes, objective: 'fastest' }, reg)?.needs).toContainEqual({ type: 'item', name: 'Expensive input', count: 28 });
  });

  it('prefers a confirmed owned batch to a faster recipe whose starting capital is unread', () => {
    expect(processRate(m, 'smithing', state(null, true), { prices: quotes, objective: 'fastest' }, reg)?.basis).toBe('Owned input');
  });

  it('can fund a first batch from observed bag coins while the bank balance remains unread', () => {
    const st = state(100, true);
    st.coins.bank = { known: false };
    const r = processRate(m, 'smithing', st, { prices: quotes, objective: 'fastest' }, reg);
    expect(r?.basis).toBe('Expensive input');
    expect(r?.needs).toContainEqual({ type: 'item', name: 'Expensive input', count: 1 });
    expect(st.coins.bank.known).toBe(false);
  });

  it('prices the bank visits for the actual small batch and never changes observed stock or cash', () => {
    const st = state(100, true);
    const before = structuredClone(st);
    const small = processRate(m, 'smithing', st, { prices: quotes, objective: 'fastest' }, reg)!;
    const full = processRate(m, 'smithing', state(2800, true), { prices: quotes, objective: 'fastest' }, reg)!;
    expect(small.xph[1]).toBeLessThan(full.xph[1]);
    expect(st).toEqual(before);
  });

  it('allows declared mixtures for newly added identical recipes, without inventing mixed sale income', () => {
    const mixed = { ...m, name: 'Mixed future inputs', needs: [{ type: 'item' as const, name: 'Expensive input', count: 28, anyOf: ['Owned input'] }] };
    const same = { ...reg, recipes: reg.recipes.map(r => ({ ...r, xp: 10 })) };
    const st = state(0, true);
    st.owned!.items.set('expensive input', { name: 'Expensive input', carried: 14, noted: 0, bank: 0 });
    st.owned!.items.set('owned input', { name: 'Owned input', carried: 14, noted: 0, bank: 0 });
    const r = processRate(mixed, 'smithing', st, { prices: quotes, objective: 'fastest' }, same)!;
    expect(r.needs).toContainEqual({ type: 'item', name: 'Expensive input', count: 28, anyOf: ['Owned input'] });
    expect(r.xpPerAction).toBe(10);
    expect(r.costPerHour).toBeNull();
    expect(r.lootPerHour).toBeUndefined();
    expect(r.warning).toBeUndefined();
  });

  it('does not turn a different-XP recipe into an interchangeable material', () => {
    const different = { ...m, needs: [{ type: 'item' as const, name: 'Expensive input', count: 28, anyOf: ['Owned input'] }] };
    const r = processRate(different, 'smithing', state(0, true), { prices: quotes, objective: 'fastest' }, reg)!;
    expect(r.needs).toContainEqual({ type: 'item', name: 'Owned input', count: 28 });
    expect(r.needs?.some(n => n.type === 'item' && n.anyOf?.includes('Expensive input'))).toBe(false);
    expect(r.xpPerAction).toBe(10);
  });

  it('keeps uncertain recipes available when no confirmed alternative exists', () => {
    expect(processRate(m, 'smithing', state(0, false), { prices: quotes, objective: 'fastest' }, reg)?.basis).toBe('Expensive input');
    const only = { ...reg, methods: { [m.id]: ['future-fast'] } };
    expect(processRate(m, 'smithing', state(null, true), { prices: quotes, objective: 'fastest' }, only)?.basis).toBe('Expensive input');
  });

  it('does not invent a kit price when a required purchase is unpriced', () => {
    const only = { ...reg, methods: { [m.id]: ['future-fast'] } };
    expect(processRate(m, 'smithing', state(0, true), { prices: prices({}, {}), objective: 'fastest' }, only)?.costPerHour).toBeNull();
    expect(processRate(m, 'smithing', state(0, true), { prices: prices({}, {}), objective: 'fastest' }, reg)?.basis).toBe('Owned input');
  });

  it('does not use forecast sale proceeds as starting capital', () => {
    const profitable = { ...reg, recipes: [{ ...reg.recipes[0], output: { name: 'Future product', qty: 1 } }, reg.recipes[1]] };
    expect(processRate(m, 'smithing', state(0, true), { prices: prices({ 'Expensive input': 100, 'Owned input': 1 }, { 'Future product': 10000 }), objective: 'profit' }, profitable)?.basis).toBe('Owned input');
  });

  it('prices required tools as well as inputs and counts banked tools before buying', () => {
    const tools = { ...reg, recipes: [{ ...reg.recipes[0], inputs: reg.recipes[1].inputs, tools: ['Future tool'] }, reg.recipes[1]] };
    const st = state(0, true);
    st.owned!.items.set('future tool', { name: 'Future tool', carried: 0, noted: 0, bank: 0 });
    const p = prices({ 'Owned input': 1, 'Future tool': 100 }, {});
    expect(processRate(m, 'smithing', st, { prices: p, objective: 'fastest' }, tools)?.xpPerAction).toBe(10);
    st.owned!.items.set('future tool', { name: 'Future tool', carried: 0, noted: 0, bank: 1 });
    expect(processRate(m, 'smithing', st, { prices: p, objective: 'fastest' }, tools)?.xpPerAction).toBe(1000);
  });

  it('uses owned oak logs before demanding willow purchases, and refreshes the recipe after earning cash', () => {
    const st = buildPlayerState({ mode: 'members', stats: null, progress: { ...emptyProgress(), levels: { fletching: 40 } }, questsDone: [], connected: true,
      gear: { equipment: [], inventory: [], coins: 0, bankCoins: 0 } as never,
      owned: { bankSeen: true, items: new Map([
        ['oak logs', { name: 'Oak logs', carried: 0, noted: 0, bank: 28 }],
        ['willow logs', { name: 'Willow logs', carried: 0, noted: 0, bank: 0 }],
        ['knife', { name: 'Knife', carried: 1, noted: 0, bank: 0 }],
      ]) } });
    const p = prices({ 'Oak logs': 50, 'Willow logs': 50 }, {});
    const r = processRate(method('fl-oak-willow'), 'fletching', st, { prices: p, objective: 'fastest' });
    expect(r?.basis).toBe('Oak longbow (u)');
    expect(r?.needs).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'item', name: 'Oak logs' })]));
    const count = r?.needs?.find(n => n.type === 'item' && n.name === 'Oak logs');
    expect(count?.type === 'item' && count.count! > 0 && count.count! <= 28).toBe(true);
    const selected = (s: typeof st) => personalize([method('fl-oak-willow')], 'fletching', s, p, undefined, 'fastest')[0];
    expect(selected(st).needs).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Oak logs' })]));
    expect(selected(st).batchActions).toBe(r?.batchActions);
    const richer = { ...st, coins: { ...st.coins, bag: { known: true as const, value: 10000, source: 'game' as const } } };
    expect(selected(richer).needs).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Willow logs' })]));
  });

  it('keeps the selected recipe’s physical ingredients instead of restoring another recipe’s authored substitutes', () => {
    const st = buildPlayerState({ mode: 'f2p', stats: null, progress: { ...emptyProgress(), levels: { cooking: 60 } }, questsDone: [], connected: true,
      gear: { equipment: [], inventory: [], coins: 0, bankCoins: 0 } as never,
      owned: { bankSeen: true, items: new Map([
        ['raw beef', { name: 'Raw beef', carried: 0, noted: 0, bank: 26 }],
        ['raw chicken', { name: 'Raw chicken', carried: 0, noted: 0, bank: 26 }],
      ]) } });
    const p = prices({ 'Raw beef': 10, 'Raw chicken': 10 }, { 'Cooked meat': 1, 'Cooked chicken': 1000 });
    const selected = personalize([method('ck-meat')], 'cooking', st, p, undefined, 'profit')[0];
    expect(selected.name).toBe('Make Cooked chicken');
    expect(selected.needs).toContainEqual({ type: 'item', name: 'Raw chicken', count: 26 });
    const changed = { ...st, owned: { ...st.owned!, items: new Map(st.owned!.items) } };
    changed.owned.items.set('raw chicken', { name: 'Raw chicken', carried: 0, noted: 0, bank: 0 });
    expect(viewMethod(selected, changed, p).missing.some(n => n.label.includes('Raw chicken'))).toBe(true);
  });
});

describe('a new recipe or station inherits the rules (synthetic registry)', () => {
  it('a members station is offered only to members, and the nearer bank makes it faster', () => {
    const f2p = processRate(TEST, 'smithing', stateOf({ smithing: 10 }), {}, SYNTHETIC)!;
    const members = processRate(TEST, 'smithing', stateOf({ smithing: 10 }, 'members'), {}, SYNTHETIC)!;
    expect(f2p.spot?.label).toBe('Far furnace');
    expect(members.spot?.label).toBe('Members furnace');
    expect(members.xph[1]).toBeGreaterThan(f2p.xph[1]);
  });
  it('a flat success chance halves the XP of every action', () => {
    const sure = processRate(TEST, 'smithing', stateOf({ smithing: 10 }), {}, { ...SYNTHETIC, recipes: [{ ...SYNTHETIC.recipes[0], chance: undefined }] })!;
    const half = processRate(TEST, 'smithing', stateOf({ smithing: 10 }), {}, SYNTHETIC)!;
    expect(half.xph[1]).toBeCloseTo(sure.xph[1] / 2, 6);
  });
  it('a level below the recipe gives no rate', () => {
    expect(processRate(TEST, 'smithing', stateOf({ smithing: 10 }), {}, { ...SYNTHETIC, recipes: [{ ...SYNTHETIC.recipes[0], level: 20 }] })).toBeNull();
  });
});

describe('Firemaking: logs lit by a bank (2.80.3)', () => {
  // Free-to-play Firemaking training assumes 1,485 logs an hour burnt in lines; the wiki's lighting chance is certain from level 43.
  it.each([['fm-willow', 45, 90], ['fm-maple', 50, 135], ['fm-yew', 70, 202.5]] as const)('%s at %i: the wiki guide rate lies inside the range', (id, level, xp) => {
    const r = processRate(method(id), 'firemaking', stateOf({ firemaking: level }))!;
    expect(r.xph[0]).toBeLessThanOrEqual(xp * 1485);
    expect(r.xph[1] * 1.1).toBeGreaterThanOrEqual(xp * 1485);
    expect(r.basis).toMatch(/logs$/i);
  });
  it('a failed light costs time, not the log: low levels are slower, and the logs used stay one a success', () => {
    const at = (lv: number) => processRate(method('fm-normal'), 'firemaking', stateOf({ firemaking: lv }), { prices: prices({ Logs: 50 }, {}) })!;
    expect(at(1).xph[1]).toBeLessThan(at(43).xph[1] / 2);
    // Logs used an hour = XP an hour / 40 at every level: no log is lost to a failure.
    for (const lv of [1, 43]) {
      const r = at(lv);
      const logs = r.costPerHour! / 50;
      expect(logs * 40).toBeCloseTo(((r.xph[0] * 1.1 + r.xph[1]) / 2), -2);
    }
  });
});

describe('shared batch waits and consumed supplies', () => {
  it('wine waits once after thirteen mixes, rather than charging fermentation for every jug', () => {
    const r = processRate(method('ck-wine'), 'cooking', stateOf({ cooking: 68 }), { prices: prices({ Grapes: 10, 'Jug of water': 5 }, { 'Jug of wine': 1 }) })!;
    // 13 mixes × 2 ticks + one 20-tick shared timer + the existing 3-second bank visit.
    expect(r.xph[1]).toBeCloseTo((13 * 200 * 3600) / ((13 * 2 + 20) * 0.6 + 3));
    expect(r.xpPerAction).toBe(200);
    expect(r.costPerHour).toBeGreaterThan(0);
  });
  it('failed wine uses ingredients without granting XP; rate and action count use the same success chart', () => {
    const low = processRate(method('ck-wine'), 'cooking', stateOf({ cooking: 35 }))!;
    const high = processRate(method('ck-wine'), 'cooking', stateOf({ cooking: 68 }))!;
    expect(low.xpPerAction).toBeGreaterThan(0);
    expect(low.xpPerAction).toBeLessThan(200);
    expect(low.xph[1] / high.xph[1]).toBeCloseTo(low.xpPerAction! / 200);
    expect(low.costPerHour).toBeNull();
  });
  it('paid bone burying includes bank visits and supply costs, while collecting combat drops has no invented rate', () => {
    const bones = processRate(method('pr-banked-bones'), 'prayer', stateOf({ prayer: 1 }), { prices: prices({ Bones: 50 }, {}) })!;
    const big = processRate(method('pr-banked-big-bones'), 'prayer', stateOf({ prayer: 1 }), { prices: prices({ 'Big bones': 200 }, {}) })!;
    expect(bones.xph[1]).toBeCloseTo((28 * 4.5 * 3600) / (28 * 2 * 0.6 + 3));
    expect(big.xph[1] / bones.xph[1]).toBeCloseTo(15 / 4.5);
    expect(bones.costPerHour).toBeGreaterThan(0);
    expect(big.costPerHour).toBeGreaterThan(bones.costPerHour!);
    expect(method('pr-bury').xph).toBeNull();
    expect(method('pr-banked-big-bones').cost).toBe('cost');
    expect(method('pr-banked-big-bones').needs).toContainEqual({ type: 'item', name: 'Big bones', count: 28 });
  });
  it('Superheat uses spell timing and guaranteed iron output, respects Smithing, and equips owned rune substitutes', () => {
    const m = method('ma-superheat');
    const market = { prices: prices({ 'Iron ore': 10, 'Nature rune': 100, 'Fire rune': 5 }, { 'Iron bar': 200 }) };
    expect(processRate(m, 'magic', stateOf({ magic: 43, smithing: 14 }), market)).toBeNull();
    expect(processRate(m, 'magic', stateOf({ magic: 43 }), market)).toBeNull();
    const normal = processRate(m, 'magic', stateOf({ magic: 43, smithing: 15 }), market)!;
    const withStaff = buildPlayerState({ mode: 'f2p', stats: { magic: 43, smithing: 15 }, progress: emptyProgress(), questsDone: [], owned: null, connected: true,
      gear: { equipment: [{ id: 1387, name: 'Staff of fire', slot: 'weapon' }], inventory: [], coins: 0, bankCoins: 0 } });
    const staff = processRate(m, 'magic', withStaff, market)!;
    expect(normal.xpPerAction).toBe(53);
    expect(normal.xph[1]).toBeCloseTo((25 * 53 * 3600) / (25 * 3 * 0.6 + 3));
    expect(staff.xph).toEqual(normal.xph);
    expect(staff.costPerHour!).toBeLessThan(normal.costPerHour!);
    expect(staff.needs).toContainEqual({ type: 'item', name: 'Staff of fire', count: 1, equip: true });
    expect(staff.needs?.some((n) => n.type === 'item' && n.name === 'Fire rune')).toBe(false);
  });
});

describe('Runecraft uses an inventory action and the altar journey', () => {
  it('Money cannot borrow a neighbouring altar for a station-specific recipe', () => {
    const air = PROCESSING.stations.find((s) => s.label === 'Air Altar')!;
    const wrong = { ...air, label: 'Other altar' };
    const reg = { ...PROCESSING, stations: [wrong] };
    const state = stateOf({ runecraft: 1 });
    expect(processPace('Air rune', air.place, state, reg)).toBeNull();
    expect(processPace('Air rune', air.place, state)?.station).toBe('Air Altar');
    const two = processPace('Air rune', air.place, stateOf({ runecraft: 11 }))!;
    expect(two.seconds.fast).toBeCloseTo(processPace('Air rune', air.place, state)!.seconds.fast / 2);
  });
  it('keeps each rune at its own altar and directs the player to the surface ruins first', () => {
    for (const [id, level, label] of [['rc-air', 1, 'Air Altar'], ['rc-earth', 9, 'Earth Altar'], ['rc-fire', 14, 'Fire Altar'], ['rc-body', 20, 'Body Altar']] as const) {
      const r = processRate(method(id), 'runecraft', stateOf({ runecraft: level }))!;
      expect(r.spot?.label).toBe(label);
      expect(r.spot?.waypoints?.[0].y).toBeLessThan(4000);
      expect(r.spot?.place.y).toBeGreaterThan(4000);
      expect(r.spot?.bank).toBeTruthy();
      expect(r.xph[0]).toBeGreaterThan(0);
      expect(r.xph[1]).toBeLessThan(20000);
      expect(r.needs).toContainEqual(expect.objectContaining({ type: 'item', count: 27, anyOf: ['Pure essence'] }));
    }
  });
  it('a verified whole-batch action takes one tick for all essence, not a tick per essence', () => {
    const recipe = PROCESSING.recipes.find((r) => r.id === 'rc-air')!;
    const reg = { stations: [], recipes: [{ ...recipe, facility: null, access: undefined, station: undefined }], methods: { 'rc-air': ['rc-air'] } };
    const r = processRate(method('rc-air'), 'runecraft', stateOf({ runecraft: 1 }), {}, reg)!;
    expect(r.xph[1]).toBeCloseTo((28 * 5 * 3600) / (0.6 + 3));
  });
  it('an owned tiara is required worn and frees a slot; owned pure essence is reused', () => {
    const s = buildPlayerState({ mode: 'f2p', stats: { runecraft: 1 }, progress: emptyProgress(), questsDone: [], connected: true,
      gear: { equipment: [], inventory: [], coins: 0, bankCoins: 0 },
      owned: { bankSeen: true, items: new Map([
        ['air tiara', { name: 'Air tiara', carried: 0, noted: 0, bank: 1 }],
        ['pure essence', { name: 'Pure essence', carried: 0, noted: 0, bank: 100 }],
      ]) } });
    const r = processRate(method('rc-air'), 'runecraft', s)!;
    expect(r.needs).toContainEqual({ type: 'item', name: 'Air tiara', count: 1, equip: true });
    expect(r.needs).toContainEqual({ type: 'item', name: 'Pure essence', count: 28, anyOf: ['Rune essence'] });
  });
  it('multiple runes increase sale yield, never the XP per essence', () => {
    const p = { prices: prices({ 'Rune essence': 1, 'Pure essence': 2 }, { 'Air rune': 5 }) };
    const one = processRate(method('rc-air'), 'runecraft', stateOf({ runecraft: 1 }), p)!;
    const two = processRate(method('rc-air'), 'runecraft', stateOf({ runecraft: 11 }), p)!;
    expect(two.xph).toEqual(one.xph);
    expect(two.xpPerAction).toBe(5);
    expect(two.lootPerHour).toBeCloseTo(one.lootPerHour! * 2);
  });
});

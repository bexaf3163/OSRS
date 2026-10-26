// The processing engine (2.79): the wiki's recipes at the wiki's stations, held to the wiki's own guide rates; costs and gains by the shared rules; a
// new recipe or station inherits them. Synthetic recipes below exist only in this test.

import { describe, expect, it } from 'vitest';
import { PROCESSING, processRate, type ProcessingRegistry } from '../src/lib/processingRates';
import { trainingMethods, type TrainingMethod } from '../src/lib/trainingRouter';
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

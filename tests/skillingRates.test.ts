// The gathering engine (2.78): the wiki's own formula and worked examples, the tool the player really has, bank or drop by the shared keep rule and the
// objective, the best of every candidate spot, and the registry kept in step with the Skills catalogue. Synthetic spots below exist only in this test.

import { describe, expect, it } from 'vitest';
import { buildPlayerState, type PlayerState } from '../src/lib/playerState';
import { emptyProgress } from '../src/lib/progress';
import { nameKey } from '../src/lib/checklist';
import { cascade, skillChance } from '../src/lib/skillChance';
import { gatherRate, SKILLING, type SkillingRegistry } from '../src/lib/skillingRates';
import { adviseTraining, trainingMethods, type TrainingMethod } from '../src/lib/trainingRouter';
import type { PriceView } from '../src/lib/funding/quotes';
import { market } from './funding/market';

const method = (id: string) => trainingMethods.find((m) => m.id === id) as TrainingMethod;
/** A state with these levels and these items (bank checked): name → [carried, bank]. */
function stateOf(levels: Record<string, number>, items: Record<string, [number, number]>, mode: 'f2p' | 'members' = 'f2p', bankSeen = true): PlayerState {
  const owned = { bankSeen, items: new Map(Object.entries(items).map(([name, [carried, bank]]) => [nameKey(name), { name, carried, noted: 0, bank: bankSeen ? bank : null }])) };
  return buildPlayerState({ mode, stats: levels as never, progress: { ...emptyProgress(), levels }, owned: owned as never, gear: { equipment: [], inventory: [], coins: 0, bankCoins: 0 } as never, questsDone: [], connected: true });
}
/** A fixed exchange: these sell prices, and cowhides at 116 (the earning rate the keep rule compares with). */
const prices = (sell: Record<string, number>): PriceView => ({
  status: 'live', at: 1, idOf: () => undefined, limitOf: () => undefined, buy: () => null,
  sell: (name) => {
    const p = { Cowhide: 116, ...sell }[name];
    return p === undefined ? null : { price: p, basis: 'side', confidence: 'HIGH', ageMinutes: 0, volumePerHour: null, notes: [] };
  },
});
const mid = (r: { xph: [number, number] }) => (r.xph[0] + r.xph[1]) / 2;

describe('the skilling success function', () => {
  it('reproduces the wiki worked examples', () => {
    // "Skilling success rate": raw monkfish (48/90) at level 74 is 80/256; a leaping sturgeon (8/64) at 85 is 57/256.
    expect(skillChance(48, 90, 74)).toBeCloseTo(80 / 256, 6);
    expect(skillChance(8, 64, 85)).toBeCloseTo(57 / 256, 6);
    // The cascade: the salmon roll comes only after a failed sturgeon roll (wiki: 86/256 given that failure).
    const [sturgeon, salmon] = cascade([{ low: 8, high: 64, level: 70 }, { low: 16, high: 96, level: 58 }], 85);
    expect(sturgeon).toBeCloseTo(57 / 256, 6);
    expect(salmon).toBeCloseTo((1 - 57 / 256) * (86 / 256), 6);
    // A catch above the level is never rolled.
    expect(cascade([{ low: 8, high: 64, level: 70 }, { low: 16, high: 96, level: 58 }], 60)[0]).toBe(0);
  });
});

describe('the gathering engine on the real registry', () => {
  it('iron at 61 with a rune pickaxe, dropping: the wiki\'s "three ores every 12 ticks", about 50,000 XP an hour', () => {
    const r = gatherRate(method('mi-iron'), 'mining', stateOf({ mining: 61, attack: 40 }, { 'Rune pickaxe': [1, 0] }), { objective: 'fastest' })!;
    expect(r.basis).toBe('Rune pickaxe');
    expect(r.spot?.how).toBe('drop');
    expect(r.xph[1]).toBeGreaterThan(45_000);
    expect(r.xph[1]).toBeLessThan(56_000);
  });

  it('the tool the player has: a better axe is faster; while the bank is unread, no rate at all', () => {
    const bronze = gatherRate(method('wc-willow'), 'woodcutting', stateOf({ woodcutting: 45, attack: 40 }, { 'Bronze axe': [1, 0] }))!;
    const rune = gatherRate(method('wc-willow'), 'woodcutting', stateOf({ woodcutting: 45, attack: 40 }, { 'Rune axe': [1, 0] }))!;
    expect(mid(rune)).toBeGreaterThan(mid(bronze) * 1.5);
    // A Rune axe at Woodcutting 30 cannot be used: the bronze one it also has is the rate.
    expect(gatherRate(method('wc-willow'), 'woodcutting', stateOf({ woodcutting: 30 }, { 'Rune axe': [0, 1], 'Bronze axe': [1, 0] }))!.basis).toBe('Bronze axe');
    // Nothing seen and the bank never opened: an axe may be there, so the rate is unknown (the wiki's guide stays), not a Bronze axe guessed.
    expect(gatherRate(method('wc-willow'), 'woodcutting', stateOf({ woodcutting: 45 }, {}, 'f2p', false))).toBeNull();
    // A members tier kept from an old membership is not the tool on a free account.
    expect(gatherRate(method('wc-yew'), 'woodcutting', stateOf({ woodcutting: 70 }, { 'Dragon axe': [1, 0], 'Rune axe': [0, 1] }))!.basis).toBe('Rune axe');
    expect(gatherRate(method('wc-yew'), 'woodcutting', stateOf({ woodcutting: 70 }, { 'Dragon axe': [1, 0], 'Rune axe': [0, 1] }, 'members'))!.basis).toBe('Dragon axe');
  });

  it('yews pay for the bank on balance, never on the fastest objective; a restricted account cannot sell them', () => {
    const s = stateOf({ woodcutting: 70, attack: 40 }, { 'Rune axe': [1, 0] });
    const balanced = gatherRate(method('wc-yew'), 'woodcutting', s, { prices: market(), restriction: 'LIFTED', objective: 'balanced' })!;
    expect(balanced.spot?.how).toBe('bank');
    expect(balanced.loot).toBe('Yew logs');
    expect(balanced.lootPerHour!).toBeGreaterThan(1000);
    const fastest = gatherRate(method('wc-yew'), 'woodcutting', s, { prices: market(), restriction: 'LIFTED', objective: 'fastest' })!;
    expect(fastest.spot?.how).toBe('drop');
    expect(mid(fastest)).toBeGreaterThan(mid(balanced));
    const restricted = gatherRate(method('wc-yew'), 'woodcutting', s, { prices: market(), restriction: 'RESTRICTED', objective: 'balanced' })!;
    expect(restricted.lootPerHour).toBeUndefined();
  });

  it('no prices: nothing is banked for coins nobody can count', () => {
    const r = gatherRate(method('wc-yew'), 'woodcutting', stateOf({ woodcutting: 70, attack: 40 }, { 'Rune axe': [1, 0] }), {})!;
    expect(r.spot?.how).toBe('drop');
  });

  it('the Skills page carries the engine\'s spot, the time and the reason', () => {
    const s = stateOf({ fishing: 30, cooking: 30 }, { 'Fly fishing rod': [1, 0], Feather: [500, 0] });
    const a = adviseTraining({ skill: 'fishing', target: 40, state: s, mode: 'f2p', style: 'chill', priority: 'fastest' });
    expect(a.best?.method.id).toBe('fi-fly');
    expect(a.best?.method.rateSource).toBe('model');
    expect(a.best?.method.spot).toBeDefined();
    expect(a.reason).toMatch(/XP per hour for you/);
    expect(a.time?.source).toBe('model');
  });
});

// A synthetic tree: one product, one tool, two spots of the same size, one by a real bank and one far from it. Not game data.
const SYNTHETIC: SkillingRegistry = {
  tools: { axe: { skill: 'woodcutting', tiers: [{ item: 'Bronze axe', level: 1, wield: 1 }] } },
  resources: [{ id: 'test-tree', skill: 'woodcutting', object: 'Test tree', tool: 'axe', ticks: 4, cascade: false, lifetime: 'one',
    products: [{ name: 'Test logs', level: 1, xp: 50, respawn: [10, 10] }], byTool: { 'Bronze axe': { low: 128, high: 256 } } }],
  spots: [
    { resource: 'test-tree', label: 'Far grove', place: { x: 3093, y: 3100, plane: 0, label: 'Far grove' }, count: 6, members: false, bank: 'Draynor Bank' },
    { resource: 'test-tree', label: 'Bank grove', place: { x: 3095, y: 3200, plane: 0, label: 'Bank grove' }, count: 6, members: false, bank: 'Draynor Bank' },
    { resource: 'test-tree', label: 'Members grove', place: { x: 3095, y: 3240, plane: 0, label: 'Members grove' }, count: 12, members: true, bank: 'Draynor Bank' },
  ],
  methods: { 'wc-test': ['test-tree'] },
};
const TEST_METHOD = { id: 'wc-test', kind: 'method', skills: ['woodcutting'] } as unknown as TrainingMethod;

describe('a new gathering spot inherits the rules (synthetic registry)', () => {
  const s = (mode: 'f2p' | 'members' = 'f2p') => stateOf({ woodcutting: 40, attack: 40 }, { 'Bronze axe': [1, 0] }, mode);
  it('a valuable product: the spot by its bank wins, and banks', () => {
    const r = gatherRate(TEST_METHOD, 'woodcutting', s(), { prices: prices({ 'Test logs': 400 }), objective: 'balanced' }, SYNTHETIC)!;
    expect(r.spot).toMatchObject({ label: 'Bank grove', how: 'bank' });
  });
  it('a cheap product: dropped, and then the bank distance does not decide', () => {
    const r = gatherRate(TEST_METHOD, 'woodcutting', s(), { prices: prices({ 'Test logs': 1 }), objective: 'balanced' }, SYNTHETIC)!;
    expect(r.spot?.how).toBe('drop');
    expect(r.lootPerHour).toBeUndefined();
  });
  it('a members spot is offered only to members', () => {
    expect(gatherRate(TEST_METHOD, 'woodcutting', s('f2p'), { prices: prices({ 'Test logs': 400 }) }, SYNTHETIC)!.spot?.label).not.toBe('Members grove');
    expect(gatherRate(TEST_METHOD, 'woodcutting', s('members'), { prices: prices({ 'Test logs': 400 }) }, SYNTHETIC)!.spot?.label).toBe('Members grove');
  });
  it('a level below every product gives no rate', () => {
    const low: SkillingRegistry = { ...SYNTHETIC, resources: [{ ...SYNTHETIC.resources[0], products: [{ ...SYNTHETIC.resources[0].products[0], level: 50 }] }] };
    expect(gatherRate(TEST_METHOD, 'woodcutting', s(), {}, low)).toBeNull();
  });
});

describe('aggressive NPCs at a spot (the wiki aggression rule, one rule for every spot)', () => {
  const pick = { 'Rune pickaxe': [1, 0] as [number, number] };
  it('a better spot with monsters that attack the player loses to a safe one; a player they ignore may use it (synthetic)', () => {
    // The bank grove is better (by the bank) but has level 10 brutes: they attack combat 20 or lower.
    const reg: SkillingRegistry = { ...SYNTHETIC, spots: SYNTHETIC.spots.filter((x) => !x.members).map((x) => (x.label === 'Bank grove' ? { ...x, hostiles: [{ npc: 'Test brute', levels: [10], count: 3 }] } : x)) };
    const at = (lv: number) => gatherRate(TEST_METHOD, 'woodcutting', stateOf({ woodcutting: 40, attack: lv, strength: lv, defence: lv, hitpoints: lv }, { 'Bronze axe': [1, 0] }), { prices: prices({ 'Test logs': 400 }), objective: 'balanced' }, reg)!;
    expect(at(5).spot?.label).toBe('Far grove');
    expect(at(5).warning).toBeUndefined();
    expect(at(40).spot?.label).toBe('Bank grove');
  });
  it('on the real registry a weak player is never sent among the Al Kharid scorpions, at any Mining level', () => {
    for (let mining = 1; mining < 99; mining += 7) {
      for (const id of ['mi-ore', 'mi-iron']) {
        const r = gatherRate(method(id), 'mining', stateOf({ mining, attack: 3, strength: 3, defence: 3, hitpoints: 10 }, pick), { objective: 'fastest' });
        if (r) expect(r.spot?.label, `${id} at ${mining}`).not.toBe('Al Kharid mine');
      }
    }
  });
  it('an unknown combat level is never taken as safe', () => {
    const r = gatherRate(method('mi-iron'), 'mining', stateOf({ mining: 45 }, pick), { objective: 'fastest' })!;
    expect(r.spot?.label).not.toBe('Al Kharid mine');
  });
  it('when every spot has them, the best one is kept and says so once', () => {
    const hostile: SkillingRegistry = { ...SYNTHETIC, spots: SYNTHETIC.spots.filter((x) => !x.members).map((x) => ({ ...x, hostiles: [{ npc: 'Test brute', levels: [30], count: 2 }] })) };
    const r = gatherRate(TEST_METHOD, 'woodcutting', stateOf({ woodcutting: 40, attack: 1, strength: 1, defence: 1 }, { 'Bronze axe': [1, 0] }), {}, hostile)!;
    expect(r.warning).toBe('Test brutes (level 30) attack players of combat level 60 or lower');
  });
});

describe('the gathering registry and the Skills catalogue', () => {
  it('every free gathering method has resources with spots, and every listed method is a method of that skill', () => {
    const gathering = trainingMethods.filter((m) => m.kind === 'method' && !m.members && ['woodcutting', 'fishing', 'mining'].some((k) => m.skills.includes(k)));
    expect(gathering.filter((m) => !SKILLING.methods[m.id]).map((m) => m.id)).toEqual([]);
    for (const [id, list] of Object.entries(SKILLING.methods)) {
      const m = method(id);
      expect(m, id).toBeDefined();
      for (const rid of list) {
        const r = SKILLING.resources.find((x) => x.id === rid)!;
        expect(m.skills).toContain(r.skill);
        expect(SKILLING.spots.some((sp) => sp.resource === rid), `${rid} has a spot`).toBe(true);
      }
    }
  });
});

describe('the cowhide baseline is bounded', () => {
  it('banked coins never count for more than half the time, so a rich spot cannot outrank a much faster one on coins alone', async () => {
    const { coinTimeShare, COIN_SHARE_CAP } = await import('../src/lib/lootValue');
    expect(COIN_SHARE_CAP).toBe(0.5);
    expect(coinTimeShare(1e9, 100)).toBe(0.5);
    expect(coinTimeShare(3000, 100)).toBeCloseTo(0.5, 6);
    expect(coinTimeShare(600, 100)).toBeCloseTo(0.1, 6);
    expect(coinTimeShare(600, null)).toBe(0);
  });
});

describe('the path forecasts with the rates of the levels it reaches', () => {
  it('a later leg is rated by the model at its own level, not by the wiki next to today\'s model rates', () => {
    const s = stateOf({ woodcutting: 55, attack: 40 }, { 'Rune axe': [1, 0] });
    const a = adviseTraining({ skill: 'woodcutting', target: 75, state: s, mode: 'f2p', style: 'chill', priority: 'fastest' });
    expect(a.path.length).toBeGreaterThan(0);
    for (const leg of a.path) expect(leg.method.rateSource, `${leg.method.id} from ${leg.fromLevel}`).toBe('model');
  });
});

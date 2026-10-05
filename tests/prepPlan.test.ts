import { describe, expect, it } from 'vitest';
import { buildPrepPlan, BAG_SLOTS, stacks, type PrepPlan } from '../src/lib/prepPlan';
import { buildPlayerState } from '../src/lib/playerState';
import { planOneTrip } from '../src/lib/oneTrip';
import { readinessOf } from '../src/lib/readiness';
import { createReadinessEngine } from '../src/lib/readinessEngine';
import { contextOf } from '../src/lib/readiness';
import { emptyProgress } from '../src/lib/progress';
import { nameKey, type OwnedItem, type OwnedState } from '../src/lib/checklist';
import type { Step, WikiItemDetail } from '../src/types';
import type { UpgradeRecommendation } from '../src/services/gearUpgradeRouter';

const item = (nameEn: string, amount: string | number, extra: Record<string, unknown> = {}) => ({ nameEn, amount, howToGet: '', ...extra });
const mk = (id: string, items: ReturnType<typeof item>[], extra: Record<string, unknown> = {}): Step =>
  ({ id, stage: 1, type: 'combat', title: id, requires: [], itemsRequired: items, ...extra } as unknown as Step);

function owned(items: Record<string, Partial<OwnedItem>>, bankSeen: boolean): OwnedState {
  const map = new Map<string, OwnedItem>();
  for (const [name, o] of Object.entries(items)) map.set(nameKey(name), { name, carried: 0, noted: 0, ...o });
  return { bankSeen, items: map };
}

interface Opts { coins?: { bag: number; bank: number | null }; slots?: number; equipment?: { id: number; name: string; slot: string }[]; stats?: Record<string, number> }
const state = (o: OwnedState | null, opts: Opts = {}) =>
  buildPlayerState({
    mode: 'f2p', stats: opts.stats ?? null, progress: { levels: {} }, owned: o,
    gear: o || opts.coins || opts.equipment
      ? { equipment: opts.equipment ?? [], inventory: [], coins: opts.coins?.bag ?? null, bankCoins: opts.coins?.bank ?? null, ...(opts.slots !== undefined ? { inventorySlots: opts.slots } : {}) }
      : null,
    questsDone: null, connected: o !== null || opts.coins !== undefined,
  });

const steps = [
  mk('A1', [item('Lobster', 20), item('Hammer', 1), item('Feathers', 100, { inStep: true })], { foes: ['Cow'] }),
  mk('A2', [item('Lobster', 20), item('Silk', 1)]),
  mk('A3', [item('Rope', 1)]),
  mk('A4', [item('Bucket', 1)]),
  mk('A5', [item('Knife', 1)]),
];

function plan(s: ReturnType<typeof state>, opts: { upgrade?: UpgradeRecommendation | null; detail?: (id: number) => WikiItemDetail | undefined; list?: Step[]; id?: string } = {}): PrepPlan {
  const list = opts.list ?? steps;
  const step = list.find((x) => x.id === (opts.id ?? 'A1'))!;
  const progress = emptyProgress();
  return buildPrepPlan({
    step, steps: list, progress, state: s,
    trip: planOneTrip(list, progress, step.id, s),
    readiness: readinessOf(step, { steps: list, progress, qp: 0, mode: 'f2p', state: s }),
    upgrade: opts.upgrade, detail: opts.detail ?? (() => undefined),
  });
}

const line = (p: PrepPlan, name: string) => p.lines.find((l) => l.name === name)!;

describe('the preparation plan: where an item is and what to do with it', () => {
  it('in the bag — ready; in the bank — "take it" with an arrow to the bank; none — the source; worn — EQUIPPED', () => {
    const p = plan(state(owned({ Lobster: { carried: 20 }, Hammer: { carried: 0, bank: 1 }, Silk: { carried: 0, bank: 0 }, Rope: { carried: 1, bank: 0 }, Bucket: { carried: 0, bank: 0 }, Knife: { carried: 0, bank: 0 } }, true)));
    expect(line(p, 'Lobster')).toMatchObject({ where: 'INVENTORY', timing: 'NOW', priority: 'CRITICAL' });
    expect(line(p, 'Lobster').action).toBeUndefined();
    expect(line(p, 'Hammer')).toMatchObject({ where: 'BANK', priority: 'CRITICAL' });
    expect(line(p, 'Hammer').action).toMatchObject({ kind: 'TAKE', label: 'Take from the bank' });
    expect(line(p, 'Silk').where).toBe('MISSING');
    const eq = plan(state(owned({ Lobster: { carried: 20 }, Hammer: { carried: 1 } }, true), { equipment: [{ id: 1, name: 'Hammer', slot: 'weapon' }] }));
    expect(line(eq, 'Hammer').where).toBe('EQUIPPED');
  });

  it('unknown ≠ none: without the bank the item is UNKNOWN, the action "open the bank", not counted in readiness', () => {
    const p = plan(state(owned({ Lobster: { carried: 5 } }, false)));
    const l = line(p, 'Lobster');
    expect(l.where).toBe('UNKNOWN');
    expect(l.action).toMatchObject({ kind: 'CONNECT' });
    expect(l.action?.label).toContain('Open the bank');
    expect(p.score.unknown).toBeGreaterThan(0);
    expect(p.score.verdict).toBe('UNKNOWN');
    expect(p.score.critical).toBe(0);
    // No connection at all — we ask to connect RuneLite.
    const off = plan(state(null));
    expect(line(off, 'Lobster').action).toMatchObject({ kind: 'CONNECT', href: '#/settings' });
    expect(off.score.percent).toBeNull();
  });

  it('when it will be needed: now / while you are at it / during the step / "do not take now"', () => {
    const p = plan(state(owned({ Lobster: { carried: 40 }, Hammer: { carried: 1 }, Silk: { carried: 0, bank: 0 }, Rope: { carried: 0, bank: 0 }, Bucket: { carried: 0, bank: 0 }, Feathers: { carried: 0, bank: 0 } }, true)));
    expect(p.now).toEqual([]);
    expect(p.soon.map((l) => l.name)).toEqual(['Silk', 'Rope']);
    expect(p.byTheWay.map((l) => l.name)).toEqual(['Feathers']);
    expect(p.byTheWay[0].action).toMatchObject({ kind: 'GATHER' });
    expect(p.later.map((l) => l.name)).toEqual(['Bucket']);
    expect(line(p, 'Bucket')).toMatchObject({ timing: 'LATER', priority: 'IMPORTANT' });
    expect(p.have.map((l) => l.name).sort()).toEqual(['Hammer', 'Lobster']);
  });

  it('"why it is needed": for this step, in how many more, in how many steps, whether it heals', () => {
    const p = plan(state(owned({ Lobster: { carried: 0, bank: 0 }, Hammer: { carried: 1 }, Silk: { carried: 0, bank: 0 }, Rope: { carried: 0, bank: 0 }, Bucket: { carried: 0, bank: 0 } }, true)));
    expect(line(p, 'Lobster').why).toContain('Also needed in 1 next step');
    expect(line(p, 'Hammer').why).not.toContain('For this step');
    expect(line(p, 'Silk').why).toContain('Needed in A2, in 1 step');
    expect(line(p, 'Rope').why).toContain('in 2 steps');
    expect(line(p, 'Hammer').why).toContain('tool');
    const heal = [mk('H1', [item('Lobster', 20, { heals: 12 })]), steps[1]];
    const h = plan(state(owned({ Lobster: { carried: 0, bank: 0 } }, true)), { list: heal, id: 'H1' });
    expect(line(h, 'Lobster').why).toContain('heals +12 HP');
  });

  it('one thing is split by deadline: now the bag, then the bank; the ready one is shown once', () => {
    // 20 needed now and 20 in the next step; 20 in the bag, 20 in the bank.
    const p = plan(state(owned({ Lobster: { carried: 20, bank: 20 }, Hammer: { carried: 1 } }, true)));
    const rows = p.lines.filter((l) => l.name === 'Lobster');
    expect(rows.map((l) => [l.timing, l.where, l.count])).toEqual([['NOW', 'INVENTORY', 20], ['SOON', 'BANK', 20]]);
    expect(rows[1].action).toMatchObject({ kind: 'TAKE' });
    expect(p.have.filter((l) => l.name === 'Lobster').map((l) => l.count)).toEqual([20]);
    expect(p.soon.map((l) => l.name)).toContain('Lobster');
    // 40 in the bag — both deadlines are covered, the ready row is one.
    const full = plan(state(owned({ Lobster: { carried: 40 }, Hammer: { carried: 1 } }, true)));
    const have = full.have.filter((l) => l.name === 'Lobster');
    expect(have).toHaveLength(1);
    expect(have[0].count).toBe(40);
    // The bank was not opened: what the bag covers is known, the rest is "not checked".
    const partial = plan(state(owned({ Lobster: { carried: 20 } }, false)));
    expect(partial.lines.filter((l) => l.name === 'Lobster').map((l) => [l.timing, l.where])).toEqual([['NOW', 'INVENTORY'], ['SOON', 'UNKNOWN']]);
  });
});

describe('the preparation plan: consumables, money, sources', () => {
  it('enough / low / very low; on a combat step the threshold is stricter', () => {
    const fight = [steps[0]];
    const calm = [{ ...steps[0], foes: undefined } as Step];
    const base = (bag: number, list: Step[]) => plan(state(owned({ Lobster: { carried: bag, bank: 0 }, Hammer: { carried: 1 } }, true)), { list });
    expect(line(base(20, fight), 'Lobster').supply).toBe('ENOUGH');
    expect(line(base(12, fight), 'Lobster').supply).toBe('LOW');
    expect(line(base(8, fight), 'Lobster').supply).toBe('CRITICAL');
    // 8 of 20 is forty percent: for combat "very low", without combat only "low".
    expect(line(base(8, calm), 'Lobster').supply).toBe('LOW');
    expect(line(base(4, calm), 'Lobster').supply).toBe('CRITICAL');
    // A tool and single items are not consumables.
    expect(line(base(20, fight), 'Hammer').supply).toBeUndefined();
  });

  it('buy: the source and the price; not enough coins — "earn first", not an empty "buy"', () => {
    const detail = (): WikiItemDetail => ({ buyLocations: [{ shopName: "Bob's Axes", location: 'Lumbridge', price: 215 }] } as unknown as WikiItemDetail);
    const list = [mk('B1', [item('Steel axe', 1, { wikiItemId: 1 })])];
    const rich = plan(state(owned({ 'Steel axe': { carried: 0, bank: 0 } }, true), { coins: { bag: 500, bank: 0 } }), { list, id: 'B1', detail });
    expect(line(rich, 'Steel axe').action).toMatchObject({ kind: 'BUY', price: 215 });
    expect(line(rich, 'Steel axe').action?.label).toContain('215');
    const poor = plan(state(owned({ 'Steel axe': { carried: 0, bank: 0 } }, true), { coins: { bag: 100, bank: 0 } }), { list, id: 'B1', detail });
    expect(line(poor, 'Steel axe').action).toMatchObject({ kind: 'EARN' });
    expect(line(poor, 'Steel axe').action?.label).toContain('115');
    // The coins are unknown — we do not decide for the player: the "buy" advice stays.
    const unknownCoins = plan(state(owned({ 'Steel axe': { carried: 0, bank: 0 } }, true)), { list, id: 'B1', detail });
    expect(line(unknownCoins, 'Steel axe').action?.kind).toBe('BUY');
  });

  it('money for steps: not enough — the "earn" action, enough — no action, unknown — not counted', () => {
    const list = [mk('M1', [item('Coins', 2000)])];
    const short = plan(state(owned({}, true), { coins: { bag: 1240, bank: 0 } }), { list, id: 'M1' });
    expect(short.coins).toMatchObject({ need: 2000, have: 1240, missing: 760 });
    expect(short.coins.action?.kind).toBe('EARN');
    expect(short.score.critical).toBe(1);
    expect(short.score.verdict).toBe('NOT_READY');
    const ok = plan(state(owned({}, true), { coins: { bag: 1240, bank: 900 } }), { list, id: 'M1' });
    expect(ok.coins.action).toBeUndefined();
    expect(ok.score.verdict).toBe('READY');
    const unk = plan(state(owned({}, false), { coins: { bag: 100, bank: null } }), { list, id: 'M1' });
    expect(unk.coins.missing).toBeNull();
    expect(unk.score.verdict).toBe('UNKNOWN');
  });
});

describe('the preparation plan: readiness, slots, upgrades', () => {
  it('readiness in percent: only what can be checked is counted; the unknown — separately', () => {
    const all = plan(state(owned({ Lobster: { carried: 40 }, Hammer: { carried: 1 }, Silk: { carried: 1 }, Rope: { carried: 1 }, Bucket: { carried: 1 }, Feathers: { carried: 0, bank: 0 } }, true)));
    expect(all.score).toMatchObject({ percent: 100, critical: 0, important: 0, verdict: 'READY' });
    const part = plan(state(owned({ Lobster: { carried: 40 }, Hammer: { carried: 0, bank: 1 }, Silk: { carried: 0, bank: 0 }, Rope: { carried: 1 }, Bucket: { carried: 1 }, Feathers: { carried: 0, bank: 0 } }, true)));
    expect(part.score.critical).toBe(1);
    expect(part.score.important).toBe(1);
    expect(part.score.verdict).toBe('NOT_READY');
    expect(part.score.percent).toBe(Math.round((part.score.ready / part.score.total) * 100));
  });

  it('a missing level is a critical reason, not an item', () => {
    const step = mk('S1', [item('Lobster', 20)], { requirements: [{ type: 'skill', skill: 'ranged', min: 20 }] });
    const p = plan(state(owned({ Lobster: { carried: 20 } }, true), { stats: { ranged: 17 } }), { list: [step], id: 'S1' });
    expect(p.blockers.length).toBe(1);
    expect(p.blockers[0].label).toContain('Ranged');
    expect(p.score.critical).toBe(1);
  });

  it('bag space: whether everything fits; stacks (runes, arrows, coins) — one slot; unknown — we do not warn', () => {
    expect(stacks('Law rune')).toBe(true);
    expect(stacks('Bronze arrow')).toBe(true);
    expect(stacks('Coins')).toBe(true);
    expect(stacks('Lobster')).toBe(false);
    const list = [mk('T1', [item('Lobster', 20), item('Law rune', 30), item('Rope', 1)])];
    const base = owned({ Lobster: { carried: 0, bank: 40 }, 'Law rune': { carried: 0, bank: 30 }, Rope: { carried: 0, bank: 2 } }, true);
    const tight = plan(state(base, { slots: 10 }), { list, id: 'T1' });
    expect(tight.slots).toEqual({ used: 10, adding: 22, over: 22 + 10 - BAG_SLOTS });
    const roomy = plan(state(base, { slots: 3 }), { list, id: 'T1' });
    expect(roomy.slots.over).toBe(0);
    const unknown = plan(state(base), { list, id: 'T1' });
    expect(unknown.slots.used).toBeNull();
    expect(unknown.slots.over).toBe(0);
  });

  it('a tool upgrade — into "upgrades", not into the mandatory; does not affect readiness', () => {
    const up = { status: 'UPGRADE_AVAILABLE', skill: 'woodcutting', currentItem: 'Bronze axe', recommendedItem: 'Steel axe', approxCost: 215, npc: 'Bob', reason: 'Level 6 allows Steel axe' } as UpgradeRecommendation;
    const s = state(owned({ Lobster: { carried: 40 }, Hammer: { carried: 1 }, Silk: { carried: 1 }, Rope: { carried: 1 }, Bucket: { carried: 1 }, Feathers: { carried: 0, bank: 0 } }, true));
    const p = plan(s, { upgrade: up });
    expect(p.optimizations[0]).toMatchObject({ name: 'Steel axe', priority: 'OPTIMIZATION' });
    expect(p.optimizations[0].action?.label).toContain('Bob');
    expect(p.optimizations[0].why).toContain('Bronze axe');
    expect(p.score.optimizations).toBe(1);
    expect(p.score.verdict).toBe('READY');
    const poor = plan(s, { upgrade: { ...up, status: 'UPGRADE_NOT_AFFORDABLE' } });
    expect(poor.optimizations[0].action?.kind).toBe('EARN');
    expect(plan(s, { upgrade: { ...up, status: 'NO_UPGRADE' } }).optimizations).toEqual([]);
  });

  it('the recommended — "optional", and what is already owned is not shown', () => {
    const list = [mk('R1', [item('Lobster', 5)], { itemsRecommended: [item('Ring of recoil', 1), item('Knife', 1)] })];
    const p = plan(state(owned({ Lobster: { carried: 5 }, 'Ring of recoil': { carried: 0, bank: 1 }, Knife: { carried: 1 } }, true)), { list, id: 'R1' });
    expect(p.optimizations.map((l) => l.name)).toEqual(['Ring of recoil']);
    expect(p.optimizations[0].action?.kind).toBe('TAKE');
    expect(p.optimizations[0].priority).toBe('OPTIMIZATION');
  });
});

describe('the preparation plan: weight', () => {
  const calmStep = { id: 'W1', stage: 1, type: 'skill', title: 'Fishing', requires: [], mapLocation: { x: 3222, y: 3218, plane: 0, label: 'Lumbridge' }, itemsRequired: [item('Lobster', 5)] } as unknown as Step;
  const heavyState = (weight: number | undefined) => buildPlayerState({
    mode: 'f2p', stats: null, progress: { levels: {} }, owned: owned({ Lobster: { carried: 5 } }, true), questsDone: null, connected: true,
    gear: { equipment: [{ id: 1, name: 'Rune platebody', slot: 'body' }, { id: 2, name: 'Rune platelegs', slot: 'legs' }, { id: 3, name: 'Rune full helm', slot: 'head' }], inventory: [{ id: 4, name: 'Lobster', count: 5 }], coins: 100, bankCoins: 0, ...(weight !== undefined ? { weight } : {}) } as never,
  });

  it('a no-combat step and heavy armour: "take it off to the bank" counts as important and lowers readiness, the arrow leads to the bank', () => {
    const p = plan(heavyState(24), { list: [calmStep], id: 'W1' });
    expect(p.weight.level).toBe('HEAVY');
    expect(p.weight.items.map((i) => i.name)).toEqual(['Rune platebody', 'Rune platelegs', 'Rune full helm']);
    expect(p.weight.ratio).toBeGreaterThan(1.2);
    expect(p.weight.action).toMatchObject({ kind: 'TAKE' });
    expect(p.score.important).toBeGreaterThanOrEqual(1);
    expect(p.score.percent).toBeLessThan(100);
  });

  it('a combat step — weight is not discussed; the items the step needs are not offered to the bank', () => {
    const fight = { ...calmStep, foes: ['Cow'] } as Step;
    expect(plan(heavyState(24), { list: [fight], id: 'W1' }).weight.level).toBe('NONE');
    const needsArmor = { ...calmStep, itemsRequired: [item('Lobster', 5), item('Rune platebody', 1), item('Rune platelegs', 1), item('Rune full helm', 1)] } as unknown as Step;
    expect(plan(heavyState(24), { list: [needsArmor], id: 'W1' }).weight.items).toEqual([]);
  });
});

describe('the preparation plan: the engine', () => {
  it('one calculation per state snapshot: a repeated request — from memory, another state — anew', () => {
    const s = state(owned({ Lobster: { carried: 20 } }, true));
    const ctx = contextOf({ step: steps[0], steps, progress: emptyProgress(), qp: 0, mode: 'f2p', stats: null, owned: s.owned, gear: null });
    const engine = createReadinessEngine(ctx);
    const a = engine.plan(steps[0]);
    const b = engine.plan(steps[0]);
    expect(a).toBe(b);
    expect(engine.computed.plan).toBe(1);
    expect(engine.plan(steps[0], { ahead: 1 })).not.toBe(a);
    expect(engine.computed.plan).toBe(2);
  });
});

describe('made items: the ingredients are planned too (Goblin Diplomacy, Orange dye)', () => {
  const dye = [mk('G1', [item('Blue dye', 1), item('Orange dye', 1)])];
  const held = (o: Record<string, Partial<OwnedItem>>) => state(owned({ 'Blue dye': { carried: 1 }, 'Orange dye': { carried: 0, bank: 0 }, 'Red dye': { carried: 0, bank: 0 }, 'Yellow dye': { carried: 0, bank: 0 }, ...o }, true));

  it('a missing Orange dye brings its Red dye, with an arrow to Aggie; the Yellow dye in the bag is not repeated', () => {
    const p = plan(held({ 'Yellow dye': { carried: 1 } }), { list: dye, id: 'G1' });
    expect(line(p, 'Orange dye')).toMatchObject({ where: 'MISSING' });
    expect(line(p, 'Red dye')).toMatchObject({ where: 'MISSING', timing: 'NOW', priority: 'IMPORTANT', action: { kind: 'GATHER' } });
    expect(line(p, 'Red dye').action?.nav?.label).toMatch(/Aggie/);
    expect(p.lines.find((l) => l.name === 'Yellow dye')).toBeUndefined();
    expect(p.now.map((l) => l.name)).toContain('Red dye');
  });

  it('with both ingredients missing both are listed; with the Orange dye in the bag, neither', () => {
    const none = plan(held({}), { list: dye, id: 'G1' });
    expect(none.lines.filter((l) => l.key.startsWith('recipe:')).map((l) => l.name).sort()).toEqual(['Red dye', 'Yellow dye']);
    const have = plan(held({ 'Orange dye': { carried: 1 } }), { list: dye, id: 'G1' });
    expect(have.lines.some((l) => l.key.startsWith('recipe:'))).toBe(false);
  });

  it('a bank that was not opened leaves the ingredients "not checked", never missing', () => {
    const p = plan(state(owned({ 'Blue dye': { carried: 1 } }, false)), { list: dye, id: 'G1' });
    expect(line(p, 'Red dye').where).toBe('UNKNOWN');
  });
});

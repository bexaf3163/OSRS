// The in-game helper (V2.4): the departure check, quick options by stats, the GE bulk list and what goes to the plugin.

import { describe, expect, it } from 'vitest';
import type { Progress, Step, StepItemRequirement } from '../src/types';
import { evaluatePreflight, nameKey, parseAmount, parseOwned, preflightItems, type OwnedState } from '../src/lib/checklist';
import { evaluateBranches, evaluateCondition, reasonLabel, watchedItems, type BranchContext } from '../src/lib/branching';
import { aggregateShopping, carryOverFrom, plural, shoppingText } from '../src/lib/shopping';
import { parseStats, toInGameTarget } from '../src/services/runeliteBridge';
import { stepsFor } from '../src/data';

const item = (nameEn: string, amount: string | number, extra: Partial<StepItemRequirement> = {}): StepItemRequirement =>
  ({ nameEn, amount, howToGet: '', ...extra });

const step = (id: string, items: StepItemRequirement[], extra: Partial<Step> = {}): Step =>
  ({ id, stage: 2, type: 'quest', title: id, requires: [], doneWhen: '', itemsRequired: items, ...extra });

const owned = (bankSeen: boolean, rows: { name: string; carried?: number; noted?: number; bank?: number }[]): OwnedState =>
  parseOwned({ type: 'OWNED', bankSeen, items: rows.map((r) => ({ carried: 0, noted: 0, ...r })) })!;

const progress = (extra: Partial<Progress> = {}): Progress =>
  ({ version: 3, steps: {}, levels: {}, notes: {}, updatedAt: '', ...extra });

describe('the quantity from the route', () => {
  it('numbers, "23 (…)", "20+", "1,000" and non-numbers', () => {
    expect(parseAmount(5)).toBe(5);
    expect(parseAmount('23 (20 to hand in, 3 for the bank)')).toBe(23);
    expect(parseAmount('20+')).toBe(20);
    expect(parseAmount('1 000')).toBe(1000);
    expect(parseAmount('1,000')).toBe(1000);
    expect(parseAmount('As many as you have')).toBeNull();
    expect(parseAmount('One per alchemy')).toBeNull();
    expect(parseAmount(0)).toBeNull();
  });
});

describe('the departure check', () => {
  const rope = item('Rope', 1, { wikiItemId: 954 });
  const items = preflightItems(step('S7-01', [rope]));

  it('0/1 — missing, but there is one in the bank', () => {
    const r = evaluatePreflight(items, owned(true, [{ name: 'Rope', bank: 2 }]));
    expect(r.rows[0]).toMatchObject({ have: 0, inBank: 2, state: 'MISSING_FROM_BAG' });
    expect(r.ready).toBe(false);
  });

  it('1/1 — ready to leave', () => {
    const r = evaluatePreflight(items, owned(false, [{ name: 'Rope', carried: 1 }]));
    expect(r.rows[0].state).toBe('IN_BAG_READY');
    expect(r.ready).toBe(true);
  });

  it('a stack: coins are counted by quantity, banknotes do not count', () => {
    const coins = preflightItems(step('S2-09', [item('Coins', 90, { wikiItemId: 995 })]));
    expect(evaluatePreflight(coins, owned(false, [{ name: 'Coins', carried: 120 }])).ready).toBe(true);
    // Lobsters cannot be had as banknotes — in the bag there are still 0.
    const food = preflightItems(step('S5-08', [item('Lobster', '20+', { heals: 12 })]));
    const r = evaluatePreflight(food, owned(false, [{ name: 'Lobster', noted: 50 }]));
    expect(r.rows[0]).toMatchObject({ have: 0, state: 'MISSING_FROM_BAG' });
    expect(r.rows[0].item).toMatchObject({ count: 20, exact: true, heals: 12 });
  });

  it('several of the same: 2/5 chicken', () => {
    const chicken = preflightItems(step('S1-09', [item('Cooked chicken', 5, { heals: 3 })]));
    const r = evaluatePreflight(chicken, owned(true, [{ name: 'Cooked chicken', carried: 2, bank: 10 }]));
    expect(r.rows[0]).toMatchObject({ have: 2, inBank: 10, state: 'MISSING_FROM_BAG' });
  });

  it('none, and not in the bank', () => {
    const r = evaluatePreflight(items, owned(true, [{ name: 'Rope', carried: 0 }]));
    expect(r.rows[0]).toMatchObject({ inBank: 0, state: 'NOT_FOUND_IN_BANK' });
  });

  it('the bank was not opened — we do not claim "not in the bank"', () => {
    const r = evaluatePreflight(items, owned(false, []));
    expect(r.rows[0]).toMatchObject({ inBank: null, state: 'MISSING_FROM_BAG' });
  });

  it('a full set, the name is case-insensitive', () => {
    const kit = preflightItems(step('S2-08', [item('Hammer', 1), item('Beer', 1, { inStep: true }), item('Garlic', 1)]));
    // Beer is bought in the step itself — we do not require it at the bank.
    expect(kit.map((i) => i.nameEn)).toEqual(['Hammer', 'Garlic']);
    const r = evaluatePreflight(kit, owned(true, [{ name: 'HAMMER', carried: 1 }, { name: 'garlic', carried: 1 }]));
    expect(r.ready).toBe(true);
    expect(r.missing).toBe(0);
  });

  it('a bank from a saved earlier session is marked with the write time; garbage instead of a time is ignored', () => {
    expect(parseOwned({ bankSeen: true, bankSavedAt: 1_700_000_000_000, items: [] })?.bankSavedAt).toBe(1_700_000_000_000);
    expect(parseOwned({ bankSeen: true, items: [] })?.bankSavedAt).toBeUndefined();
    for (const bad of ['yesterday', -5, 0, NaN, null]) expect(parseOwned({ bankSeen: true, bankSavedAt: bad, items: [] })?.bankSavedAt, String(bad)).toBeUndefined();
  });

  it('garbage in the OWNED event is dropped', () => {
    const o = parseOwned({ bankSeen: true, items: [{ name: 'Rope', carried: -3, bank: 'x' }, null, { carried: 1 }] })!;
    expect(o.items.get(nameKey('rope'))).toMatchObject({ carried: 0, noted: 0 });
    // An unclear quantity in the bank — "unknown", not zero.
    expect(o.items.get(nameKey('rope'))!.bank).toBeUndefined();
    expect(o.items.size).toBe(1);
    expect(parseOwned({ items: 'none' })).toBeNull();
  });
});

describe('quick options by stats', () => {
  const teleport = step('S2-05', [], {
    branches: [{ id: 'varrock-teleport', label: 'Varrock Teleport', condition: { type: 'SKILL_LEVEL', skill: 'magic', minLevel: 25 } }],
  });
  const canoe = step('S1-09', [], {
    branches: [{ id: 'canoe-log', label: 'Canoe', condition: { type: 'SKILL_LEVEL', skill: 'woodcutting', minLevel: 12 } }],
  });
  const ctx = (stats: Record<string, number> | null, extra: Partial<BranchContext> = {}): BranchContext =>
    ({ stats, progress: progress(), steps: [], owned: null, ...extra });

  it('Magic 24 — the usual way, Magic 25 — the teleport', () => {
    expect(evaluateBranches(teleport, ctx({ magic: 24 }))[0]).toMatchObject({ status: 'locked', have: 24, need: 25 });
    const r = evaluateBranches(teleport, ctx({ magic: 25 }))[0];
    expect(r).toMatchObject({ status: 'available', source: 'runelite' });
    expect(reasonLabel(r)).toBe('you have Magic 25 (from the game)');
  });

  it('Woodcutting 11 — on foot, 12 — a canoe', () => {
    expect(evaluateBranches(canoe, ctx({ woodcutting: 11 }))[0].status).toBe('locked');
    expect(evaluateBranches(canoe, ctx({ woodcutting: 12 }))[0].status).toBe('available');
  });

  it('without RuneLite — the level entered by hand; without it — unknown', () => {
    expect(evaluateBranches(teleport, ctx(null, { progress: progress({ levels: { magic: 30 } }) }))[0])
      .toMatchObject({ status: 'available', source: 'manual' });
    expect(evaluateBranches(teleport, ctx(null))[0].status).toBe('unknown');
    // The level from the game wins over the one entered by hand.
    expect(evaluateBranches(teleport, ctx({ magic: 20 }, { progress: progress({ levels: { magic: 30 } }) }))[0].status).toBe('locked');
  });

  it('a quest by progress and an item by the game data', () => {
    const quests = [step('S9-01', [], { title: 'Lost City' })];
    const done = ctx(null, { steps: quests, progress: progress({ steps: { 'S9-01': 'done' } }) });
    expect(evaluateCondition({ type: 'QUEST_COMPLETED', questName: 'Lost City' }, done).status).toBe('available');
    expect(evaluateCondition({ type: 'QUEST_COMPLETED', questName: 'Lost City' }, ctx(null, { steps: quests })).status).toBe('locked');
    const chronicle = { type: 'ITEM_OWNED' as const, itemName: 'Chronicle' };
    expect(evaluateCondition(chronicle, ctx(null)).status).toBe('unknown');
    expect(evaluateCondition(chronicle, ctx(null, { owned: owned(true, [{ name: 'Chronicle', bank: 1 }]) })).status).toBe('available');
    expect(evaluateCondition(chronicle, ctx(null, { owned: owned(false, [{ name: 'Chronicle' }]) })).status).toBe('unknown');
    expect(evaluateCondition(chronicle, ctx(null, { owned: owned(true, [{ name: 'Chronicle' }]) })).status).toBe('locked');
  });

  it('levels from the bridge: only sensible numbers', () => {
    expect(parseStats({ magic: 25, woodcutting: 12, attack: 'x', agility: 0, prayer: 2.5 })).toEqual({ magic: 25, woodcutting: 12 });
    expect(parseStats(null)).toBeNull();
    expect(parseStats({})).toBeNull();
  });
});

describe('the GE bulk list', () => {
  it('Rope ×1 + Rope ×1 + Hammer ×1 → Rope ×2, Hammer ×1', () => {
    const list = aggregateShopping([
      step('A', [item('Rope', 1, { wikiItemId: 954 })]),
      step('B', [item('Rope', 1, { wikiItemId: 954 })]),
      step('C', [item('Hammer', 1, { wikiItemId: 2347 })]),
    ]);
    expect(list.required.map((l) => [l.nameEn, l.count])).toEqual([['Rope', 2], ['Hammer', 1]]);
    expect(list.required[0].sources.map((s) => s.stepId)).toEqual(['A', 'B']);
  });

  it('the same item from an earlier step is not counted twice', () => {
    const list = aggregateShopping([
      step('S2-01', [item('Iron bar', 2, { wikiItemId: 2351 })]),
      step('S2-07', [item('Iron bar', 2, { wikiItemId: 2351, howToGet: 'From step S2-01.' })]),
    ]);
    expect(list.required[0].count).toBe(2);
    expect(list.required[0].sources[1].carryOver).toBe(true);
    // If S2-01 is not selected (already done), the item from S2-07 is counted.
    expect(aggregateShopping([step('S2-07', [item('Iron bar', 2, { wikiItemId: 2351, howToGet: 'From step S2-01.' })])]).required[0].count).toBe(2);
  });

  it('a tool — one for all steps; two rows in one step add up', () => {
    const list = aggregateShopping([
      step('S4-04', [item('Lobster pot', 1, { wikiItemId: 301 })]),
      step('S4-05', [item('Lobster pot', 1, { wikiItemId: 301 }), item('Lobster pot', 1, { wikiItemId: 301 }), item('Hammer', 1)]),
      step('S5-06', [item('Hammer', 1)]),
    ]);
    expect(list.required.find((l) => l.nameEn === 'Lobster pot')!.count).toBe(2);
    expect(list.required.find((l) => l.nameEn === 'Hammer')!.count).toBe(1);
  });

  it('by ID, otherwise by name; coins — separately; the recommended without repeats', () => {
    const list = aggregateShopping([
      step('A', [item('Beer', 1, { wikiItemId: 1917 }), item('Coins', 90, { wikiItemId: 995 })], { itemsRecommended: [item('beer', 1), item('Garlic', 1)] }),
      step('B', [item('beer', 2), item('Coins', 2000)]),
    ]);
    expect(list.required).toHaveLength(1);
    expect(list.required[0]).toMatchObject({ nameEn: 'Beer', count: 3, id: 1917 });
    expect(list.coins).toBe(2090);
    expect(list.recommended.map((l) => l.nameEn)).toEqual(['Garlic']);
  });

  it('the purchases of a shopping step are purchases, not "you will get it on the way"', () => {
    const list = aggregateShopping([step('S2-01', [item('Red bead', 1, { inStep: true })], { type: 'gear' })]);
    expect(list.required[0].inStepOnly).toBe(false);
  });

  it('a quantity that is not a number and "only during the step"', () => {
    const list = aggregateShopping([step('S2-13', [item('Feather', 'As many as you have'), item('Egg', 1, { inStep: true })])]);
    expect(list.required[0]).toMatchObject({ nameEn: 'Feather', count: 1, exact: false, inStepOnly: false });
    expect(list.required[1]).toMatchObject({ nameEn: 'Egg', inStepOnly: true });
  });

  it('references to earlier steps from the route are recognised', () => {
    expect(carryOverFrom(item('Beads', 1, { howToGet: 'From step S2-01.' }))).toBe('S2-01');
    expect(carryOverFrom(item('Silk', 1, { howToGet: 'From S4-05: from the silk trader' }))).toBe('S4-05');
    expect(carryOverFrom(item('Wool', 3, { howToGet: 'The ones saved from S1-04!' }))).toBe('S1-04');
    expect(carryOverFrom(item('Flour', 1, { howToGet: 'The spare one from step S1-03.' }))).toBe('S1-03');
    expect(carryOverFrom(item('Rope', 1, { howToGet: 'Buy from Ned for 18 gp.' }))).toBeNull();
  });

  it('the number of items with the English plural', () => {
    const w = (n: number) => `${n} ${plural(n, 'item', 'items')}`;
    expect([1, 3, 5, 11, 21, 31, 44, 112].map(w)).toEqual(['1 item', '3 items', '5 items', '11 items', '21 items', '31 items', '44 items', '112 items']);
  });

  it('the text for the exchange', () => {
    expect(shoppingText('GE', [{ nameEn: 'Iron bar', buy: 2, exact: true }, { nameEn: 'Feather', buy: 1, exact: false }, { nameEn: 'Rope', buy: 0, exact: true }], 2500))
      .toBe('GE\nIron bar x2\nFeather x1+\nCoins ~2,500 gp (for the steps themselves)');
  });

  it('the real route: stage 2 of F2P without double counting', () => {
    const steps = stepsFor('f2p').filter((s) => s.stage === 2);
    const list = aggregateShopping(steps);
    const keys = list.required.map((l) => l.key);
    expect(new Set(keys).size).toBe(keys.length);
    // The beads are bought in S2-01, Imp Catcher (S2-02) takes the same ones — one each, not two each.
    expect(list.required.find((l) => l.nameEn === 'Red bead')!.count).toBe(1);
    // Iron bars: 2 in S2-01, in The Knight's Sword — the same ones.
    expect(list.required.find((l) => l.nameEn === 'Iron bar')!.count).toBe(2);
  });
});

describe('what goes to the plugin', () => {
  const steps = stepsFor('f2p');
  const byId = (id: string) => steps.find((s) => s.id === id)!;

  it('the HUD target, the departure check without "during the step" items', () => {
    const p = toInGameTarget(byId('S2-08'))!;
    expect(p.goal).toBe("Morgan's house in Draynor Village");
    expect(p.checklist!.map((i) => i.name)).toEqual(['Hammer']);
    expect(p.checklist![0]).toMatchObject({ id: 2347, count: 1 });
  });

  it('the waypoints of The Restless Ghost', () => {
    const p = toInGameTarget(byId('S1-06'))!;
    expect(p.pathWaypoints).toHaveLength(5);
    // The amulet is given by Father Urhney during the quest — we do not require it at the bank.
    expect(p.checklist).toBeUndefined();
  });

  it('the chosen quick option replaces the point and removes the waypoints of the usual way', () => {
    const s = byId('S2-05');
    const branch = s.branches!.find((b) => b.id === 'varrock-teleport')!;
    const p = toInGameTarget(s, branch)!;
    expect(p.worldPoint).toMatchObject({ x: 3213, y: 3424, plane: 0 });
    // The point caption already starts with the variant name — we do not repeat it.
    expect(p.goal).toBe('Varrock Teleport — the square by the fountain');
    const ghost = byId('S1-06');
    const fake = { id: 'x', label: 'X', condition: { type: 'SKILL_LEVEL' as const, skill: 'magic', minLevel: 1 }, replacementTarget: { x: 3200, y: 3200, plane: 0, label: 'Y' } };
    expect(toInGameTarget(ghost, fake)!.pathWaypoints).toBeUndefined();
  });

  it('items from the conditions — to the plugin for counting', () => {
    expect(watchedItems(byId('S2-01'))).toEqual(['Chronicle']);
    expect(toInGameTarget(byId('S2-01'))!.watchItems).toEqual(['Chronicle']);
  });

  it('a step with only items also goes to the game — for the departure check', () => {
    const p = toInGameTarget(step('S9-99', [item('Rope', 1)]));
    expect(p?.checklist).toEqual([{ name: 'Rope', id: undefined, count: 1, heals: undefined }]);
  });
});

describe('a quick option checks that what is needed is on hand (Varrock Teleport runes)', () => {
  const real = stepsFor('f2p').find((s) => s.id === 'S2-05')!;
  const ctx = (o: OwnedState | null): BranchContext => ({ stats: { magic: 25 }, progress: progress(), steps: [], owned: o });
  const runes = (law: number, air: number, fire: number, bankSeen = true) => owned(bankSeen, [
    { name: 'Law rune', carried: law }, { name: 'Air rune', carried: air }, { name: 'Fire rune', carried: fire },
    { name: 'Staff of air' }, { name: 'Staff of fire' },
  ]);

  it('in the data: every Varrock Teleport has runes, every canoe an axe', () => {
    const all = stepsFor('members').concat(stepsFor('f2p'));
    const tele = all.flatMap((s) => (s.branches ?? []).filter((b) => b.id === 'varrock-teleport'));
    expect(tele.length).toBeGreaterThanOrEqual(5);
    for (const b of tele) expect(b.needs?.map((n) => n.label)).toEqual(['Law rune', 'Air rune', 'Fire rune']);
    const canoe = all.flatMap((s) => (s.branches ?? []).filter((b) => b.id.startsWith('canoe')));
    for (const b of canoe) expect(b.needs?.[0].label).toBe('any axe');
  });

  it('Magic 25, but no runes and the bank was opened — missing, exactly', () => {
    const r = evaluateBranches(real, ctx(runes(0, 0, 0)))[0];
    expect(r.status).toBe('available');
    expect(r.missing).toEqual([
      { label: 'Law rune', have: 0, need: 1, certain: true },
      { label: 'Air rune', have: 0, need: 3, certain: true },
      { label: 'Fire rune', have: 0, need: 1, certain: true },
    ]);
  });

  it('the bank was not opened — "maybe in the bank", not exact', () => {
    const r = evaluateBranches(real, ctx(runes(0, 3, 1, false)))[0];
    expect(r.missing).toEqual([{ label: 'Law rune', have: 0, need: 1, certain: false }]);
  });

  it('runes present — no warning; a staff of air replaces the air runes', () => {
    expect(evaluateBranches(real, ctx(runes(1, 3, 1)))[0].missing).toBeUndefined();
    const staff = owned(true, [{ name: 'Law rune', carried: 1 }, { name: 'Air rune' }, { name: 'Fire rune', carried: 1 }, { name: 'Staff of air', carried: 1 }]);
    expect(evaluateBranches(real, ctx(staff))[0].missing).toBeUndefined();
  });

  it('without the bridge we do not invent items: the option is available without a "missing" mark', () => {
    const r = evaluateBranches(real, ctx(null))[0];
    expect(r.status).toBe('available');
    expect(r.missing).toBeUndefined();
  });

  it('the plugin gets both the runes and the staffs — so that it counts them', () => {
    const w = watchedItems(real);
    expect(w).toEqual(expect.arrayContaining(['Law rune', 'Air rune', 'Fire rune', 'Staff of air']));
    expect(toInGameTarget(real)!.watchItems).toEqual(w);
  });
});

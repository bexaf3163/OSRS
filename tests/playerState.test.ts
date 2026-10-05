import { describe, expect, it } from 'vitest';
import { buildPlayerState, coinsOf, diffPlayerState, heldOf, levelOf, questOf, type PlayerStateInput } from '../src/lib/playerState';
import { describe as describeReq, evaluate, type Requirement } from '../src/lib/requirements';
import { nameKey, type OwnedItem, type OwnedState } from '../src/lib/checklist';
import type { GearState } from '../src/services/runeliteBridge';

function owned(items: Record<string, Partial<OwnedItem>>, bankSeen: boolean): OwnedState {
  const map = new Map<string, OwnedItem>();
  for (const [name, o] of Object.entries(items)) map.set(nameKey(name), { name, carried: 0, noted: 0, ...o });
  return { bankSeen, items: map };
}

const gear = (over: Partial<GearState> = {}): GearState => ({ equipment: [], inventory: [], coins: 0, bankCoins: null, ...over });

function state(over: Partial<PlayerStateInput> = {}) {
  return buildPlayerState({ mode: 'f2p', stats: null, progress: { levels: {} }, owned: null, gear: null, questsDone: null, ...over });
}

describe('the single player state', () => {
  it('the level from the game wins over the one entered by hand; no data — unknown, not 1', () => {
    const s = state({ stats: { ranged: 17 }, progress: { levels: { ranged: 30, magic: 25 } } });
    expect(levelOf(s, 'ranged')).toBe(17);
    expect(levelOf(s, 'magic')).toBe(25);
    expect(levelOf(s, 'fishing')).toBeUndefined();
  });

  it('an item: the bank was not opened and not in the bag — UNKNOWN, not MISSING; the bank is open and empty — MISSING', () => {
    expect(heldOf(state({ owned: owned({}, false) }), 'Lobster').presence).toBe('UNKNOWN');
    expect(heldOf(state({ owned: owned({ Lobster: { carried: 0 } }, false) }), 'Lobster').presence).toBe('UNKNOWN');
    expect(heldOf(state({ owned: owned({ Lobster: { carried: 0, bank: 0 } }, true) }), 'Lobster').presence).toBe('MISSING');
    // The plugin does not watch everything: no record — not "no item" but "not watched".
    expect(heldOf(state({ owned: owned({}, true) }), 'Lobster').presence).toBe('UNKNOWN');
    expect(heldOf(state({ owned: owned({ Lobster: { carried: 5, bank: 8 } }, true) }), 'Lobster')).toMatchObject({ presence: 'PRESENT', bag: 5, bank: 8, total: 13 });
    expect(heldOf(state({ owned: null }), 'Lobster').presence).toBe('UNKNOWN');
  });

  it('the manual "already have" mark counts when the game knows nothing about the item', () => {
    const s = state({ progress: { levels: {}, ownedManual: { 'name:rope': { count: 2 } } }, owned: owned({}, false) });
    expect(heldOf(s, 'Rope', 'name:rope')).toMatchObject({ presence: 'PRESENT', total: 2, source: 'manual' });
  });

  it('quests and coins: the unknown stays unknown', () => {
    expect(questOf(state(), "Cook's Assistant")).toBe('UNKNOWN');
    expect(questOf(state({ questsDone: ["Cook's Assistant"] }), "cook's assistant")).toBe('DONE');
    expect(questOf(state({ questsDone: [] }), "Cook's Assistant")).toBe('NOT_DONE');
    expect(coinsOf(state({ gear: gear({ coins: 300 }) }))).toEqual({ bag: 300, bank: null, total: null });
    expect(coinsOf(state({ gear: gear({ coins: 300, bankCoins: 700 }) })).total).toBe(1000);
    expect(coinsOf(state()).bag).toBeNull();
  });

  it('snapshots: changes of levels, items, coins and quests; "unknown → known" is not a gain', () => {
    const a = state({ stats: { defence: 27 }, owned: owned({ Lobster: { carried: 5 } }, false), gear: gear({ coins: 850 }), questsDone: [] });
    const b = state({
      stats: { defence: 30 }, owned: owned({ Lobster: { carried: 8 }, 'Rune full helm': { carried: 1 } }, false),
      gear: gear({ coins: 2150 }), questsDone: ['Dragon Slayer I'],
    });
    const d = diffPlayerState(a, b);
    expect(d).toContainEqual({ kind: 'LEVEL', skill: 'defence', from: 27, to: 30 });
    expect(d).toContainEqual({ kind: 'COINS', where: 'bag', from: 850, to: 2150 });
    expect(d).toContainEqual({ kind: 'ITEM', name: 'Lobster', from: 5, to: 8 });
    expect(d).toContainEqual({ kind: 'ITEM', name: 'Rune full helm', from: 0, to: 1 });
    expect(d).toContainEqual({ kind: 'QUEST', name: 'Dragon Slayer I' });
    expect(diffPlayerState(a, a)).toEqual([]);
    expect(diffPlayerState(null, a)).toEqual([]);
    // The data from the game appeared for the first time — that is not "the level went up".
    expect(diffPlayerState(state(), state({ stats: { defence: 30 } })).some((c) => c.kind === 'LEVEL')).toBe(false);
  });

  it('the fingerprint does not change with the order and changes with the content', () => {
    const a = state({ stats: { a: 1, b: 2 } });
    const b = state({ stats: { b: 2, a: 1 } });
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.fingerprint).not.toBe(state({ stats: { a: 1, b: 3 } }).fingerprint);
  });
});

describe('the unified requirements', () => {
  const ev = (r: Requirement, s = state()) => evaluate(r, s).state;

  it('Coif requires 20 Ranged: 17 — no (3 short), 20 — fine', () => {
    const coif: Requirement = { type: 'skill', skill: 'ranged', min: 20 };
    expect(evaluate(coif, state({ stats: { ranged: 17 } }))).toMatchObject({ state: 'MISSING', missing: 3 });
    expect(ev(coif, state({ stats: { ranged: 20 } }))).toBe('OK');
    expect(ev(coif)).toBe('UNKNOWN');
  });

  it('an item: in the bag OK, in the bank BANK, part PARTIAL, none MISSING, bank not open UNKNOWN', () => {
    const food: Requirement = { type: 'item', name: 'Lobster', count: 20 };
    expect(ev(food, state({ owned: owned({ Lobster: { carried: 25 } }, false) }))).toBe('OK');
    expect(ev(food, state({ owned: owned({ Lobster: { carried: 5, bank: 15 } }, true) }))).toBe('BANK');
    expect(ev(food, state({ owned: owned({ Lobster: { carried: 5, bank: 8 } }, true) }))).toBe('PARTIAL');
    expect(ev(food, state({ owned: owned({ Lobster: { carried: 0, bank: 0 } }, true) }))).toBe('MISSING');
    expect(ev(food, state({ owned: owned({ Lobster: { carried: 5 } }, false) }))).toBe('UNKNOWN');
  });

  it('worn: worn OK; in the bag or bank — BANK ("wear it"); none — MISSING; without a connection — UNKNOWN', () => {
    const helm: Requirement = { type: 'equipment', name: 'Coif', slot: 'head' };
    expect(ev(helm, state({ gear: gear({ equipment: [{ id: 1169, name: 'Coif', slot: 'head' }] }), owned: owned({}, true) }))).toBe('OK');
    expect(evaluate(helm, state({ gear: gear(), owned: owned({ Coif: { carried: 1 } }, true) })).detail).toContain('wear it');
    expect(ev(helm, state({ gear: gear(), owned: owned({ Coif: { carried: 0, bank: 0 } }, true) }))).toBe('MISSING');
    expect(ev(helm)).toBe('UNKNOWN');
  });

  it('money: enough in the bag, the rest in the bank, not enough, bank unknown', () => {
    const m: Requirement = { type: 'money', amount: 2000 };
    expect(ev(m, state({ gear: gear({ coins: 2500 }) }))).toBe('OK');
    expect(ev(m, state({ gear: gear({ coins: 300, bankCoins: 1800 }) }))).toBe('BANK');
    expect(evaluate(m, state({ gear: gear({ coins: 300, bankCoins: 700 }) }))).toMatchObject({ state: 'MISSING', missing: 1000 });
    expect(ev(m, state({ gear: gear({ coins: 300 }) }))).toBe('UNKNOWN');
    expect(ev(m)).toBe('UNKNOWN');
  });

  it('a group of alternatives: trout 5 + salmon 10 with 20 needed — 15 held, 5 short', () => {
    const food: Requirement = { type: 'alternative', requiredCount: 20, alternatives: [{ name: 'Trout' }, { name: 'Salmon' }] };
    const s = state({ owned: owned({ Trout: { carried: 5 }, Salmon: { carried: 10 } }, true) });
    expect(evaluate(food, s)).toMatchObject({ state: 'PARTIAL', have: 15, missing: 5 });
    expect(ev(food, state({ owned: owned({ Trout: { carried: 20 } }, false) }))).toBe('OK');
    expect(ev(food, state({ owned: owned({ Trout: { carried: 5 } }, false) }))).toBe('UNKNOWN');
  });

  it('composite: all — the worst outcome, any — the best; a quest and a mode', () => {
    const all: Requirement = { type: 'composite', all: [{ type: 'skill', skill: 'ranged', min: 20 }, { type: 'skill', skill: 'magic', min: 25 }] };
    expect(ev(all, state({ stats: { ranged: 25, magic: 10 } }))).toBe('MISSING');
    expect(ev(all, state({ stats: { ranged: 25, magic: 30 } }))).toBe('OK');
    const any: Requirement = { type: 'composite', any: [{ type: 'skill', skill: 'ranged', min: 20 }, { type: 'skill', skill: 'magic', min: 25 }] };
    expect(ev(any, state({ stats: { ranged: 5, magic: 30 } }))).toBe('OK');
    expect(ev({ type: 'quest', quest: 'Dragon Slayer I' }, state({ questsDone: ['Dragon Slayer I'] }))).toBe('OK');
    expect(ev({ type: 'gameMode', mode: 'members' }, state({ mode: 'f2p' }))).toBe('MISSING');
    expect(ev({ type: 'gameMode', mode: 'f2p' }, state({ mode: 'members' }))).toBe('OK');
    expect(describeReq(all)).toBe('Ranged 20 and Magic 25');
  });
});

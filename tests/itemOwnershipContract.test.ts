import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseOwned, evaluatePreflight } from '../src/lib/checklist';
import { buildPlayerState, heldOf } from '../src/lib/playerState';
import { evaluate } from '../src/lib/requirements';
import { ownedFood, combatPlanView } from '../src/lib/combatPlan';
import { combatReadiness } from '../src/lib/combatReadiness';
import { stepById } from '../src/data';
import { gearById } from '../src/services/gearAdvisor';

const cases = JSON.parse(readFileSync(new URL('../runelite-bridge/src/test/resources/item-ownership.json', import.meta.url), 'utf8')) as {
  name: string; mining: number; bank: unknown[] | null; rows: Record<string, unknown>[];
}[];
const state = (rows: Record<string, unknown>[], bankSeen = true, mining = 41) => buildPlayerState({
  mode: 'f2p', stats: { mining }, progress: { levels: {} }, owned: parseOwned({ bankSeen, items: rows }), gear: null, questsDone: null,
});

describe('the shared Java to TS ownership contract', () => {
  it('one Rune pickaxe is one generic tool, even when several tier names were watched', () => {
    const s = state(cases[0].rows);
    expect(heldOf(s, 'Bronze pickaxe')).toMatchObject({ bag: 1, total: 1 });
    expect(heldOf(s, 'Rune pickaxe')).toMatchObject({ bag: 1, total: 1 });
    expect(evaluate({ type: 'item', name: 'Bronze pickaxe', count: 2 }, s).state).toBe('PARTIAL');
    expect(evaluatePreflight([{ nameEn: 'Bronze pickaxe', count: 2, exact: true, alt: ['Iron pickaxe', 'Steel pickaxe', 'Rune pickaxe'] }], s.owned!).ready).toBe(false);
  });

  it('old substituted records do not get summed again, without requiring a protocol bump', () => {
    const rows = cases[0].rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith('exact'))));
    const s = state(rows);
    expect(heldOf(s, 'Bronze pickaxe')).toMatchObject({ bag: 1, total: 1 });
    expect(evaluatePreflight([{ nameEn: 'Bronze pickaxe', count: 2, exact: true, alt: ['Iron pickaxe', 'Steel pickaxe', 'Rune pickaxe'] }], s.owned!).rows[0].have).toBe(1);
    // Old clients still see all their original fields in the additive fixture.
    expect(cases[0].rows[0]).toMatchObject({ carried: 1, exactCarried: 0 });
  });

  it('an owned tool above the skill level does not make a generic tool ready; an unread bank is unknown', () => {
    const s = state(cases[2].rows, false, 10);
    expect(heldOf(s, 'Rune pickaxe').total).toBe(1);
    expect(evaluate({ type: 'item', name: 'Bronze pickaxe', count: 1 }, s).state).toBe('UNKNOWN');
    expect(evaluatePreflight([{ nameEn: 'Bronze pickaxe', count: 1, exact: true, alt: ['Rune pickaxe'] }], s.owned!, { mining: 10 }).ready).toBe(false);
    expect(s.owned?.items.get('rune pickaxe')?.bank).toBeUndefined();
  });

  it('notes count as owned, but are an explicit bank action before food can be used', () => {
    const s = state(cases[1].rows);
    expect(heldOf(s, 'Salmon')).toMatchObject({ bag: 3, noted: 20, bank: 5, total: 28 });
    expect(evaluate({ type: 'item', name: 'Salmon', count: 20 }, s)).toMatchObject({ state: 'BANK', have: 28 });
    expect(evaluate({ type: 'alternative', requiredCount: 20, alternatives: [{ name: 'Salmon' }] }, s).state).toBe('BANK');
    const food = ownedFood({ itemsRequired: [{ nameEn: 'Salmon', amount: 20, howToGet: '', heals: 9 }] }, s.owned)!;
    expect(food).toMatchObject({ carried: 3, carriedEq: 3, notedEq: 20, bankEq: 5, equivalent: 28 });
  });

  it('notes alone are actionable even before the bank is read, rather than an unnecessary purchase', () => {
    const s = state([{ name: 'Salmon', carried: 0, noted: 20 }], false);
    expect(evaluate({ type: 'item', name: 'Salmon', count: 20 }, s)).toMatchObject({ state: 'BANK' });
  });

  it('does not silently downgrade a malformed exact record to inflated legacy counts', () => {
    const s = state([{ name: 'Bronze pickaxe', carried: 10, noted: 0, bank: 10, exactCarried: 'bad', exactNoted: 0 }]);
    expect(heldOf(s, 'Bronze pickaxe').presence).toBe('UNKNOWN');
  });
});

describe('combat food ownership versus readiness', () => {
  it('the real combat readiness uses usable food and recommends unnoting instead of buying owned notes', () => {
    const s = state([{ name: 'Salmon', carried: 0, noted: 40, bank: 0 }]);
    const step = stepById.get('S3-08')!;
    const piece = [...gearById.values()].find((p) => p.name === 'Mithril scimitar')!;
    const gear = { equipment: [{ id: piece.id, name: piece.name, slot: 'weapon' }], inventory: [], coins: 0, bankCoins: 0 };
    const view = combatPlanView(step, { stats: { attack: 22, strength: 16, defence: 1, hitpoints: 22 }, gear, owned: s.owned })!;
    const r = combatReadiness(step, view, gear, true)!;
    expect(r.food).toMatchObject({ carried: 0, unnote: view.nextTrip, short: view.nextTrip, fromBank: 0, toBuy: 0 });
    expect(r.food.text).toMatch(/unnote.*Banknotes cannot be eaten/);
  });
});

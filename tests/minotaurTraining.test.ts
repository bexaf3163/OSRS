import { describe, expect, it } from 'vitest';
import { allSteps, stepById } from '../src/data';
import { stepReadiness } from '../src/lib/readiness';
import { emptyProgress } from '../src/lib/progress';
import { nameKey, type OwnedItem, type OwnedState } from '../src/lib/checklist';
import { pacingLevels, pacingText } from '../src/lib/pacing';
import { toInGameTarget, type GearState, type PacingState } from '../src/services/runeliteBridge';
import { isOverworld, isSeparateArea } from '../src/lib/instances';
import { navigationTarget } from '../src/lib/navigation';

// S3-08 after the owner's report of 2026-10-15 ("nothing shows what to do", "nothing about food, just kill minotaurs") and the combat brief:
// Strength first on Aggressive, the level 12 Minotaurs, food and Strength potions, what to do in the game. The numbers in the step's text are estimates
// from the wiki stats (Minotaur level 12: Attack 12, Defence 10, all defences -21, 10 hit points, max hit 2; level 27: Attack 23, Defence 25,
// defences -10, 22 hit points, max hit 3) and the melee formulas, with the live account's gear (iron armour, crush defence +39, Defence 1).

const s = stepById.get('S3-08')!;
const FOOD = ['Salmon', 'Trout', 'Tuna', 'Lobster', 'Swordfish'];

/** The game's report: the named items, the alternatives watched with them (zero unless given). */
function owned(items: Record<string, [carried: number, bank?: number]>, bankSeen: boolean): OwnedState {
  const map = new Map<string, OwnedItem>();
  for (const n of ['Mithril scimitar', ...FOOD]) map.set(nameKey(n), { name: n, carried: 0, noted: 0, ...(bankSeen ? { bank: 0 } : {}) });
  for (const [n, [carried, bank]] of Object.entries(items)) map.set(nameKey(n), { name: n, carried, noted: 0, ...(bankSeen ? { bank: bank ?? 0 } : {}) });
  return { bankSeen, items: map };
}
const gear = (bankSeen: boolean): GearState => ({ equipment: [{ id: 1329, name: 'Mithril scimitar' }], inventory: [], coins: 0, bankCoins: bankSeen ? 7811 : null });
const readiness = (o: OwnedState) =>
  stepReadiness({ step: s, steps: allSteps, progress: emptyProgress(), qp: 40, mode: 'f2p', stats: { attack: 22, strength: 16, defence: 1, hitpoints: 19 }, owned: o, gear: gear(o.bankSeen) });
const foodRow = (o: OwnedState) => readiness(o).requirements.find((r) => r.item === 'Salmon')!;

describe('S3-08 readiness: not "ready" with an empty bag', () => {
  it('the scimitar worn and no food: items are missing, and the food row says so', () => {
    const r = readiness(owned({ 'Mithril scimitar': [1] }, true));
    expect(r.status).toBe('MISSING_ITEM');
    expect(foodRow(owned({ 'Mithril scimitar': [1] }, true))).toMatchObject({ state: 'MISSING', label: 'Salmon ×20 (or Trout, Tuna…)' });
  });

  it('alternative fish must cover the same healing: weak pieces alone are not enough', () => {
    expect(readiness(owned({ 'Mithril scimitar': [1], Trout: [20] }, true)).status).toBe('MISSING_ITEM');
    expect(readiness(owned({ 'Mithril scimitar': [1], Trout: [26] }, true)).status).toBe('READY');
    expect(readiness(owned({ 'Mithril scimitar': [1], Salmon: [12], Trout: [8] }, true)).status).toBe('MISSING_ITEM');
    expect(readiness(owned({ 'Mithril scimitar': [1], Salmon: [12], Trout: [11] }, true)).status).toBe('READY');
  });

  it('the live bag of 2026-10-15 (5 Salmon): short with the bank read, "not checked" while the bank is unread', () => {
    expect(foodRow(owned({ 'Mithril scimitar': [1], Salmon: [5] }, true))).toMatchObject({ state: 'PARTIAL' });
    expect(readiness(owned({ 'Mithril scimitar': [1], Salmon: [5] }, true)).status).toBe('MISSING_ITEM');
    // The bank holds the rest: one trip to the bank, not a purchase.
    expect(foodRow(owned({ 'Mithril scimitar': [1], Salmon: [5, 30] }, true))).toMatchObject({ state: 'BANK' });
    // Unread bank: never "none".
    expect(foodRow(owned({ 'Mithril scimitar': [1], Salmon: [5] }, false)).state).toBe('UNKNOWN');
  });

  it('the Strength potions and the amulet are advice, not a gate', () => {
    expect((s.itemsRecommended ?? []).map((i) => i.nameEn)).toEqual(['Strength potion(4)', 'Amulet of strength', 'Adamant scimitar']);
    expect((s.itemsRequired ?? []).map((i) => i.nameEn)).toEqual(['Mithril scimitar', 'Salmon']);
  });
});

describe('S3-08 in the game: what to do', () => {
  const p = toInGameTarget(s)!;

  it('the game counts every fish that is food here, so "short" is never a guess', () => {
    expect(p.watchItems).toEqual(expect.arrayContaining(FOOD.slice(1)));
  });

  it('"What you need" lists the scimitar and the food (with its alternatives); the last line is the fight itself', () => {
    expect(p.guide!.items.map((i) => i.name)).toEqual(['Mithril scimitar', 'Salmon']);
    expect(p.guide!.items[1]).toMatchObject({ count: 20, alt: FOOD.slice(1) });
    const fight = p.guide!.steps!.at(-1)!;
    expect(fight).toMatch(/level 12 Minotaurs/);
    expect(fight).toMatch(/Aggressive \(Slash\) to Strength 20, then Accurate \(Chop\) to Attack 30/);
    expect(fight).toMatch(/Eat at 4 health/);
    expect(fight).toMatch(/Strength potion/);
  });

  it('the pace goes to the game with each goal: Strength 20 first, Attack 30 after', () => {
    expect(p.pacing).toMatchObject({ skill: 'strength', also: ['attack'], targetLevel: 20, goals: { attack: { level: 30 } } });
    expect(p.completionTrigger).toMatchObject({ type: 'SKILL_LEVEL', levels: [{ skill: 'strength', level: 20 }, { skill: 'attack', level: 30 }] });
  });
});

describe('S3-08 where: the entrance on the surface, the level 12 room inside', () => {
  const p = toInGameTarget(s)!;

  it('the game route ends at the level 12 Minotaurs (the wiki spawns of the middle room), the entrance first; the goal line says where', () => {
    expect(p.pathWaypoints!.map((w) => [w.x, w.y])).toEqual([[3081, 3420], [1876, 5216]]);
    expect(isSeparateArea(p.pathWaypoints![1])).toBe(true);
    expect(p.goal).toBe('Stronghold of Security floor 1: the level 12 Minotaurs');
  });

  it('the step anchor stays the surface entrance: the map and the travel advice between steps plan from it', () => {
    expect(isOverworld(s.mapLocation)).toBe(true);
    expect(navigationTarget(s)).toMatchObject({ x: 3081, y: 3420, source: 'step' });
    expect(navigationTarget(s)!.instanced).toBeUndefined();
  });

  it('a target inside a separate area is never drawn on the world map', () => {
    const inside = { label: 'Minotaurs', x: 1876, y: 5216, plane: 0, stepId: 'S3-08' };
    expect(navigationTarget(s, { navTarget: inside })).toMatchObject({ instanced: true });
  });
});

describe('S3-08 pace line in the app, the same words as the plugin', () => {
  const base: PacingState = {
    stepId: 'S3-08', skill: 'strength', targetLevel: 20, xp: 3070, remainingXp: 1400, actionsLeft: 35,
    actionsPerMinute: null, etaSeconds: null, estimated: false, almost: false, done: false, left: ['attack'],
  };
  const all = ['strength', 'attack'] as const;

  it('names the style to fight with', () => {
    expect(pacingText(base, 'minotaur|minotaurs', all, pacingLevels(s.pacing!))).toBe('35 minotaurs to 20 Strength on Aggressive');
  });

  it('at Strength 20 it says which style comes next', () => {
    expect(pacingText({ ...base, done: true, actionsLeft: 0 }, 'minotaur|minotaurs', all, pacingLevels(s.pacing!))).toBe('✓ 20 Strength - next Attack: switch to Accurate');
  });

  it('both goals reached: each with its own level', () => {
    const done = { ...base, skill: 'attack' as const, targetLevel: 30, done: true, actionsLeft: 0, left: [] };
    expect(pacingText(done, 'minotaur|minotaurs', all, pacingLevels(s.pacing!))).toBe('✓ Target levels reached: 20 Strength, 30 Attack');
  });
});

describe('S3-08 says what the numbers say', () => {
  const text = JSON.stringify(s);

  it('the level 12 Minotaurs, and why: twice the food per XP at level 27, never "the same defence"', () => {
    expect(s.where).toMatch(/level 12 Minotaurs/);
    expect(text).toMatch(/twice the food/);
    expect(text).not.toMatch(/same (slash )?defence/i);
  });

  it('every estimate is called an estimate', () => {
    const fields = Object.fromEntries((s.fields ?? []).map((f) => [f.label, f.text]));
    expect(fields.Food).toMatch(/an estimate/);
    expect(fields['Which Minotaurs']).toMatch(/an estimate/);
    expect(fields.Pace).toMatch(/estimate/);
    expect(s.how).toMatch(/an estimate/);
  });
});

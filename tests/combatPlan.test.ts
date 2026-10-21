import { describe, expect, it } from 'vitest';
import { stepById } from '../src/data';
import { combatPlanView, chooseVariant, ownedFood } from '../src/lib/combatPlan';
import { estimateStep } from '../src/lib/combatEstimate';
import { nameKey, type OwnedItem, type OwnedState } from '../src/lib/checklist';
import { gearById } from '../src/services/gearAdvisor';
import type { GearState } from '../src/services/runeliteBridge';

// The minotaur example of the brief: S3-08 from Attack 22 / Strength 16, Defence 1, 22 health, Mithril scimitar and iron armour,
// 13 Salmon and 3 Lobsters in the bank. Trip, whole goal, reserve, owned and deficit are separate numbers; the level 27 Minotaur is
// its own estimate.

const s = stepById.get('S3-08')!;
const id = (n: string) => [...gearById.values()].find((p) => p.name === n)!.id;
const gear: GearState = {
  equipment: ['Mithril scimitar', 'Iron full helm', 'Iron platebody', 'Iron plateskirt', 'Iron kiteshield'].map((n) => ({ id: id(n), name: n })),
  inventory: [], coins: 0, bankCoins: 5000,
};
const stats = { attack: 22, strength: 16, defence: 1, hitpoints: 22 };
const xp = { attack: 5624, strength: 2746, defence: 0, hitpoints: 2000 };
function owned(items: Record<string, [number, number]>, bankSeen = true): OwnedState {
  const map = new Map<string, OwnedItem>();
  // These fixtures represent a complete tracked-food response, including explicit absent alternatives.
  const food = s.itemsRequired!.find(i => i.heals)!;
  for (const n of [food.nameEn, ...(food.anyOf ?? [])]) map.set(nameKey(n), { name: n, carried: 0, noted: 0, bank: bankSeen ? 0 : undefined });
  for (const [n, [carried, bank]] of Object.entries(items)) map.set(nameKey(n), { name: n, carried, noted: 0, bank });
  return { bankSeen, items: map };
}

describe('S3-08: the food plan', () => {
  const v = combatPlanView(s, { stats, xp, gear, owned: owned({ Salmon: [0, 13], Lobster: [0, 3] }) })!;

  it('plans for the level 12 Minotaur and shows the level 27 one beside it', () => {
    expect(v.primary.foe.combat).toBe(12);
    expect(v.compare).toHaveLength(1);
    expect(v.compare[0]).toMatch(/^Minotaur \(level 27\) instead: 108 kills/);
  });

  it('next trip, whole goal, plan, owned and deficit', () => {
    expect(v.nextTrip).toBe(26);
    expect(v.total.low).toBeLessThan(v.total.high);
    expect(v.total.low).toBeGreaterThan(v.nextTrip);
    expect(v.plan).toBe(v.total.high);
    expect(v.owned).toMatchObject({ bank: 16, equivalent: 13 + 4, text: '13 Salmon, 3 Lobster' });
    expect(v.buy).toBe(v.plan - 17);
  });

  it('two phases, the trips and the basis are said', () => {
    expect(v.phases[0]).toMatch(/^Strength 16 → 20 \(Aggressive\): 44 kills/);
    expect(v.phases[1]).toMatch(/^Attack 22 → 30 \(Accurate\): 194 kills/);
    expect(v.trips).toMatch(/trips$/);
    expect(v.basis).toBe('estimate from the combat formulas');
  });

  it('Strength potions with the Mithril scimitar alone: said plainly that they would not help', () => {
    expect(v.potion).toMatch(/^12 Strength potion doses would not speed this up/);
    const amulet: GearState = { ...gear, equipment: [...gear.equipment!, { id: id('Amulet of strength'), name: 'Amulet of strength' }] };
    expect(combatPlanView(s, { stats, xp, gear: amulet, owned: owned({}) })!.potion).toMatch(/^12 Strength potion doses save about/);
  });

  it('the bank not seen: no deficit invented', () => {
    const b = combatPlanView(s, { stats, xp, gear, owned: owned({ Salmon: [5, 0] }, false) })!;
    expect(b.buy).toBeNull();
    expect(b.owned!.carried).toBe(5);
  });

  it('no game data or an unknown weapon: no plan', () => {
    expect(combatPlanView(s, { stats: null, xp, gear, owned: null })).toBeNull();
    expect(combatPlanView(s, { stats, xp, gear: null, owned: null })).toBeNull();
    expect(combatPlanView(s, { stats, xp, gear: { ...gear, equipment: [{ id: 99999, name: 'Strange sword', slot: 'weapon' }] }, owned: null })).toBeNull();
    expect(combatPlanView(stepById.get('S5-03')!, { stats, xp, gear, owned: null })).toBeNull();
  });

  it('S4-03 Hill Giants get a plan of their own', () => {
    const a = combatPlanView(stepById.get('S4-03')!, {
      stats: { attack: 30, strength: 20, defence: 1, hitpoints: 25 }, xp: { attack: 13363, strength: 4470, defence: 0 },
      gear: { ...gear, equipment: [{ id: id('Adamant scimitar'), name: 'Adamant scimitar' }, ...gear.equipment!.slice(1)] }, owned: owned({}),
    })!;
    expect(a.primary.foe.name).toBe('Hill Giant');
    expect(a.primary.kills).toBe(Math.ceil((37224 - 13363) / 140));
    expect(a.compare).toEqual([]);
  });
});

describe('the parts', () => {
  it('owned food counts the alternatives by healing', () => {
    expect(ownedFood(s, owned({ Trout: [2, 7], Swordfish: [1, 0] }))).toMatchObject({ carried: 3, bank: 7, equivalent: Math.floor((9 * 7 + 14) / 9) });
  });

  it('the variant: the least food among those near the fastest', () => {
    const list = estimateStep(s, { stats, xp, gear });
    expect(chooseVariant(list)!.foe.combat).toBe(12);
    expect(chooseVariant([])).toBeNull();
  });
});

describe('the fights from the game', () => {
  const at = (combat: number, kills: number, secondsEach: number, damageEach: number) =>
    ({ name: 'Minotaur', combat, kills, seconds: kills * secondsEach, damage: kills * damageEach });

  it('the version being fought is planned for, once it has enough kills', () => {
    const few = combatPlanView(s, { stats, xp, gear, owned: owned({}), fights: [at(27, 5, 20, 12)] })!;
    expect(few.primary.foe.combat).toBe(12);
    const many = combatPlanView(s, { stats, xp, gear, owned: owned({}), fights: [at(27, 25, 20, 12), at(12, 3, 8, 3)] })!;
    expect(many.primary.foe.combat).toBe(27);
    expect(many.basis).toBe('estimate adjusted by your measured kills');
    expect(many.measured).toBe('25 kills measured in the game: 20.0 s and 12.0 damage taken a kill (counted in).');
  });

  it('heavier measured hits mean more food, faster kills less time', () => {
    const base = combatPlanView(s, { stats, xp, gear, owned: owned({}) })!;
    const perKill = (base.primary.totalMinutes.mid * 60) / base.primary.kills;
    const hurt = combatPlanView(s, { stats, xp, gear, owned: owned({}), fights: [at(12, 40, perKill / 2, 8)] })!;
    expect(hurt.primary.foe.combat).toBe(12);
    expect(hurt.total.mid).toBeGreaterThan(base.total.mid);
    expect(hurt.primary.combatMinutes.mid).toBeLessThan(base.primary.combatMinutes.mid);
  });
});

// T11: the whole-goal arrow count from the wiki's ranged formulas, the opponents' standard ranged defence and the bows' and arrows' bonuses.
import { describe, expect, it } from 'vitest';
import { arrowsForGoal, ARROW_BREAK, goalArrows, methodFoe, RANGED_GEAR } from '../src/lib/rangedAmmo';
import { trainingMethods } from '../src/lib/trainingRouter';
import { buildPlayerState } from '../src/lib/playerState';
import { emptyProgress } from '../src/lib/progress';
import { nameKey } from '../src/lib/checklist';
import type { GearItem } from '../src/services/runeliteBridge';
import { COMBAT_FOES } from '../src/lib/combatEstimate';
import { xpForLevel } from '../src/lib/xp';

const foe = (name: string, version?: string) => COMBAT_FOES.find((f) => f.name === name && (!version || f.version === version))!;

describe('the data the count reads', () => {
  it('every trainer of the Ranged methods has a standard ranged defence; bows have a speed, arrows a ranged strength', () => {
    for (const [n, v] of [['Seagull', 'Level 3'], ['Monk', 'Level 5'], ['Giant frog', 'Level 13'], ['Flesh Crawler', 'Level 28']] as const) {
      expect(foe(n, v).defence.ranged, n).toBeTypeOf('number');
    }
    for (const b of RANGED_GEAR.filter((i) => /bow$/.test(i.name))) expect(b.speed, b.name).toBeGreaterThan(0);
    for (const a of RANGED_GEAR.filter((i) => /arrow$/.test(i.name))) expect(a.rangedStrength, a.name).toBeGreaterThan(0);
  });
});

describe('arrows for a Ranged goal', () => {
  it('the hand-worked case: Ranged 1, Shortbow and Bronze arrows on Rapid against a level 3 Seagull', () => {
    // Effective level 1 + 0 + 8 = 9; max hit floor(0.5 + 9 × 71 / 640) = 1; attack roll 9 × 72 = 648; Seagull (Defence 1, ranged -42):
    // 10 × 22 = 220, hit chance 1 - 222 / 1298 ≈ 0.829. A 10-hit-point Seagull at max hit 1 takes 10 / 0.829 ≈ 12.1 shots.
    const one = arrowsForGoal({ xp: 0, goalLevel: 2, bow: 'Shortbow', arrow: 'Bronze arrow', worn: [], foe: foe('Seagull', 'Level 3') })!;
    const damage = xpForLevel(2) / 4;
    expect(one.shots.mid).toBe(Math.round((damage / 10) * (10 / (1 - 222 / 1298))));
    expect(one.lostPickingUp.mid).toBe(Math.round(one.shots.mid * ARROW_BREAK));
  });

  it('better arrows on the same goal need fewer shots; metal armour costs accuracy, so more', () => {
    const base = { xp: xpForLevel(30), goalLevel: 40, bow: 'Maple shortbow', worn: [] as string[], foe: foe('Giant frog', 'Level 13') };
    const iron = arrowsForGoal({ ...base, arrow: 'Iron arrow' })!;
    const adamant = arrowsForGoal({ ...base, arrow: 'Adamant arrow' })!;
    expect(adamant.shots.mid).toBeLessThan(iron.shots.mid);
    const plate = arrowsForGoal({ ...base, arrow: 'Adamant arrow', worn: ['Iron platebody', 'Iron platelegs'] })!;
    expect(plate.shots.mid).toBeGreaterThan(adamant.shots.mid);
    expect(plate.notCounted).toEqual([]);
  });

  it('a range around the middle; picking up loses one arrow in five', () => {
    const e = arrowsForGoal({ xp: xpForLevel(20), goalLevel: 40, bow: 'Willow shortbow', arrow: 'Mithril arrow', worn: ['Leather body'], foe: foe('Giant frog', 'Level 13') })!;
    expect(e.shots.low).toBeLessThan(e.shots.mid);
    expect(e.shots.high).toBeGreaterThan(e.shots.mid);
    expect(e.lostPickingUp.mid).toBeCloseTo(e.shots.mid * 0.2, -1);
    expect(e.kills).toBeGreaterThan(0);
  });

  it('never guesses: an unknown bow or an opponent without ranged defence gives no count; an unknown worn item is named', () => {
    const frog = foe('Giant frog', 'Level 13');
    expect(arrowsForGoal({ xp: 0, goalLevel: 10, bow: 'Magic shortbow', arrow: 'Bronze arrow', worn: [], foe: frog })).toBeNull();
    expect(arrowsForGoal({ xp: 0, goalLevel: 10, bow: 'Shortbow', arrow: 'Bronze arrow', worn: [], foe: { ...frog, defence: { ...frog.defence, ranged: undefined } } })).toBeNull();
    expect(arrowsForGoal({ xp: 0, goalLevel: 10, bow: 'Shortbow', arrow: 'Bronze arrow', worn: ['Party hat'], foe: frog })?.notCounted).toEqual(['Party hat']);
    expect(arrowsForGoal({ xp: xpForLevel(50), goalLevel: 50, bow: 'Shortbow', arrow: 'Bronze arrow', worn: [], foe: frog })?.shots.mid).toBe(0);
  });
});

describe('the arrows on the training card, along the path', () => {
  const methods = trainingMethods.filter((m) => m.kit === 'f2p-bow');
  const method = (id: string) => methods.find((m) => m.id === id)!;
  const worn = (names: [string, string][]): GearItem[] => names.map(([name, slot]) => ({ id: 0, name, count: name.includes('arrow') ? 500 : 1, slot }));
  const stateWith = (equipment: GearItem[]) => buildPlayerState({
    mode: 'f2p', stats: { ranged: 20 }, progress: emptyProgress(), connected: true, questsDone: [],
    owned: { bankSeen: true, items: new Map(equipment.map((e) => [nameKey(e.name), { name: e.name, carried: e.count ?? 1, noted: 0, bank: 0 }])) },
    gear: { equipment, inventory: [], coins: 0, bankCoins: 0 },
  });

  it('each method meets its own opponent: the level 3 Seagulls, the free Edgeville monk', () => {
    expect(methodFoe(method('ra-lumb'))).toMatchObject({ name: 'Seagull', combat: 3 });
    expect(methodFoe(method('ra-monk'))).toMatchObject({ name: 'Monk', combat: 5, members: false });
  });

  it('two legs add up, with the worn bow and arrows; the bow and the arrows do not count twice as armour', () => {
    const s = stateWith(worn([['Willow shortbow', 'weapon'], ['Mithril arrow', 'ammo'], ['Leather body', 'body']]));
    const legs = [{ method: method('ra-monk'), fromLevel: 20, toLevel: 26 }, { method: method('ra-frog'), fromLevel: 26, toLevel: 40 }];
    const all = goalArrows(legs, s, xpForLevel(20))!;
    expect(all).toMatchObject({ bow: 'Willow shortbow', arrow: 'Mithril arrow', goalLevel: 40, notCounted: [] });
    const monks = arrowsForGoal({ xp: xpForLevel(20), goalLevel: 26, bow: 'Willow shortbow', arrow: 'Mithril arrow', worn: ['Leather body'], foe: methodFoe(method('ra-monk'))! })!;
    const frogs = arrowsForGoal({ xp: xpForLevel(26), goalLevel: 40, bow: 'Willow shortbow', arrow: 'Mithril arrow', worn: ['Leather body'], foe: methodFoe(method('ra-frog'))! })!;
    expect(all.shots.mid).toBe(monks.shots.mid + frogs.shots.mid);
    expect(goalArrows(legs, s, null)).toBeNull();
  });
});

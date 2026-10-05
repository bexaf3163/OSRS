import { describe, expect, it } from 'vitest';
import { buildRoadmap, gainLabel, prayerChips } from '../src/lib/gearRoadmap';
import type { Gain, LockedItem } from '../src/services/gearAdvisor';

const melee = { maxHit: 4, hitChance: 0.9, dps: 0.8, style: 'aggressive' as const, speed: 2.4 };
const dps = (ratio: number, extra: Partial<Extract<Gain, { kind: 'dps' }>> = {}): Gain => ({ kind: 'dps', before: melee, after: melee, ratio, ...extra });
const piece = (id: number, name: string, slot: string) => ({ id, name, slot }) as unknown as LockedItem['item'];
const locked = (id: number, name: string, slot: string, missing: LockedItem['missing'], gain: Gain, owned?: 'bag' | 'bank'): LockedItem =>
  ({ slot, item: piece(id, name, slot), current: null, gain, missing, ...(owned ? { owned } : {}) }) as unknown as LockedItem;

describe('gain labels', () => {
  it('name the damage and defence gain, and nothing for a negligible one', () => {
    expect(gainLabel(dps(1.07))).toBe('+7% DPS');
    expect(gainLabel(dps(1.07, { defenceBefore: 0, defenceAfter: 2 }))).toBe('+7% DPS, +2 Def');
    expect(gainLabel({ kind: 'defence', before: 0, after: 18 })).toBe('+18 Def');
    expect(gainLabel(dps(1.001))).toBeUndefined();
  });
});

describe('the upgrade roadmap', () => {
  const attack30 = [{ kind: 'skill', skill: 'attack', need: 30, have: 21 }] as LockedItem['missing'];
  const def5 = [{ kind: 'skill', skill: 'defence', need: 5, have: 1 }] as LockedItem['missing'];

  it('puts one requirement in one row, with the missing levels, and the closest goal first', () => {
    const rows = buildRoadmap({
      locked: [
        locked(1, 'Adamant scimitar', 'weapon', attack30, dps(1.07)),
        locked(2, 'Steel platebody', 'body', def5, { kind: 'defence', before: 0, after: 46 }),
        locked(3, 'Steel platelegs', 'legs', def5, { kind: 'defence', before: 0, after: 28 }),
      ],
      unlocks: [],
    });
    expect(rows.map((r) => r.items.map((i) => i.name))).toEqual([['Steel platebody', 'Steel platelegs'], ['Adamant scimitar']]);
    expect(rows[1].skills).toEqual([{ skill: 'attack', need: 30, have: 21 }]);
    expect(rows[1].items[0].gain).toBe('+7% DPS');
    expect(rows[1].missingLevels).toBe(9);
  });

  it('an item already owned is its own row and goes first; a quest-only lock goes last', () => {
    const rows = buildRoadmap({
      locked: [
        locked(1, 'Quest hat', 'head', [{ kind: 'quest', quest: 'Some Quest' }] as LockedItem['missing'], { kind: 'defence', before: 0, after: 5 }),
        locked(2, 'Coif', 'head', [{ kind: 'skill', skill: 'ranged', need: 20, have: 17 }] as LockedItem['missing'], { kind: 'defence', before: 0, after: 18 }, 'bank'),
        locked(3, 'Adamant scimitar', 'weapon', attack30, dps(1.07)),
      ],
      unlocks: [],
    });
    expect(rows.map((r) => r.items[0].name)).toEqual(['Coif', 'Adamant scimitar', 'Quest hat']);
    expect(rows[0].owned).toBe('bank');
    expect(rows[2].quests).toEqual(['Some Quest']);
  });

  it('an unlock that is already a lock is not listed twice', () => {
    const rows = buildRoadmap({
      locked: [locked(1, 'Adamant scimitar', 'weapon', attack30, dps(1.07))],
      unlocks: [{ item: piece(1, 'Adamant scimitar', 'weapon'), skill: 'attack', level: 30, have: 21 }, { item: piece(9, 'Rune scimitar', 'weapon'), skill: 'attack', level: 40, have: 21 }],
    });
    expect(rows.flatMap((r) => r.items.map((i) => i.name))).toEqual(['Adamant scimitar', 'Rune scimitar']);
  });
});

describe('prayer chips', () => {
  it('lists the unlocked prayers, else the first one to aim for', () => {
    expect(prayerChips([{ name: 'Burst of Strength', level: 4, effect: '+5% Strength', maxHit: 5 }])).toEqual([{ name: 'Burst of Strength', ready: true, title: '+5% Strength, max hit 5' }]);
    expect(prayerChips([])[0]).toMatchObject({ name: 'Burst of Strength', ready: false });
  });
});

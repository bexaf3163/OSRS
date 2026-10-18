import { describe, expect, it } from 'vitest';
import { stepById } from '../src/data';
import { estimateFight, estimateStepFights, fightLine, stepFightFoes } from '../src/lib/fightEstimate';
import { COMBAT_FOES } from '../src/lib/combatEstimate';
import { gearById } from '../src/services/gearAdvisor';
import type { GearState } from '../src/services/runeliteBridge';

// Combat estimate group 7: the quest fights of the route, one fight each, with the player's real kit.
const id = (n: string) => [...gearById.values()].find((p) => p.name === n)!.id;
const gearOf = (names: string[]): GearState => ({ equipment: names.map((n) => ({ id: id(n), name: n })), inventory: [], coins: 0, bankCoins: 0 });
const IRON = ['Mithril scimitar', 'Iron full helm', 'Iron platebody', 'Iron plateskirt', 'Iron kiteshield'];
const foe = (name: string) => COMBAT_FOES.find((f) => f.name === name && !f.members)!;

describe('one quest fight with your kit', () => {
  it('every route quest fight the table knows has a free version', () => {
    for (const n of ['Count Draynor', 'Ithoi the Navigator', 'Brutus', 'Melzar the Mad', 'Lesser demon', 'Elvarg', 'Black Knight', 'Ancient Guardian']) {
      expect(foe(n), n).toBeTruthy();
    }
  });

  it('Count Draynor at Attack 20 / Strength 20 / Defence 1 with iron armour: a short fight, little damage, the safest style picked', () => {
    const [e] = estimateStepFights(stepById.get('S2-08')!, { attack: 20, strength: 20, defence: 1, hitpoints: 20 }, gearOf(IRON));
    expect(e.foe.name).toBe('Count Draynor');
    expect(e.seconds.mid).toBeGreaterThan(5);
    expect(e.seconds.mid).toBeLessThan(120);
    expect(e.damage.low).toBeLessThanOrEqual(e.damage.mid);
    expect(e.damage.mid).toBeLessThanOrEqual(e.damage.high);
    expect(fightLine(e)).toMatch(/^Count Draynor: about \d+ s on (Accurate|Aggressive|Defensive); you take about \d+ damage \(up to \d+\); /);
  });

  it('better armour means less damage taken from the same fight', () => {
    const lv = { attack: 30, strength: 30, defence: 20, hitpoints: 30 };
    const bare = estimateStepFights(stepById.get('S4-02')!, lv, gearOf(['Mithril scimitar']))[0];
    const iron = estimateStepFights(stepById.get('S4-02')!, lv, gearOf(IRON))[0];
    expect(bare.foe.name).toBe('Brutus');
    expect(iron.damage.mid).toBeLessThan(bare.damage.mid);
  });

  it('a magic attacker (Ithoi) is not soft on iron armour: its accuracy is rolled against magic defence, and that is said', () => {
    const e = estimateStepFights(stepById.get('S4-01')!, { attack: 30, strength: 30, defence: 20, hitpoints: 30, magic: 1 }, gearOf(IRON))[0];
    expect(e.foe.name).toBe('Ithoi the Navigator');
    expect(e.foeHitChance).toBeGreaterThan(0.3);
    expect(e.assumed.join(' ')).toMatch(/attacks with magic/);
  });

  it('more health above two max hits means fewer pieces of food', () => {
    const base = { foe: foe('Lesser demon'), weapon: gearById.get(id('Mithril scimitar'))!, neck: null, armour: [], food: { name: 'Swordfish', heals: 14 } };
    const low = estimateFight({ ...base, levels: { attack: 40, strength: 40, defence: 30, hitpoints: 30 } })!;
    const high = estimateFight({ ...base, levels: { attack: 40, strength: 40, defence: 30, hitpoints: 60 } })!;
    expect(high.food.high).toBeLessThan(low.food.high);
  });

  it('Elvarg names its dragonfire beside the melee estimate', () => {
    const e = estimateFight({ foe: foe('Elvarg'), levels: { attack: 40, strength: 40, defence: 30, hitpoints: 40 }, weapon: gearById.get(id('Mithril scimitar'))!, neck: null, armour: [], food: { name: 'Lobster', heals: 12 } })!;
    expect(e.extra.join(' ')).toMatch(/Dragonfire/);
  });

  it('a training step is left to the training estimate; no game data, no estimate', () => {
    expect(stepFightFoes(stepById.get('S3-08')!)).toEqual([]);
    expect(estimateStepFights(stepById.get('S2-08')!, null, gearOf(IRON))).toEqual([]);
    expect(estimateStepFights(stepById.get('S2-08')!, { attack: 20, strength: 20, defence: 1, hitpoints: 20 }, null)).toEqual([]);
  });
});

describe('the opponents of a step (combat audit, 2.66.0)', () => {
  it('a members quest fight is estimated with its members version when there is no free one', async () => {
    const { stepFightFoes, stepFightNames } = await import('../src/lib/fightEstimate');
    const { stepById } = await import('../src/data');
    expect(stepFightFoes(stepById.get('S8-01')!).map((f) => [f.name, f.members])).toEqual([['Temple Guardian', true]]);
    expect(stepFightFoes(stepById.get('S8-02')!).map((f) => f.name)).toEqual(['Ghast']);
    // A free version wins where there is one; the demon fought from the safespot is not estimated in melee.
    expect(stepFightFoes(stepById.get('S5-03')!).map((f) => [f.name, f.members])).toEqual([['Melzar the Mad', false]]);
    expect(stepFightNames(stepById.get('S3-04')!)).toEqual([]);
    expect(stepFightNames(stepById.get('S4-03')!)).toEqual([]);
  });
});

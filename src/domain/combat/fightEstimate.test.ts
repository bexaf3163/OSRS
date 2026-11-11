import { describe, expect, it } from 'vitest';
import { stepById } from '../../data';
import { estimateFight, estimateStepFights, fightLine, stepFightFoes } from './fightEstimate';
import { COMBAT_FOES } from './combatEstimate';
import { gearById } from './gearAdvisor';
import type { GearState } from '../../services/runeliteBridge';
import { retiredStep } from '../../../tests/fixtures/retiredSteps';

// Combat estimate group 7: the quest fights of the route, one fight each, with the player's real kit.
const id = (n: string) => [...gearById.values()].find((p) => p.name === n)!.id;
const gearOf = (names: string[]): GearState => ({ equipment: names.map((n) => ({ id: id(n), name: n })), inventory: [], coins: 0, bankCoins: 0 });
const IRON = ['Mithril scimitar', 'Iron full helm', 'Iron platebody', 'Iron plateskirt', 'Iron kiteshield'];
const foe = (name: string) => COMBAT_FOES.find((f) => f.name === name && !f.members)!;

describe('one quest fight with your kit', () => {
  it('keeps missing equipment bonuses, unread magic defence and a new incoming attack formula out of readiness proof', () => {
    const base = { foe: foe('Black Knight'), levels: { attack: 40, strength: 40, defence: 40, hitpoints: 40 },
      weapon: gearById.get(id('Mithril scimitar'))!, neck: null, armour: [], food: { name: 'Trout', heals: 7 } };
    expect(estimateFight({ ...base, unknownPieces: 1 })?.unmodelled).toContain('worn equipment without verified combat bonuses');
    expect(estimateFight({ ...base, foe: foe('Ithoi the Navigator') })?.unmodelled).toContain('unread Magic level for incoming magic defence');
    expect(estimateFight({ ...base, foe: { ...base.foe, name: 'Synthetic ranged foe', attackStyle: 'ranged' } })?.unmodelled)
      .toContain('unsupported incoming ranged attack model');
  });
  it('every route quest fight the table knows has a free version', () => {
    for (const n of ['Count Draynor', 'Ithoi the Navigator', 'Brutus', 'Melzar the Mad', 'Lesser demon', 'Elvarg', 'Black Knight', 'Ancient Guardian']) {
      expect(foe(n), n).toBeTruthy();
    }
  });

  it('Count Draynor is estimated with the Wiki\'s mechanics: regeneration, the garlic and the stake', () => {
    const step = stepById.get('S2-08')!, lv = { attack: 20, strength: 20, defence: 1, hitpoints: 20 };
    const [e] = estimateStepFights(step, lv, gearOf(IRON));
    expect(e.foe.name).toBe('Count Draynor');
    expect(e.seconds.mid).toBeGreaterThan(5);
    expect(e.seconds.mid).toBeLessThan(120);
    expect(e.damage.low).toBeLessThanOrEqual(e.damage.mid);
    expect(e.damage.mid).toBeLessThanOrEqual(e.damage.high);
    expect(fightLine(e)).toMatch(/^Count Draynor: about \d+ s on (Accurate|Aggressive|Defensive); you take about \d+ damage \(up to \d+\); /);
    expect(e.unmodelled).toEqual([]);
    expect(fightLine(e)).not.toContain('Partial estimate');
    expect(e.assumed.join(' ')).toMatch(/restores 1 hit point.*every 5 ticks/);
    // Without the garlic the step carries, he keeps his 35 hit points and his Defence: the same kit takes longer.
    const without = (name: string) => ({ ...step, itemsRequired: step.itemsRequired!.filter((item) => item.nameEn !== name) });
    const [plain] = estimateStepFights(without('Garlic'), lv, gearOf(IRON));
    expect(plain.cannot ?? plain.seconds.mid).not.toBe(e.seconds.mid);
    if (!plain.cannot) expect(plain.seconds.mid).toBeGreaterThan(e.seconds.mid);
    // The killing blow needs the stake and the hammer: a step that does not carry them is not assessed.
    expect(estimateStepFights(without('Stake'), lv, gearOf(IRON))[0].unmodelled.join(' ')).toMatch(/killing blow needs Stake/);
    // Hits that do not outpace 1 hit point every 3 seconds never win: said, and more levels change it.
    const weak = estimateStepFights(step, { attack: 5, strength: 5, defence: 1, hitpoints: 12 }, gearOf(['Bronze sword']))[0];
    expect(weak.cannot).toMatch(/do not outpace Count Draynor's regeneration/);
    expect(fightLine(weak)).toMatch(/regeneration/);
    expect(weak.unmodelled).toEqual([]);
  });

  it('Delrith is fought with Silverlight after the dark wizards, whatever weapon is worn now', () => {
    const step = stepById.get('S3-03')!, lv = { attack: 30, strength: 30, defence: 30, hitpoints: 30, magic: 20 };
    const [bare] = estimateStepFights(step, lv, gearOf([])), [armed] = estimateStepFights(step, lv, gearOf(['Mithril scimitar']));
    expect(bare.foe.name).toBe('Delrith');
    expect(bare.unmodelled).toEqual([]);
    expect(armed.seconds.mid).toBeCloseTo(bare.seconds.mid, 6); // Silverlight is the weapon; the scimitar changes nothing.
    // The wizards that come first are part of it: Delrith alone, doubled damage against 7 hit points, is much shorter.
    const alone = estimateFight({ foe: foe('Delrith'), levels: lv, weapon: null, neck: null, armour: [], food: { name: 'Trout', heals: 7 } })!;
    expect(alone.seconds.mid).toBeLessThan(bare.seconds.mid / 2);
    expect(bare.worstHit).toBe(6); // The level 20 wizard's magic.
  });

  it('Brutus\'s special is counted: one hit of each, a share of your Hitpoints up to 19', () => {
    const fight = (hitpoints: number) => estimateStepFights(stepById.get('S4-02')!, { attack: 30, strength: 30, defence: 30, hitpoints }, gearOf(IRON))[0];
    expect(fight(30)).toMatchObject({ worstHit: 12, unmodelled: [], extra: [] });
    expect(fight(60).worstHit).toBe(19);
    // The same fight without the special would take only his plain hits of up to 3.
    const plain = estimateFight({ foe: { ...foe('Brutus'), name: 'Synthetic bull' }, levels: { attack: 30, strength: 30, defence: 30, hitpoints: 30 },
      weapon: gearById.get(id('Mithril scimitar'))!, neck: null, armour: IRON.slice(1).map((n) => gearById.get(id(n))!), food: { name: 'Trout', heals: 7 } })!;
    expect(fight(30).damage.mid).toBeGreaterThan(plain.damage.mid * 2);
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
    // Its numbers without the route's safespot: a plain melee opponent.
    const base = { foe: { ...foe('Lesser demon'), name: 'Synthetic demon' }, weapon: gearById.get(id('Mithril scimitar'))!, neck: null, armour: [], food: { name: 'Swordfish', heals: 14 } };
    const low = estimateFight({ ...base, levels: { attack: 40, strength: 40, defence: 30, hitpoints: 30 } })!;
    const high = estimateFight({ ...base, levels: { attack: 40, strength: 40, defence: 30, hitpoints: 60 } })!;
    expect(high.food.high).toBeLessThan(low.food.high);
  });

  it('the Lesser demon is fought from the safespot with Water Strike: its water weakness, no damage, the casts the runes pay for', () => {
    const base = { foe: foe('Lesser demon'), weapon: null, neck: null, armour: [], food: { name: 'Salmon', heals: 9 }, casts: 50 };
    const lv = { attack: 30, strength: 30, defence: 30, hitpoints: 30 };
    const e = estimateFight({ ...base, levels: { ...lv, magic: 20 } })!;
    expect(e).toMatchObject({ spell: 'Water Strike', maxHit: 11, worstHit: 0, food: { high: 0 }, damage: { high: 0 }, unmodelled: [] });
    expect(e.cannot).toBeUndefined();
    expect(e.seconds.mid).toBeCloseTo(e.casts!.mid * 3, 6);
    expect(e.casts!.high).toBeLessThan(50);
    expect(fightLine(e)).toMatch(/^Lesser demon[^:]*: about \d+ casts of Water Strike \(up to \d+\), about .* from the safespot; it cannot reach you there\.$/);
    // Nothing reaches you there: metal armour, which lowers the magic bonus, comes off before you cast (a full iron set would stop every cast).
    const piece = (n: string) => gearById.get(id(n))!;
    const armoured = estimateFight({ ...base, armour: IRON.slice(1).map(piece), levels: { ...lv, magic: 20 } })!;
    expect(armoured.cannot).toBeUndefined();
    expect(armoured.casts).toEqual(e.casts);
    expect(estimateFight({ ...base, levels: { ...lv, magic: 4 } })!.cannot).toBe('Water Strike needs Magic 5');
    expect(estimateFight({ ...base, casts: 5, levels: { ...lv, magic: 20 } })!.cannot).toMatch(/runes pay for 5 casts of Water Strike; up to \d+ may be needed/);
    expect(estimateFight({ ...base, levels: lv })!.unmodelled).toContain('unread Magic level');
  });

  it('a bow has no melee hit: no melee fight is estimated with one worn, as with a weapon the data does not know', () => {
    const lv = { attack: 40, strength: 40, defence: 40, hitpoints: 40 };
    expect(estimateStepFights(stepById.get('S2-08')!, lv, gearOf(['Mithril scimitar'])).length).toBeGreaterThan(0);
    expect(estimateStepFights(stepById.get('S2-08')!, lv, gearOf(['Shortbow']))).toEqual([]);
  });

  it('Melzar\'s Maze: Melzar the Mad in melee, the demon with the 50 casts of runes the step carries', () => {
    const fights = estimateStepFights(stepById.get('S5-03')!, { attack: 40, strength: 40, defence: 40, hitpoints: 40, magic: 20 }, gearOf(['Mithril scimitar']));
    expect(fights.map((f) => [f.foe.name, f.spell ?? 'melee'])).toEqual([['Melzar the Mad', 'melee'], ['Lesser demon', 'Water Strike']]);
    expect(fights[1].cannot).toBeUndefined();
  });

  it('Elvarg\'s dragonfire is counted for every attack: up to 10 behind the Anti-dragon shield, up to 70 without it', () => {
    const base = { foe: foe('Elvarg'), levels: { attack: 40, strength: 40, defence: 30, hitpoints: 40 }, weapon: gearById.get(id('Mithril scimitar'))!, neck: null, armour: [], food: { name: 'Lobster', heals: 12 } };
    const bare = estimateFight(base)!, shielded = estimateFight({ ...base, worn: ['Anti-dragon shield'] })!;
    expect(bare).toMatchObject({ worstHit: 70, unmodelled: [], extra: [] });
    expect(shielded).toMatchObject({ worstHit: 10, unmodelled: [], extra: [] });
    expect(shielded.damage.mid).toBeLessThan(bare.damage.mid / 5);
    expect(shielded.assumed.join(' ')).toMatch(/takes the worse of them for every attack/);
    // An attack the mechanics do not cover still keeps a fight out of the model.
    const odd = estimateFight({ ...base, foe: { ...base.foe, name: 'Brutus', maxHit: 1 }, levels: { ...base.levels, hitpoints: 99 } })!;
    expect(odd.extra).toEqual(['3 (melee)']);
    expect(odd.unmodelled).toContain('additional attack: 3 (melee)');
  });

  it('a training step is left to the training estimate; no game data, no estimate', () => {
    expect(stepFightFoes(retiredStep('S3-08')!)).toEqual([]);
    expect(estimateStepFights(stepById.get('S2-08')!, null, gearOf(IRON))).toEqual([]);
    expect(estimateStepFights(stepById.get('S2-08')!, { attack: 20, strength: 20, defence: 1, hitpoints: 20 }, null)).toEqual([]);
  });

  it('S03: an unread Hitpoints level gives no estimate, never a guessed full health', () => {
    const step = stepById.get('S2-08')!;
    expect(estimateStepFights(step, { attack: 20, strength: 20, defence: 1, hitpoints: 20 }, gearOf(IRON))).toHaveLength(1);
    expect(estimateStepFights(step, { attack: 20, strength: 20, defence: 1 }, gearOf(IRON))).toEqual([]);
  });
});

describe('the opponents of a step (combat audit, 2.66.0)', () => {
  it('a members quest fight is estimated with its members version when there is no free one', async () => {
    const { stepFightFoes, stepFightNames } = await import('./fightEstimate');
    const { stepById } = await import('../../data');
    expect(stepFightFoes(stepById.get('S8-01')!).map((f) => [f.name, f.members])).toEqual([['Temple Guardian', true]]);
    expect(stepFightFoes(stepById.get('S8-02')!).map((f) => f.name)).toEqual(['Ghast']);
    // A free version wins where there is one: the level 82 demon of Melzar's Maze, fought from the safespot.
    expect(stepFightFoes(stepById.get('S5-03')!).map((f) => [f.name, f.members])).toEqual([['Melzar the Mad', false], ['Lesser demon', false]]);
    expect(stepFightNames(stepById.get('S3-04')!)).toEqual(['Ancient Guardian']);
    expect(stepFightNames(retiredStep('S4-03')!)).toEqual([]);
  });
});

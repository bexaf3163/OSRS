import { describe, expect, it } from 'vitest';
import { attacksToKill, estimateCombat, foeVariants, hitChance, type CombatFoe, type EstimateInput } from '../src/lib/combatEstimate';
import { gearById, meleeHit } from '../src/services/gearAdvisor';
import type { GearPiece } from '../src/types';

// The estimate against an independent reference: a tick-by-tick simulation of the fights that rolls the game's dice itself —
// an attack roll 0..A against a defence roll 0..D (a hit when the first is higher), damage 0..max (the player's 0 on a hit counted
// as 1), the XP of the damage, a level up mid-fight, the opponent swinging every few ticks, a Strength potion that wears off a level a
// minute. It shares no code with the model: the model's closed formulas, recursion and phase bookkeeping must land where the dice do.
// The max-hit and accuracy constants come from the wiki pages (cited at each), not from gearAdvisor.

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const roll = (r: () => number, max: number) => Math.floor(r() * (max + 1));

// The game's XP table (OSRS Wiki, Experience: the sum of floor(L + 300 * 2^(L/7)) / 4), written out here on its own.
const XP: number[] = [0, 0];
for (let L = 1, pts = 0; L < 99; L++) { pts += Math.floor(L + 300 * 2 ** (L / 7)); XP[L + 1] = Math.floor(pts / 4); }
const levelOf = (xp: number) => { let L = 1; while (L < 99 && XP[L + 1] <= xp) L++; return L; };

interface Sim { attack: number; strength: number; defence: number; xp: { attack: number; strength: number }; doses: number }
/** Wiki "Maximum melee hit" and "Accuracy": style bonus +3 to the trained skill, +8, the bonus +64. */
function playerRolls(lv: { attack: number; strength: number }, style: 'accurate' | 'aggressive', w: GearPiece, neck: GearPiece | null, foe: CombatFoe) {
  const effStr = lv.strength + (style === 'aggressive' ? 3 : 0) + 8;
  const max = Math.floor(0.5 + (effStr * (w.strength + (neck?.strength ?? 0) + 64)) / 640);
  const att = (lv.attack + (style === 'accurate' ? 3 : 0) + 8) * (w.attack.slash + 64);
  return { max, att, def: (foe.defenceLevel + 9) * (foe.defence.slash + 64) };
}

function simulate(seed: number, foe: CombatFoe, start: Sim, goals: { skill: 'attack' | 'strength'; exp: number }[], w: GearPiece, neck: GearPiece | null, armourCrush: number) {
  const r = rng(seed);
  const s = { ...start, xp: { ...start.xp } };
  let ticks = 0;
  let kills = 0;
  let damage = 0;
  let boost = 0;
  let boostTicks = 0;
  const foeAtt = (foe.attackLevel + 9) * (foe.attackBonus + 64);
  const myDef = (s.defence + 8) * (armourCrush + 64);
  for (const g of goals) {
    const style = g.skill === 'strength' ? 'aggressive' : 'accurate';
    while (s.xp[g.skill] < g.exp) {
      let hp = foe.hitpoints;
      for (let t = 0; hp > 0; t++, ticks++) {
        if (s.doses > 0 && boost === 0) { boost = Math.floor(s.strength / 10) + 3; boostTicks = 0; s.doses--; }
        if (t % w.speed! === 0) {
          const p = playerRolls({ attack: s.attack, strength: s.strength + boost }, style, w, neck, foe);
          if (roll(r, p.att) > roll(r, p.def)) {
            const d = Math.min(hp, Math.max(1, roll(r, p.max)));
            hp -= d;
            s.xp[g.skill] += 4 * d;
            s[g.skill] = levelOf(s.xp[g.skill]);
          }
        }
        if (hp > 0 && t >= 1 && (t - 1) % foe.speedTicks === 0 && roll(r, foeAtt) > roll(r, myDef)) damage += roll(r, foe.maxHit);
        if (boost > 0 && ++boostTicks % 100 === 0) boost--;
      }
      // The next opponent is hit no sooner than the weapon's interval after the last swing.
      ticks += w.speed! - 1;
      boostTicks += w.speed! - 1;
      kills++;
    }
  }
  return { kills, minutes: (ticks * 0.6) / 60, damage };
}

const piece = (n: string) => [...gearById.values()].find((p) => p.name === n)!;
const SCIM = piece('Mithril scimitar');
const AMULET = piece('Amulet of strength');
const IRON = ['Iron full helm', 'Iron platebody', 'Iron plateskirt', 'Iron kiteshield'].map(piece);
const IRON_CRUSH = IRON.reduce((a, p) => a + p.defence.crush, 0);
const [L12, L27] = foeVariants('Minotaur');
const S308 = [{ skill: 'strength' as const, exp: 4470 }, { skill: 'attack' as const, exp: 13363 }];

function input(foe: CombatFoe, over: Partial<EstimateInput> = {}): EstimateInput {
  return {
    foe, levels: { attack: 22, strength: 16, defence: 1, hitpoints: 22 }, xp: { attack: 5624, strength: 2746, defence: 0 }, goals: S308,
    weapon: SCIM, neck: null, armour: IRON, food: { name: 'Salmon', heals: 9 }, ...over,
  };
}
function runs(n: number, foe: CombatFoe, neck: GearPiece | null, doses = 0) {
  return Array.from({ length: n }, (_, i) =>
    simulate(1000 + i, foe, { attack: 22, strength: 16, defence: 1, xp: { attack: 5624, strength: 2746 }, doses }, S308, SCIM, neck, IRON_CRUSH));
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('Strength dose consumption', () => {
  it('charges an opened dose but preserves unopened stock after a short fight', () => {
    const e = estimateCombat(input(L12, { strengthDoses: 100, goals: [{ skill: 'attack', exp: 5625 }] }))!;
    expect(e.strengthDosesUsed).toBe(1);
    expect(e.strengthDosesLeft).toBe(99);
  });
  it('never spends beyond starting stock, including malformed input', () => {
    for (const doses of [0, 1, 4, 100]) {
      const e = estimateCombat(input(L12, { strengthDoses: doses }))!;
      expect(e.strengthDosesUsed! + e.strengthDosesLeft!).toBe(doses);
      expect(e.strengthDosesUsed!).toBeGreaterThanOrEqual(0);
      expect(e.strengthDosesUsed!).toBeLessThanOrEqual(doses);
    }
    for (const doses of [-1, NaN, Infinity]) {
      expect(estimateCombat(input(L12, { strengthDoses: doses }))).toMatchObject({ strengthDosesUsed: 0, strengthDosesLeft: 0 });
    }
  });
});

describe('the wiki constants', () => {
  it('max hit: 99 Strength, no bonus, Aggressive is 11 (wiki: Maximum melee hit)', () => {
    expect(meleeHit({ attack: 1, strength: 99, defence: 1 }, 0, 0, 4, 'aggressive').maxHit).toBe(11);
  });

  it('accuracy formula against rolling the two dice', () => {
    const r = rng(7);
    for (const [a, d] of [[1500, 800], [600, 1400], [1000, 1000]]) {
      let hits = 0;
      for (let i = 0; i < 200_000; i++) if (roll(r, a) > roll(r, d)) hits++;
      expect(hitChance(a, d)).toBeCloseTo(hits / 200_000, 2);
    }
  });

  it('the data has both Minotaurs with their own numbers (wiki infobox: 10 and 22 hit points, max hit 2 and 3)', () => {
    expect([L12.combat, L12.hitpoints, L12.maxHit]).toEqual([12, 10, 2]);
    expect([L27.combat, L27.hitpoints, L27.maxHit]).toEqual([27, 22, 3]);
  });
});

describe('attacks to kill: the recursion against the dice', () => {
  it.each([[10, 4, 0.7], [22, 4, 0.55], [35, 5, 0.4], [3, 0, 0.9]])('hp %i, max %i, accuracy %f', (hp, max, p) => {
    const r = rng(hp * 31 + max);
    const n: number[] = [];
    for (let i = 0; i < 40_000; i++) {
      let left = hp;
      let k = 0;
      while (left > 0) { k++; if (r() < p) left -= Math.max(1, roll(r, max)); }
      n.push(k);
    }
    const m = mean(n);
    const v = mean(n.map((x) => (x - m) ** 2));
    const a = attacksToKill(hp, max, p);
    expect(a.mean).toBeCloseTo(m, 1);
    expect(a.variance / v).toBeGreaterThan(0.95);
    expect(a.variance / v).toBeLessThan(1.05);
  });
});

describe('S3-08 from Attack 22 / Strength 16 in iron armour: the whole training against the simulation', () => {
  const cases: [string, CombatFoe, GearPiece | null, number][] = [
    ['level 12', L12, null, 0], ['level 27', L27, null, 0], ['level 12, amulet, 12 Strength potion doses', L12, AMULET, 12],
  ];
  it.each(cases)('%s', (_, foe, neck, doses) => {
    const sims = runs(120, foe, neck, doses);
    const e = estimateCombat(input(foe, { neck, strengthDoses: doses }))!;
    expect(e.kills).toBeGreaterThanOrEqual(Math.min(...sims.map((x) => x.kills)));
    expect(e.kills).toBeLessThanOrEqual(Math.max(...sims.map((x) => x.kills)));
    const fight = e.phases.reduce((a, p) => a + p.seconds, 0) / 60;
    const hurt = e.phases.reduce((a, p) => a + p.damage, 0);
    expect(fight / mean(sims.map((x) => x.minutes))).toBeGreaterThan(0.96);
    expect(fight / mean(sims.map((x) => x.minutes))).toBeLessThan(1.04);
    expect(hurt / mean(sims.map((x) => x.damage))).toBeGreaterThan(0.93);
    expect(hurt / mean(sims.map((x) => x.damage))).toBeLessThan(1.07);
    // The fighting-time range holds at least 9 runs in 10.
    const inside = sims.filter((x) => x.minutes >= e.combatMinutes.low && x.minutes <= e.combatMinutes.high).length;
    expect(inside / sims.length).toBeGreaterThanOrEqual(0.9);
  });

  it('the level 27 Minotaurs eat more than twice the food for no time saved', () => {
    const a = estimateCombat(input(L12))!;
    const b = estimateCombat(input(L27))!;
    expect(b.food.mid / a.food.mid).toBeGreaterThan(2);
    expect(b.combatMinutes.mid).toBeGreaterThanOrEqual(a.combatMinutes.mid * 0.95);
  });

  it('Strength potions: no faster with the Mithril scimitar alone (the max hit stays 4), faster with the amulet', () => {
    const plain = estimateCombat(input(L12))!.combatMinutes.mid;
    expect(estimateCombat(input(L12, { strengthDoses: 12 }))!.combatMinutes.mid).toBeCloseTo(plain, 6);
    const amulet = estimateCombat(input(L12, { neck: AMULET }))!.combatMinutes.mid;
    expect(estimateCombat(input(L12, { neck: AMULET, strengthDoses: 12 }))!.combatMinutes.mid).toBeLessThan(amulet * 0.95);
  });
});

describe('trip and total', () => {
  const e = estimateCombat(input(L12))!;

  it('the whole goal, the next bag and the reserve are different numbers', () => {
    expect(e.food.low).toBeLessThan(e.food.mid);
    expect(e.food.mid).toBeLessThan(e.food.high);
    expect(e.nextTrip).toBe(Math.min(26, e.food.high));
    expect(e.reserve).toBe(e.food.high - e.food.mid);
    expect(e.trips.mid).toBe(Math.ceil(e.food.mid / 26));
  });

  it('a bigger fish means fewer pieces, by its healing', () => {
    const lobster = estimateCombat(input(L12, { food: { name: 'Lobster', heals: 12 } }))!;
    expect(lobster.food.mid).toBeCloseTo((e.food.mid * 9) / 12, -1);
  });

  it('food cannot restore more than a living player can be missing', () => {
    const at = (heals: number) => estimateCombat(input(L12, { levels: { attack: 22, strength: 16, defence: 1, hitpoints: 10 }, food: { name: 'Test food', heals } }))!;
    const capped = at(9);
    expect(capped.food.mid).toBeGreaterThan(0);
    expect(at(14).food).toEqual(capped.food);
    expect(at(14).totalMinutes).toEqual(capped.totalMinutes);
    expect(at(7).food.mid).toBeGreaterThan(capped.food.mid);
  });

  it('two phases in order: Strength to 20 first, then Attack to 30', () => {
    expect(e.phases.map((p) => [p.skill, p.fromLevel, p.toLevel])).toEqual([['strength', 16, 20], ['attack', 22, 30]]);
  });

  it('reached goals give no estimate; a weapon that cannot hit gives none', () => {
    expect(estimateCombat(input(L12, { xp: { attack: 13363, strength: 4470, defence: 0 } }))).toBeNull();
  });

  it('unknown worn items make it "basic" and say so; missing XP is said too', () => {
    const b = estimateCombat(input(L12, { unknownPieces: 1, xp: undefined }))!;
    expect(b.basis).toBe('basic');
    expect(b.assumed.join(' ')).toMatch(/without data/);
    expect(b.assumed.join(' ')).toMatch(/start of your current levels/);
    expect(b.food.high - b.food.low).toBeGreaterThan(e.food.high - e.food.low);
  });

  it('measurements from the game pull it their way, gradually', () => {
    const perKill = (e.combatMinutes.mid * 60) / e.kills;
    const slow = (k: number) => estimateCombat(input(L12, { observed: { kills: k, seconds: k * perKill * 2 } }))!;
    expect(estimateCombat(input(L12, { observed: { kills: 5, seconds: 5 * perKill * 2 } }))!.basis).toBe('formula');
    expect(slow(10).basis).toBe('calibrated');
    expect(slow(10).combatMinutes.mid).toBeGreaterThan(e.combatMinutes.mid);
    expect(slow(100).combatMinutes.mid).toBeGreaterThan(slow(10).combatMinutes.mid);
    expect(slow(100).combatMinutes.mid).toBeLessThan(e.combatMinutes.mid * 2.1);
  });
});

describe('the combat log from /status', () => {
  it('parses what the plugin sends and drops what does not look like it', async () => {
    const { parseCombatLog } = await import('../src/services/runeliteBridge');
    expect(parseCombatLog({ stepId: 'S3-08', foes: [{ name: 'Minotaur', combat: 12, kills: 14, seconds: 120.5, damage: 40 }, { name: 'x', combat: -1 }] }))
      .toEqual({ stepId: 'S3-08', foes: [{ name: 'Minotaur', combat: 12, kills: 14, seconds: 120.5, damage: 40 }] });
    expect(parseCombatLog({ stepId: 'S3-08', foes: [] })).toBeNull();
    expect(parseCombatLog(null)).toBeNull();
  });
});

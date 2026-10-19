// The Gear page in context (2.68): what change, if any, is worth making for the fight in hand. The words never claim more than the numbers:
// no "faster" without a shorter interval, a max hit only when it changes, defence of the style that hits, coins kept for the supplies,
// and the last known gear kept per character.

import { describe, expect, it } from 'vitest';
import { newestGear, parseLastGears } from '../src/bridge';
import {
  adviseGear, canWear, foeAttack, foeData, gainText, gearData, incomingChance, meleeWith, relevantDefence,
  type AdvisorInput, type GearAction,
} from '../src/services/gearAdvisor';
import type { GearState } from '../src/services/runeliteBridge';
import type { OwnedState } from '../src/lib/checklist';

const byName = (n: string) => {
  const p = gearData.items.find((i) => i.name === n);
  if (!p) throw new Error(`no ${n} in gear.json`);
  return p;
};
const item = (n: string) => ({ id: byName(n).id, name: n, slot: byName(n).slot === 'neck' ? 'amulet' : byName(n).slot });
const wearing = (names: string[], coins = 0, bankCoins = 0): GearState => ({ equipment: names.map(item), inventory: [], coins, bankCoins });
const foe = (n: string) => {
  const f = foeData.foes.find((x) => x.name === n);
  if (!f) throw new Error(`no ${n} in monsters.json`);
  return f;
};
const input = (over: Partial<AdvisorInput>): AdvisorInput => ({ levels: { attack: 30, strength: 30, defence: 1 }, gear: wearing(['Adamant scimitar']), mode: 'f2p', ...over });
const owned = (bank: Record<string, number>): OwnedState => ({
  bankSeen: true,
  items: new Map(Object.entries(bank).map(([name, n]) => [name.toLowerCase(), { name, carried: 0, noted: 0, bank: n }])),
});
const all = (a: ReturnType<typeof adviseGear>): GearAction[] => [...a.actions, ...a.armour, ...a.goals];
const spent = (a: ReturnType<typeof adviseGear>) => [...a.actions, ...a.armour].reduce((s, x) => s + (x.cost ?? 0), 0);
const prices = (list: Record<string, number>) => new Map(Object.entries(list).map(([n, p]) => [byName(n).id, p]));

describe('amulets: strength against power, across levels, styles and opponents', () => {
  const WEAPON: Record<number, string> = { 1: 'Iron scimitar', 10: 'Black scimitar', 20: 'Mithril scimitar', 30: 'Adamant scimitar', 40: 'Rune scimitar' };
  const AMULETS = prices({ 'Amulet of strength': 1500, 'Amulet of power': 1500 });

  it('the words follow the numbers: a max hit is named only when it changes, accuracy is never called speed, a changed style is named', () => {
    let checked = 0;
    let hitChanged = 0;
    let sameHit = 0;
    let styleNamed = 0;
    for (const attack of [1, 10, 20, 30, 40]) {
      for (let strength = 1; strength <= 99; strength += 7) {
        for (const opponent of ['Cow', 'Hill Giant', 'Ghast']) {
          for (const neck of [null, 'Amulet of strength', 'Amulet of power']) {
            const a = adviseGear({
              levels: { attack, strength, defence: 1 }, gear: wearing([WEAPON[attack], ...(neck ? [neck] : [])], 100_000), mode: 'f2p',
              foes: [foe(opponent)], gePrices: AMULETS,
            });
            for (const x of all(a)) {
              if (x.gain.kind !== 'dps') continue;
              const g = x.gain;
              const t = gainText(x);
              const where = `${x.item.name} at ${attack}/${strength} vs ${opponent}: ${t}`;
              checked++;
              expect(t, where).not.toMatch(/faster|quicker|speed/);
              expect(t.includes('one hit every'), where).toBe(Math.abs(g.after.speed - g.before.speed) > 0.01);
              const moved = g.after.style !== g.before.style;
              const shown = moved && g.kept && g.kept.maxHit > g.before.maxHit ? g.kept.maxHit : g.after.maxHit;
              if (shown !== g.before.maxHit) {
                hitChanged++;
                expect(t, where).toContain(`max hit ${shown} instead of ${g.before.maxHit}`);
              } else {
                sameHit++;
                expect(t, where).not.toMatch(/max hit \d+ instead of/);
              }
              if (moved && /max hit|accurate/.test(t)) {
                styleNamed++;
                expect(t, where).toMatch(/ on (Accurate|Aggressive)/);
              }
              if (x.slot === 'neck' && x.item.name === 'Amulet of strength') expect(t, where).not.toMatch(/defence/);
            }
          }
        }
      }
    }
    // The sweep reaches every branch: a higher max hit, the same max hit, and a change of the best style.
    expect(checked).toBeGreaterThan(200);
    expect(hitChanged).toBeGreaterThan(0);
    expect(sameHit).toBeGreaterThan(0);
    expect(styleNamed).toBeGreaterThan(0);
  });

  it('Strength 40 with a Bronze scimitar against a Hill Giant: the Amulet of strength keeps the max hit and moves the best style to Accurate', () => {
    const lv = { attack: 40, strength: 40, defence: 1 };
    const giant = foe('Hill Giant');
    const before = meleeWith(lv, byName('Bronze scimitar'), null, {}, giant);
    const after = meleeWith(lv, byName('Bronze scimitar'), byName('Amulet of strength'), {}, giant);
    expect([before.style, after.style, after.maxHit]).toEqual(['aggressive', 'accurate', before.maxHit]);
    const a = adviseGear(input({ levels: lv, gear: wearing(['Bronze scimitar'], 100_000), foes: [giant], gePrices: prices({ 'Amulet of strength': 1500 }) }));
    const neck = all(a).find((x) => x.item.name === 'Amulet of strength')!;
    expect(gainText(neck)).toMatch(/^same max hit, more accurate on Accurate \(hit chance \d+% → \d+%\), expected damage \+\d+%$/);
  });

  it('the amulet the player wears is never advised against the other one: the difference is under the threshold at every level', () => {
    for (const strength of [10, 30, 50, 70]) {
      for (const [worn, other] of [['Amulet of strength', 'Amulet of power'], ['Amulet of power', 'Amulet of strength']]) {
        const a = adviseGear(input({ levels: { attack: 40, strength, defence: 1 }, gear: wearing(['Rune scimitar', worn], 100_000), foes: [foe('Hill Giant')], gePrices: prices({ [other]: 1500 }) }));
        expect(all(a).some((x) => x.slot === 'neck'), `${worn} at ${strength}`).toBe(false);
      }
    }
  });
});

describe('defence is judged against the style that hits', () => {
  it('one style of the item, never the sum: the opponent\'s style when known, else the weakest melee style', () => {
    const kite = byName('Iron kiteshield');
    expect(relevantDefence(kite, 'stab')).toBe(kite.defence.stab);
    expect(relevantDefence(kite, 'crush')).toBe(kite.defence.crush);
    expect(relevantDefence(kite, null)).toBe(Math.min(kite.defence.stab, kite.defence.slash, kite.defence.crush));
    expect(relevantDefence(kite, null)).toBeLessThan(kite.defence.stab + kite.defence.slash + kite.defence.crush);
    expect(relevantDefence(null, 'crush')).toBe(0);
  });

  it('a Hill Giant crushes: armour is offered by crush defence, with how often it hits before and after', () => {
    const a = adviseGear(input({ levels: { attack: 30, strength: 21, defence: 1 }, gear: wearing(['Adamant scimitar'], 5000), foes: [foe('Hill Giant')] }));
    expect(a.incoming?.style).toBe('crush');
    const body = a.armour.find((x) => x.slot === 'body')!;
    expect(body.gain).toMatchObject({ kind: 'defence', style: 'crush', before: 0, after: body.item.defence.crush });
    const g = body.gain as Extract<GearAction['gain'], { kind: 'defence' }>;
    expect(g.hitBefore).toBeCloseTo(incomingChance(foeAttack(foe('Hill Giant'))!, 1, 0)!, 10);
    expect(g.hitAfter!).toBeLessThan(g.hitBefore!);
    expect(gainText(body)).toMatch(/^crush defence \+\d+ \(0 → \d+\): Hill Giant hits you \d+% → \d+% of the time$/);
  });

  it('an opponent whose attack the table does not know: the weakest melee style, and no invented hit chance', () => {
    const unknown = { ...foe('Cow'), name: 'Nobody in the table' };
    expect(foeAttack(unknown)).toBeNull();
    const a = adviseGear(input({ levels: { attack: 30, strength: 21, defence: 1 }, gear: wearing(['Adamant scimitar'], 5000), foes: [unknown] }));
    expect(a.incoming).toBeNull();
    const armour = a.armour.filter((x) => x.gain.kind === 'defence');
    expect(armour.length).toBeGreaterThan(0);
    for (const x of armour) {
      expect(gainText(x)).toContain('against every melee style');
      expect(gainText(x)).not.toContain('hits you');
      expect((x.gain as { after: number }).after).toBe(relevantDefence(x.item, null));
    }
  });
});

describe('what is worth doing now', () => {
  it('a defence change that barely moves the hit chance is not advised (live, 2.72.1: a chainbody against a cow, 23% to 22%)', () => {
    const a = adviseGear(input({
      levels: { attack: 30, strength: 21, defence: 1 },
      gear: wearing(['Adamant scimitar', 'Iron platebody', 'Iron kiteshield', 'Iron full helm', 'Iron plateskirt'], 0, 1827),
      owned: owned({ 'Iron chainbody': 1 }), foes: [foe('Cow')],
    }));
    expect(all(a).some((x) => x.item.name === 'Iron chainbody')).toBe(false);
    // What is still offered against an opponent the model knows makes it hit at least 3 points less often.
    let judged = 0;
    for (const opponent of ['Cow', 'Hill Giant']) {
      const b = adviseGear(input({ levels: { attack: 30, strength: 21, defence: 1 }, gear: wearing(['Adamant scimitar'], 100_000), foes: [foe(opponent)] }));
      for (const x of all(b)) {
        const g = x.gain as { kind: string; hitBefore?: number; hitAfter?: number };
        if (g.kind !== 'defence' || g.hitBefore === undefined || g.hitAfter === undefined) continue;
        judged++;
        expect(g.hitBefore - g.hitAfter, x.item.name + ' against ' + opponent).toBeGreaterThanOrEqual(0.03);
      }
    }
    expect(judged).toBeGreaterThan(0);
  });

  it('no worthwhile change: with the best wearable weapon and amulet and no coins there is nothing to do now', () => {
    const a = adviseGear(input({ levels: { attack: 40, strength: 40, defence: 1 }, gear: wearing(['Rune scimitar', 'Amulet of strength'], 0), foes: [foe('Hill Giant')] }));
    expect(a.actions).toEqual([]);
    expect(a.armour).toEqual([]);
    for (const x of a.goals) expect(x.short === undefined || x.short === x.cost).toBe(true);
  });

  it('what is owned comes before a purchase: the Mithril scimitar in the bank is worn for free, and nothing is bought for the slot', () => {
    const a = adviseGear(input({ levels: { attack: 20, strength: 20, defence: 1 }, gear: wearing(['Iron scimitar'], 50_000), owned: owned({ 'Mithril scimitar': 1 }) }));
    const weapon = a.actions.filter((x) => x.slot === 'weapon');
    expect(weapon).toHaveLength(1);
    expect(weapon[0]).toMatchObject({ how: 'wear', cost: 0, source: { kind: 'bank' }, item: { name: 'Mithril scimitar' } });
  });

  it('wearable but not affordable is a goal with the shortfall, never an action', () => {
    const a = adviseGear(input({ levels: { attack: 40, strength: 40, defence: 1 }, gear: wearing(['Bronze scimitar'], 500), gePrices: prices({ 'Rune scimitar': 15_000 }) }));
    const goal = a.goals.find((x) => x.item.name === 'Rune scimitar')!;
    expect(canWear(goal.item, a.levels)).toBe(true);
    expect(goal.cost).toBe(15_000);
    expect(goal.short).toBeGreaterThan(0);
    expect(goal.short).toBeLessThanOrEqual(15_000);
    expect(a.actions.some((x) => x.item.name === 'Rune scimitar')).toBe(false);
  });

  it('coins kept for the next supplies are not spent: a 410 gp scimitar waits as a goal when only 50 gp are free', () => {
    const base = input({ levels: { attack: 5, strength: 5, defence: 1 }, gear: wearing(['Bronze sword'], 100, 8400) });
    const free = adviseGear(base);
    expect(free.actions.find((x) => x.slot === 'weapon')?.item.name).toBe('Steel scimitar');
    const kept = adviseGear({ ...base, reserve: 8450 });
    expect(kept.reserve).toBe(8450);
    expect(kept.actions.some((x) => x.item.name === 'Steel scimitar')).toBe(false);
    expect(kept.goals.find((x) => x.item.name === 'Steel scimitar')).toMatchObject({ cost: 410, short: 360 });
    expect(spent(kept)).toBeLessThanOrEqual(8500 - 8450);
  });

  it('whatever the reserve, the gear bought now never eats into it', () => {
    for (const reserve of [0, 100, 500, 1000, 5000, 8000, 8500, 20_000]) {
      const a = adviseGear(input({ levels: { attack: 20, strength: 20, defence: 1 }, gear: wearing(['Iron scimitar'], 500, 8000), reserve }));
      expect(spent(a), String(reserve)).toBeLessThanOrEqual(Math.max(0, 8500 - reserve));
    }
  });

  it('an exchange price that did not load is never affordable and has no shortfall: it is never called the best value', () => {
    const a = adviseGear(input({ levels: { attack: 40, strength: 40, defence: 1 }, gear: wearing(['Bronze scimitar'], 1_000_000) }));
    const unpriced = all(a).filter((x) => x.cost === null);
    expect(unpriced.length).toBeGreaterThan(0);
    for (const x of unpriced) {
      expect(a.goals).toContain(x);
      expect(x.short).toBeUndefined();
    }
  });
});

describe('a two-handed weapon and the shield', () => {
  const data = { ...gearData, items: gearData.items.filter((i) => ['Bronze scimitar', 'Adamant 2h sword', 'Iron kiteshield'].includes(i.name)) };
  const lv = { attack: 30, strength: 30, defence: 1 };

  it('the shield comes off: its defence against the opponent\'s style is said, and the opponent hits more often', () => {
    const a = adviseGear(input({ levels: lv, gear: wearing(['Bronze scimitar', 'Iron kiteshield'], 100_000), foes: [foe('Hill Giant')], data }));
    const two = all(a).find((x) => x.item.name === 'Adamant 2h sword')!;
    expect(two.twoHanded).toBe(true);
    const g = two.gain as Extract<GearAction['gain'], { kind: 'dps' }>;
    expect(g.shieldLoss).toBe(byName('Iron kiteshield').defence.crush);
    expect(g.hitAfter!).toBeGreaterThan(g.hitBefore!);
    expect(gainText(two)).toContain(`but the shield comes off (crush defence −${g.shieldLoss})`);
  });

  it('with no shield worn nothing is lost and nothing is said about it', () => {
    const a = adviseGear(input({ levels: lv, gear: wearing(['Bronze scimitar'], 100_000), foes: [foe('Hill Giant')], data }));
    const two = all(a).find((x) => x.item.name === 'Adamant 2h sword')!;
    expect((two.gain as { shieldLoss?: number }).shieldLoss).toBeUndefined();
    expect(gainText(two)).not.toContain('shield');
  });
});

describe('the last known gear, per character', () => {
  const gear = (weapon: string): GearState => ({ equipment: [item(weapon)], inventory: [], coins: 250, bankCoins: 1000 });

  it('the format of older versions (one snapshot) is read as that character\'s', () => {
    const all = parseLastGears({ at: 1_700_000_000_000, player: 'Mark', gear: gear('Adamant scimitar') });
    expect(Object.keys(all)).toEqual(['mark']);
    expect(all.mark.gear.equipment?.[0].name).toBe('Adamant scimitar');
  });

  it('two characters keep their own snapshot: one never shows the other\'s gear, and the newest is known', () => {
    const all = parseLastGears({ byPlayer: {
      mark: { at: 1_700_000_000_000, player: 'Mark', gear: gear('Adamant scimitar') },
      alt: { at: 1_700_000_500_000, player: 'Iron Alt', gear: gear('Bronze sword') },
    } });
    expect(all.mark.gear.equipment?.[0].name).toBe('Adamant scimitar');
    expect(all['iron alt'].gear.equipment?.[0].name).toBe('Bronze sword');
    expect(newestGear(all)?.player).toBe('Iron Alt');
    expect(newestGear({})).toBeNull();
  });

  it('damaged entries are dropped one by one; garbage is as if nothing was saved', () => {
    const all = parseLastGears({ byPlayer: { a: { at: 1, player: 'A', gear: gear('Bronze sword') }, b: { at: 'x', player: 'B', gear: gear('Bronze sword') }, c: null } });
    expect(Object.keys(all)).toEqual(['a']);
    for (const bad of [null, 'x', [], {}, { byPlayer: [] }, { byPlayer: 'x' }]) expect(parseLastGears(bad), JSON.stringify(bad)).toEqual({});
  });
});

import { describe, expect, it } from 'vitest';
import { allSteps, itemById, items, plugins, reference, skills, stepsFor } from '../src/data';
import { emptyProgress, withStep } from '../src/lib/progress';
import type { Step } from '../src/types';
import { fightStepFor } from '../src/lib/gearAdvice';
import { buildIndex, search } from '../src/lib/search';
import { parseHash } from '../src/lib/router';
import {
  actionNav, adviseGear, canWear, DEFAULT_FOE, foeData, gainText, gearById, gearData, hudHint, killSeconds, meleeHit, meleeValue, meleeWith, routeNeeds,
  sourceText, statsText, stepFoes, watchNames, withKillEstimate, WINDOW,
  type AdvisorInput,
} from '../src/services/gearAdvisor';
import { matchStrict } from '../src/services/locationResolver';
import type { GearState } from '../src/services/runeliteBridge';
import type { OwnedState } from '../src/lib/checklist';
import type { GearData, GearPiece } from '../src/types';

const byName = (name: string): GearPiece => {
  const p = gearData.items.find((i) => i.name === name);
  if (!p) throw new Error(`no ${name} in gear.json`);
  return p;
};
const item = (name: string, slot?: string) => ({ id: byName(name).id, name, ...(slot ? { slot } : {}) });
const gear = (over: Partial<GearState> = {}): GearState => ({
  equipment: [item('Bronze sword', 'weapon')], inventory: [], coins: 100, bankCoins: 8400, ...over,
});
const input = (over: Partial<AdvisorInput> = {}): AdvisorInput => ({
  levels: { attack: 5, strength: 5, defence: 1, prayer: 1 }, gear: gear(), mode: 'f2p', ...over,
});
const owned = (bank: Record<string, number>): OwnedState => ({
  bankSeen: true,
  items: new Map(Object.entries(bank).map(([name, n]) => [name.toLowerCase(), { name, carried: 0, noted: 0, bank: n }])),
});

describe('damage formulas (OSRS Wiki, Damage per second/Melee)', () => {
  it('max hit: 99 strength without gear — 11, with a Rune scimitar — 19 (Aggressive style)', () => {
    const lv = { attack: 99, strength: 99, defence: 1 };
    expect(meleeHit(lv, 0, 0, 4, 'aggressive').maxHit).toBe(11);
    expect(meleeHit(lv, 45, 44, 4, 'aggressive').maxHit).toBe(19);
  });

  it('hit chance and damage per second are computed by the wiki formulas', () => {
    // 1 attack, Accurate style: (1+3+8)×64 = 768 > (1+9)×64 = 640 → 1 − 642/(2×769).
    const r = meleeHit({ attack: 1, strength: 1, defence: 1 }, 0, 0, 4, 'accurate');
    expect(r.hitChance).toBeCloseTo(1 - 642 / 1538, 10);
    expect(r.maxHit).toBe(1);
    expect(r.dps).toBeCloseTo((r.hitChance * (0.5 + 1 / 2)) / 2.4, 10);
  });

  it('without a weapon — a hit once every 2.4 s; a Bronze sword does not make it faster, but hits more accurately', () => {
    const lv = { attack: 5, strength: 5, defence: 1 };
    const fists = meleeWith(lv, null, null);
    const sword = meleeWith(lv, byName('Bronze sword'), null);
    expect(fists.speed).toBeCloseTo(2.4, 10);
    expect(sword.speed).toBeCloseTo(2.4, 10);
    expect(sword.dps).toBeGreaterThan(fists.dps);
  });

  it('the style and the type of hit — from the weapon category: a scimitar slashes, a mace crushes', () => {
    const lv = { attack: 20, strength: 20, defence: 1 };
    expect(meleeWith(lv, byName('Mithril scimitar'), null).type).toBe('slash');
    expect(meleeWith(lv, byName('Mithril mace'), null).type).toBe('crush');
    // Against the target's defence: the Flesh Crawler (defence level 10, bonus 15) is harder to hit than a cow.
    const crawler = foeData.foes.find((f) => f.name === 'Flesh Crawler')!;
    const hit = meleeWith(lv, byName('Mithril scimitar'), null, {}, crawler).hitChance;
    const vsCow = meleeWith(lv, byName('Mithril scimitar'), null).hitChance;
    expect(hit).toBeLessThan(vsCow);
  });

  it('the gain is computed at the nearest strength levels: a hit step does not hide the best sword', () => {
    const lv = { attack: 20, strength: 20, defence: 1 };
    // At 20 strength the Steel and Mithril scimitars hit up to 4 — at that very level the difference is only accuracy…
    expect(meleeWith(lv, byName('Mithril scimitar'), null).maxHit).toBe(meleeWith(lv, byName('Steel scimitar'), null).maxHit);
    // …and from 24 strength the mithril hits up to 5, the steel still up to 4.
    expect(meleeWith({ ...lv, strength: 24 }, byName('Mithril scimitar'), null).maxHit).toBe(5);
    expect(meleeWith({ ...lv, strength: 24 }, byName('Steel scimitar'), null).maxHit).toBe(4);
    const ratio = meleeValue(lv, byName('Mithril scimitar'), null) / meleeValue(lv, byName('Steel scimitar'), null);
    const atLevel = meleeWith(lv, byName('Mithril scimitar'), null).dps / meleeWith(lv, byName('Steel scimitar'), null).dps;
    expect(ratio).toBeGreaterThan(atLevel);
    expect(WINDOW).toBe(10);
    // At 99 strength the window does not go past the level limit.
    expect(meleeValue({ attack: 99, strength: 99, defence: 1 }, byName('Rune scimitar'), null)).toBeCloseTo(meleeWith({ attack: 99, strength: 99, defence: 1 }, byName('Rune scimitar'), null).dps, 10);
  });

  it('the strength prayer raises the hit when the strength level is enough', () => {
    const lv = { attack: 40, strength: 40, defence: 1 };
    const plain = meleeWith(lv, byName('Rune scimitar'), null);
    const burst = meleeWith(lv, byName('Rune scimitar'), null, { strength: 1.05 });
    expect(burst.maxHit).toBeGreaterThanOrEqual(plain.maxHit);
  });
});

describe('gear advice', () => {
  it('S1-13: Bronze sword, 5 attack, 8,500 coins → the Steel scimitar from Zeke first', () => {
    const a = adviseGear(input({ routeNeeds: routeNeeds(allSteps, () => false) }));
    const first = a.actions[0];
    expect(first).toMatchObject({ slot: 'weapon', how: 'buy', item: { name: 'Steel scimitar' } });
    expect(first.source).toMatchObject({ kind: 'shop', shop: "Zeke's Superior Scimitars", npc: 'Zeke', price: 400, toll: 10 });
    expect(first.cost).toBe(410);
    // On the route it is bought anyway in the big shopping.
    expect(first.routeStep).toBe('S2-01');
    expect(first.current?.name).toBe('Bronze sword');
    expect(gainText(first)).toMatch(/damage per second \+\d+%/);
    expect(sourceText(first.source)).toBe("from Zeke at Zeke's Superior Scimitars (Al Kharid) — 400 gp + 10 gp toll into Al Kharid");
    expect(hudHint(first)).toBe('⚡ Stronger: Steel scimitar from Zeke (Al Kharid), 400 gp');
    // Coins — the bag and the bank together.
    expect(a.coins).toEqual({ bag: 100, bank: 8400, total: 8500 });
  });

  it('after Prince Ali Rescue the gate is free', () => {
    const first = adviseGear(input({ freeToll: true })).actions[0];
    expect(first.source).not.toHaveProperty('toll');
    expect(first.cost).toBe(400);
  });

  it('the exchange is cheaper than the shop — we take the exchange, the shop stays as another option', () => {
    const steel = byName('Steel scimitar').id;
    const first = adviseGear(input({ gePrices: new Map([[steel, 150]]) })).actions[0];
    expect(first.source).toEqual({ kind: 'ge', price: 150 });
    expect(first.alternatives.some((s) => s.kind === 'shop')).toBe(true);
  });

  it('the shop is slightly pricier than the exchange — the shop first, the exchange as "or"', () => {
    const steel = byName('Steel scimitar').id;
    // Zeke: 400 + 10 for the gate = 410; on the exchange 350 — a difference of 60 gp, less than 100.
    const first = adviseGear(input({ gePrices: new Map([[steel, 350]]) })).actions[0];
    expect(first.source).toMatchObject({ kind: 'shop', npc: 'Zeke' });
    expect(first.cost).toBe(410);
    expect(first.alternatives).toContainEqual({ kind: 'ge', price: 350 });
  });

  it('the best is already in the bank — "wear it", and that comes first, for free', () => {
    const a = adviseGear(input({ owned: owned({ 'Steel scimitar': 1 }) }));
    expect(a.actions[0]).toMatchObject({ how: 'wear', slot: 'weapon', item: { name: 'Steel scimitar' }, cost: 0, source: { kind: 'bank' } });
    expect(hudHint(a.actions[0])).toBe('⚡ Wear Steel scimitar — it is in the bank');
    expect(actionNav(a.actions[0])).toBeNull();
    // There is nothing better to buy as a weapon at 5 attack — there is no second weapon purchase.
    expect(a.actions.filter((x) => x.slot === 'weapon')).toHaveLength(1);
  });

  it('S3-08, Attack 20 and a Steel scimitar → the Mithril scimitar from Zeke', () => {
    const foes = stepFoes(allSteps.find((s) => s.id === 'S3-08')!);
    const a = adviseGear(input({ foes, levels: { attack: 20, strength: 20, defence: 1 }, gear: gear({ equipment: [item('Steel scimitar', 'weapon')], coins: 10_000, bankCoins: 0 }) }));
    expect(a.actions[0]).toMatchObject({ slot: 'weapon', how: 'buy', item: { name: 'Mithril scimitar' }, source: { kind: 'shop', npc: 'Zeke', price: 1040 } });
    expect(a.foes.map((f) => f.name)).toEqual(['Minotaur']);
  });

  it('the best weapon is in the bag and a weaker one in the hand — "wear it", no need to buy', () => {
    const a = adviseGear(input({
      foes: stepFoes(allSteps.find((s) => s.id === 'S3-08')!),
      levels: { attack: 20, strength: 20, defence: 1 },
      gear: gear({ equipment: [item('Steel scimitar', 'weapon')], inventory: [item('Mithril scimitar')], coins: 5000, bankCoins: 0 }),
    }));
    expect(a.actions[0]).toMatchObject({ how: 'wear', item: { name: 'Mithril scimitar' }, source: { kind: 'bag' }, cost: 0 });
    expect(a.actions.some((x) => x.how === 'buy' && x.item.name === 'Mithril scimitar')).toBe(false);
  });

  it('in the bag — also "wear it"', () => {
    const a = adviseGear(input({ gear: gear({ inventory: [item('Steel scimitar')] }) }));
    expect(a.actions[0]).toMatchObject({ how: 'wear', item: { name: 'Steel scimitar' }, source: { kind: 'bag' } });
  });

  it('little money — the best affordable now, the best overall — the goal "save up", with the shortfall amount', () => {
    const a = adviseGear(input({ gear: gear({ coins: 50, bankCoins: 0 }) }));
    const now = a.actions.find((x) => x.slot === 'weapon')!;
    expect(now.cost).toBeLessThanOrEqual(50);
    expect(now.item.name).not.toBe('Steel scimitar');
    const goal = a.goals.find((x) => x.slot === 'weapon')!;
    expect(goal.item.name).toBe('Steel scimitar');
    expect(goal.short).toBe(410 - 50);
    // With no money at all — we buy nothing, only the goal.
    const broke = adviseGear(input({ gear: gear({ coins: 0, bankCoins: 0 }) }));
    expect(broke.actions.find((x) => x.slot === 'weapon')).toBeUndefined();
    expect(broke.goals.find((x) => x.slot === 'weapon')?.short).toBe(410);
  });

  it('of the nearly equal — the cheap one: at 12 attack against cows the Steel scimitar, not the Black one three times pricier', () => {
    const black = byName('Black scimitar').id;
    const a = adviseGear(input({ levels: { attack: 12, strength: 10, defence: 6 }, gePrices: new Map([[black, 1300]]), gear: gear({ coins: 120, bankCoins: 8400 }) }));
    expect(a.actions.find((x) => x.slot === 'weapon')!.item.name).toBe('Steel scimitar');
    // The Black scimitar is affordable and barely stronger — and not a "save up" goal either.
    expect(a.goals.some((x) => x.item.name === 'Black scimitar')).toBe(false);
  });

  it('money is spent in order: the weapon first, the remainder on the rest', () => {
    const a = adviseGear(input({ gear: gear({ coins: 500, bankCoins: 0 }) }));
    const spent = [...a.actions, ...a.armour].filter((x) => x.how === 'buy').reduce((s, x) => s + (x.cost ?? 0), 0);
    expect(a.actions[0].item.name).toBe('Steel scimitar');
    expect(spent).toBeLessThanOrEqual(500);
  });

  it('without game data — advice by levels, but without "enough money"', () => {
    const a = adviseGear(input({ gear: null }));
    expect(a.live).toBe(false);
    expect(a.actions).toEqual([]);
    expect(a.goals.find((x) => x.slot === 'weapon')?.item.name).toBe('Steel scimitar');
  });

  it('without game data — the goals carry the item properties, not a "+%" to the unknown; of the nearly equal — what the route buys', () => {
    const route = routeNeeds(allSteps, () => false);
    const foes = stepFoes(allSteps.find((s) => s.id === 'S3-08')!);
    const a = adviseGear(input({ gear: null, foes, routeNeeds: route, levels: { attack: 1, strength: 1, defence: 1 } }));
    const w = a.goals.find((x) => x.slot === 'weapon')!;
    // Against a minotaur the mace and the scimitar are close, and the route buys the scimitar anyway on S2-01.
    expect(w.item.name).toBe('Iron scimitar');
    expect(w.routeStep).toBe('S2-01');
    expect(statsText(w)).toMatch(/^max hit \d+, once every 2\.4 s$/);
    const neck = a.goals.find((x) => x.slot === 'neck');
    if (neck) expect(statsText(neck)).not.toMatch(/max hit/);
    expect(statsText({ ...w, slot: 'neck', item: byName('Amulet of strength') })).toBe('strength +10');
  });

  it('an old plugin without slots: the slot is taken from the item database', () => {
    const a = adviseGear(input({ gear: gear({ equipment: [item('Bronze sword')] }) }));
    expect(a.equipped.weapon?.piece?.name).toBe('Bronze sword');
  });

  it('an unfamiliar weapon in hand: we advise, but do not invent how much better', () => {
    const a = adviseGear(input({ gear: gear({ equipment: [{ id: 999999, name: 'Silverlight', slot: 'weapon' }] }) }));
    expect(a.weaponUnknown).toBe('Silverlight');
    const w = a.actions.find((x) => x.slot === 'weapon')!;
    expect(w.currentName).toBe('Silverlight');
    expect(gainText(w)).toContain('compare with Silverlight');
  });

  it('warhammers need strength (from the wiki articles), not attack', () => {
    expect(byName('Rune warhammer').req).toEqual({ strength: 40 });
    expect(canWear(byName('Rune warhammer'), { attack: 99, strength: 1, defence: 1 })).toBe(false);
    expect(canWear(byName('Rune warhammer'), { attack: 1, strength: 40, defence: 1 })).toBe(true);
  });

  it('an item with an unverified requirement is not advised', () => {
    // Since 2.8 the requirements of all items are confirmed by articles; we test the protection on an item marked by hand.
    const { reqFrom: _from, ...dagger } = byName('Adamant dagger');
    const data: GearData = { ...gearData, items: gearData.items.map((i) => (i.id === dagger.id ? { ...dagger, reqUnverified: true } : i)) };
    const lv = { attack: 99, strength: 99, defence: 99 };
    const a = adviseGear(input({ levels: lv, data, gear: gear({ coins: 10_000_000 }) }));
    expect([...a.actions, ...a.goals].some((x) => x.item.name === 'Adamant dagger')).toBe(false);
  });

  it('F2P does not get members items', () => {
    const members: GearData = { ...gearData, items: [...gearData.items, { ...byName('Rune scimitar'), id: 4587, name: 'Dragon scimitar', members: true, req: { attack: 60 }, strength: 66, attack: { ...byName('Rune scimitar').attack, slash: 67 } }] };
    const lv = { attack: 60, strength: 60, defence: 1 };
    const f2p = adviseGear(input({ levels: lv, data: members, gear: gear({ coins: 10_000_000 }) }));
    expect([...f2p.actions, ...f2p.goals].some((x) => x.item.name === 'Dragon scimitar')).toBe(false);
    const mem = adviseGear(input({ levels: lv, data: members, mode: 'members', gear: gear({ coins: 10_000_000 }) }));
    expect(mem.goals.concat(mem.actions).some((x) => x.item.name === 'Dragon scimitar')).toBe(true);
  });

  it('armour: at 1 defence — iron, the arrow leads to the seller with an item for the auto-removal', () => {
    const a = adviseGear(input({ gear: gear({ coins: 5000, bankCoins: 0 }) }));
    const body = a.armour.find((x) => x.slot === 'body')!;
    expect(body.item.name).toBe('Iron platebody');
    const nav = actionNav(body, 'S1-13')!;
    const horvik = matchStrict("Horvik's Armour Shop")!;
    expect(nav).toMatchObject({ label: "Horvik's Armour Shop", x: horvik.x, y: horvik.y, npcNames: ['Horvik'], itemName: 'Iron platebody', itemId: body.item.id, stepId: 'S1-13' });
  });

  it('what opens next: the next scimitar and the body', () => {
    const a = adviseGear(input());
    expect(a.unlocks[0]).toMatchObject({ item: { name: 'Black scimitar' }, skill: 'attack', level: 10, have: 5 });
    expect(a.unlocks[1]).toMatchObject({ item: { name: 'Steel platebody' }, skill: 'defence', level: 5, have: 1 });
  });

  it('prayers: the prayers unlocked by the prayer level', () => {
    expect(adviseGear(input({ levels: { attack: 5, strength: 5, defence: 1, prayer: 3 } })).prayers).toEqual([]);
    const p = adviseGear(input({ levels: { attack: 5, strength: 5, defence: 1, prayer: 8 } })).prayers.map((x) => x.name);
    expect(p).toEqual(['Burst of Strength', 'Clarity of Thought']);
  });

  it('what to ask the plugin about the bank: no more than three items per slot, all wearable and better than the worn one', () => {
    const names = watchNames(input());
    expect(names.length).toBeLessThanOrEqual(18);
    expect(names).toContain('Steel scimitar');
    for (const n of names) expect(canWear(byName(n), { attack: 5, strength: 5, defence: 1 }), n).toBe(true);
  });
});

describe('step opponents (monsters.json)', () => {
  it('every step opponent has a wiki card, the level matches the guide text', () => {
    const named = allSteps.filter((s) => s.foes?.length);
    expect(named.map((s) => s.id)).toEqual(['S1-13', 'S2-08', 'S3-08', 'S4-01', 'S4-02', 'S4-03', 'S8-02']);
    for (const s of named) {
      expect(stepFoes(s).map((f) => f.name), s.id).toEqual(s.foes);
      const text = [s.how, s.where, ...(s.fields ?? []).map((f) => f.text)].join(' ');
      for (const f of stepFoes(s)) {
        // "Count Draynor, level 34", "Moss giant, level 42", "cows (level 2)" — if the guide names a level, it is the same.
        const said = [...text.matchAll(/level\s*(\d+)/gi)].map((m) => Number(m[1]));
        if (said.length && s.id !== 'S3-08' && s.id !== 'S4-03') expect(said, `${s.id} ${f.name}`).toContain(f.combat);
      }
    }
    // The S3-08 and S4-03 opponents are named in "where": the minotaur 12 and the giant 42 — their levels are in the text.
    expect(foeData.foes.find((f) => f.name === 'Minotaur')!.combat).toBe(12);
    expect(foeData.foes.find((f) => f.name === 'Moss giant')!.combat).toBe(42);
  });

  it('quest opponents with a special weapon do not get into the advice: Delrith — Silverlight, Tanglefoot — secateurs', () => {
    for (const id of ['S3-03', 'S9-02']) expect(allSteps.find((s) => s.id === id)!.foes, id).toBeUndefined();
  });

  it('without a step the comparison is against a cow', () => {
    expect(DEFAULT_FOE).toMatchObject({ name: 'Cow', combat: 2, defenceLevel: 1 });
    expect(adviseGear(input()).foes).toEqual([DEFAULT_FOE]);
  });
});

describe('the first estimate of the combat pace', () => {
  const s308 = allSteps.find((s) => s.id === 'S3-08')!;
  const warrior = foeData.foes.find((f) => f.name === 'Minotaur')!;
  const lv = { attack: 20, strength: 20, defence: 1 };
  const iron: GearState = { equipment: [{ id: 1323, name: 'Iron scimitar', slot: 'weapon' }], inventory: [], coins: 0, bankCoins: null };

  it('seconds per opponent — its health / the damage per second of the current weapon', () => {
    const dps = meleeWith(lv, gearById.get(1323)!, null, {}, warrior).dps;
    expect(killSeconds(s308, lv, iron)).toBeCloseTo(warrior.hitpoints / dps, 6);
    // Without a weapon — fists: slower, but there is an estimate.
    const fists = killSeconds(s308, lv, { ...iron, equipment: [] })!;
    expect(fists).toBeGreaterThan(killSeconds(s308, lv, iron)!);
  });

  it('it is unknown what is in the hand, or there is no gear from the game — we do not invent the time', () => {
    expect(killSeconds(s308, lv, null)).toBeNull();
    expect(killSeconds(s308, lv, { ...iron, equipment: null })).toBeNull();
    expect(killSeconds(s308, lv, { ...iron, equipment: [{ id: 99999, name: 'Mystery blade', slot: 'weapon' }] })).toBeNull();
    expect(killSeconds({ foes: undefined }, lv, iron)).toBeNull();
  });

  it('the step goes to the game with the estimate, the other steps do not change', () => {
    const sent = withKillEstimate(s308, lv, iron);
    expect(sent.pacing!.secondsPerAction).toBe(Math.round(killSeconds(s308, lv, iron)! * 10) / 10);
    expect(s308.pacing!.secondsPerAction).toBeUndefined();
    expect(withKillEstimate(s308, lv, null)).toBe(s308);
    const fishing = allSteps.find((s) => s.id === 'S1-11')!;
    expect(withKillEstimate(fishing, lv, iron)).toBe(fishing);
  });
});

describe('the "Gear" page', () => {
  it('the comparison — with the opponent of the nearest unfinished combat step, and an open combat step — with its own', () => {
    const f2p = stepsFor('f2p');
    expect(fightStepFor(f2p, emptyProgress())?.id).toBe('S1-13');
    const cowsDone = withStep(emptyProgress(), 'S1-13', 'done');
    expect(fightStepFor(f2p, cowsDone)?.id).toBe('S2-08');
    const s308 = f2p.find((s) => s.id === 'S3-08')!;
    expect(fightStepFor(f2p, emptyProgress(), s308)?.id).toBe('S3-08');
    // A step without combat — the nearest one with combat is taken.
    expect(fightStepFor(f2p, emptyProgress(), f2p.find((s) => s.id === 'S1-08'))?.id).toBe('S1-13');
  });

  it('opens at #/gear and is found by search', () => {
    expect(parseHash('#/gear').page).toBe('gear');
    const index = buildIndex({ steps: stepsFor('f2p'), skills, reference, plugins, items, typeLabel: {} });
    for (const q of ['gear', 'weapon', 'armour', 'equipment', 'upgrade']) {
      expect(search(index, q).slice(0, 5).map((h) => h.item.href), q).toContain('#/gear');
    }
  });
});

describe('gear.json data', () => {
  it('IDs are unique, weapons have a speed, the requirements are from the wiki articles', () => {
    const ids = gearData.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const i of gearData.items) {
      if (i.slot === 'weapon') expect(i.speed, i.name).toBeGreaterThan(0);
      expect(i.members, i.name).toBe(false);
    }
    expect(gearData.items.length).toBeGreaterThanOrEqual(130);
  });

  it('matches the item database: the same IDs for the items present in both', () => {
    for (const i of gearData.items) {
      const other = itemById.get(i.id);
      if (other) expect(other.nameEn, `ID ${i.id}`).toBe(i.name);
    }
    // The scimitars and the amulet of strength from the S2-01 shopping are in the gear database.
    for (const name of ['Iron scimitar', 'Steel scimitar', 'Mithril scimitar', 'Amulet of strength']) expect(gearById.get(byName(name).id)).toBeTruthy();
  });

  it('shops with prices; Zeke has scimitars up to mithril', () => {
    const zeke = gearData.items.filter((i) => i.shops?.some((s) => s.shop === "Zeke's Superior Scimitars")).map((i) => [i.name, i.shops!.find((s) => s.shop === "Zeke's Superior Scimitars")!.price]);
    expect(zeke).toEqual([['Bronze scimitar', 32], ['Iron scimitar', 112], ['Steel scimitar', 400], ['Mithril scimitar', 1040]]);
  });
});

describe('amulets: Amulet of strength and Amulet of power do not argue (§69)', () => {
  const s308 = allSteps.find((s) => s.id === 'S3-08')!;
  const s403 = allSteps.find((s) => s.id === 'S4-03')!;
  const lv30 = { attack: 30, strength: 30, defence: 30 };
  // The levels a player really has at the end of each combat step now: Defence is not trained before Dragon Slayer I.
  const lvOf = (step: Step) => (step === s308 ? { attack: 30, strength: 20, defence: 1 } : { attack: 40, strength: 35, defence: 1 });
  const wearing = (...names: string[]) => gear({ equipment: names.map((n) => item(n, byName(n).slot === 'neck' ? 'amulet' : byName(n).slot)), coins: 50_000, bankCoins: 0 });
  const neckAdvice = (a: ReturnType<typeof adviseGear>) => [...a.actions, ...a.goals].filter((x) => x.slot === 'neck').map((x) => x.item.name);

  it('on all combat steps the amulet of strength hits faster than the amulet of power', () => {
    for (const step of allSteps.filter((s) => s.foes?.length)) {
      const foes = stepFoes(step);
      if (!foes.length) continue;
      const lv = { attack: 30, strength: 30, defence: 30 };
      expect(meleeValue(lv, byName('Adamant scimitar'), byName('Amulet of strength'), foes), step.id)
        .toBeGreaterThan(meleeValue(lv, byName('Adamant scimitar'), byName('Amulet of power'), foes));
    }
  });

  it('the amulet of strength is worn — the amulet of power is not advised, and vice versa: the difference is below the threshold', () => {
    for (const step of [s308, s403]) {
      const foes = stepFoes(step);
      expect(neckAdvice(adviseGear(input({ levels: lvOf(step), foes, gear: wearing('Adamant scimitar', 'Amulet of strength') })))).toEqual([]);
      expect(neckAdvice(adviseGear(input({ levels: lvOf(step), foes, gear: wearing('Adamant scimitar', 'Amulet of power') })))).toEqual([]);
    }
  });

  it('without an amulet — one main advice, and it is the amulet of strength, on any combat step', () => {
    for (const step of [s308, s403]) {
      const a = adviseGear(input({ levels: lvOf(step), foes: stepFoes(step), gear: wearing('Adamant scimitar') }));
      expect(neckAdvice(a)).toEqual(['Amulet of strength']);
    }
  });

  it('the amulet of strength in the bank — "wear it", not a trip to the exchange; the HUD says the same as the app', () => {
    const a = adviseGear(input({ levels: lv30, foes: stepFoes(s308), gear: wearing('Adamant scimitar'), owned: owned({ 'Amulet of strength': 1 }) }));
    const neck = a.actions.find((x) => x.slot === 'neck')!;
    expect(neck).toMatchObject({ how: 'wear', source: { kind: 'bank' }, item: { name: 'Amulet of strength' } });
    expect(hudHint(neck)).toBe('⚡ Wear Amulet of strength — it is in the bank');
    expect(a.actions.some((x) => x.item.name === 'Amulet of power')).toBe(false);
  });

  it('the route buys one amulet: the second goes neither into shopping nor into the auto-mark', () => {
    const buys = allSteps.flatMap((s) => (s.itemsRequired ?? []).filter((i) => /^Amulet of (strength|power)$/.test(i.nameEn)).map((i) => `${s.id}:${i.nameEn}`));
    expect(buys).toEqual(['S2-01:Amulet of strength']);
    const needs = routeNeeds(allSteps, () => false);
    expect(needs.get('amulet of power')).toBeUndefined();
    const s307 = allSteps.find((s) => s.id === 'S3-07')!;
    const trig = s307.inGame?.completionTrigger;
    expect(JSON.stringify(trig)).not.toContain('Amulet');
  });
});

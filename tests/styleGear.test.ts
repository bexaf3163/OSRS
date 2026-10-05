import { describe, expect, it } from 'vitest';
import { parseOption } from '../scripts/style-gear-parse';
import { adviseStyle, shoppingTotal, STYLE_GEAR, unmet, type StyleInput } from '../src/lib/styleGear';

const base = (over: Partial<StyleInput>): StyleInput => ({
  style: 'ranged', levels: {}, quests: new Set(), worn: new Set(), bag: new Set(), cash: null, price: () => 100, ...over,
});
const pick = (picks: ReturnType<typeof adviseStyle>, slot: string) => picks.find((p) => p.slot === slot)!;

describe('parsing the "Recommended equipment" block', () => {
  it('two requirements separated by commas, and a quest', () => {
    const o = parseOption("{{plink|Gilded d'hide body}} <small>(40 [[Ranged]], 40 [[Defence]], [[Dragon Slayer I]])</small>")!;
    expect(o.names).toEqual(["Gilded d'hide body"]);
    expect(o.reqs).toEqual([{ skill: 'ranged', level: 40 }, { skill: 'defence', level: 40 }]);
    expect(o.quests).toEqual(['Dragon Slayer I']);
  });
  it('"30 Attack and Magic" — both skills, not only the first', () => {
    const o = parseOption("{{plink|Bryophyta's staff}} <small>(30 [[Attack]] and [[Magic]])</small>")!;
    expect(o.reqs).toEqual([{ skill: 'attack', level: 30 }, { skill: 'magic', level: 30 }]);
    expect(o.note).toBeUndefined();
  });
  it('"A / B" — either of two items; footnotes are dropped', () => {
    const o = parseOption('{{plink|Black robe}} / {{plink|Zamorak monk top}}<ref>something</ref>')!;
    expect(o.names).toEqual(['Black robe', 'Zamorak monk top']);
  });
  it('no item — no option', () => expect(parseOption('just text')).toBeNull());
});

describe('wiki data', () => {
  it('every slot has an option without requirements — a slot is never left empty', () => {
    for (const style of ['magic', 'ranged'] as const) {
      for (const [slot, opts] of Object.entries(STYLE_GEAR[style])) {
        expect(opts.some((o) => !o.reqs.length && !o.quests.length), `${style}/${slot}`).toBe(true);
      }
    }
  });
  it('Bryophyta\'s staff has both requirements — Attack and Magic', () => {
    const o = STYLE_GEAR.magic.weapon.find((x) => x.names.includes("Bryophyta's staff"))!;
    expect(o.reqs.map((r) => r.skill).sort()).toEqual(['attack', 'magic']);
  });
});

describe('equipment advisor', () => {
  it('unmet: an unknown level does not block, a known one does', () => {
    const o = { names: ['x'], reqs: [{ skill: 'ranged', level: 40 }], quests: ['Dragon Slayer I'] };
    expect(unmet(o, {}, new Set())).toEqual(['Dragon Slayer I']);
    expect(unmet(o, { ranged: 30 }, new Set(['Dragon Slayer I']))).toEqual(['Ranged 40']);
    expect(unmet(o, { ranged: 40 }, new Set(['Dragon Slayer I']))).toEqual([]);
  });
  it('the quest is matched ignoring case and spaces', () => {
    const o = { names: ['x'], reqs: [], quests: ['Dragon Slayer I'] };
    expect(unmet(o, {}, new Set(['  dragon slayer i ']))).toEqual([]);
  });
  it('low level: a bow by level, and the best options are named as "better"', () => {
    const picks = adviseStyle(base({ levels: { ranged: 22, defence: 12 } }));
    expect(pick(picks, 'weapon').name).toBe('Willow shortbow');
    expect(pick(picks, 'weapon').better?.name).toBe('Maple shortbow');
    expect(pick(picks, 'body').name).toBe('Hardleather body');
  });
  it('without Dragon Slayer I we do not advise green dragonhide even with the levels', () => {
    const picks = adviseStyle(base({ levels: { ranged: 50, defence: 50 } }));
    expect(pick(picks, 'body').name).toBe('Studded body');
    expect(pick(picks, 'body').better?.why).toContain('Dragon Slayer I');
    const done = adviseStyle(base({ levels: { ranged: 50, defence: 50 }, quests: new Set(['Dragon Slayer I']) }));
    expect(["Gilded d'hide body", "Green d'hide body"]).toContain(pick(done, 'body').name);
  });
  it('what is already worn wins over a purchase; in the bag — too', () => {
    const picks = adviseStyle(base({ levels: { ranged: 22 }, worn: new Set(['Willow shortbow']), bag: new Set(['Mithril arrow']) }));
    expect(pick(picks, 'weapon')).toMatchObject({ name: 'Willow shortbow', status: 'worn' });
    expect(pick(picks, 'ammo')).toMatchObject({ name: 'Mithril arrow', status: 'bag' });
  });
  it('the wallet: the best is unaffordable — we take what is affordable and report the better one', () => {
    const prices: Record<string, number> = { 'Maple shortbow': 500, 'Willow shortbow': 80, 'Oak shortbow': 40, Shortbow: 10 };
    const picks = adviseStyle(base({ levels: { ranged: 40 }, cash: 100, price: (n) => prices[n] ?? 5 }));
    expect(pick(picks, 'weapon')).toMatchObject({ name: 'Willow shortbow', status: 'buy', price: 80 });
    expect(pick(picks, 'weapon').better?.name).toBe('Maple shortbow');
  });
  it('no money at all — "save up" for the cheapest suitable one', () => {
    const picks = adviseStyle(base({ levels: { ranged: 40 }, cash: 0, price: () => 50 }));
    expect(pick(picks, 'weapon').status).toBe('save');
    expect(shoppingTotal(picks)).toBeGreaterThan(0);
  });
  it('an item without an exchange price — "find", not "buy"', () => {
    const picks = adviseStyle(base({ style: 'magic', levels: { magic: 40, attack: 40 }, price: () => null }));
    expect(pick(picks, 'weapon')).toMatchObject({ name: "Bryophyta's staff", status: 'find' });
  });
  it('magic 30 but attack 10 — we do not advise Bryophyta\'s staff', () => {
    const picks = adviseStyle(base({ style: 'magic', levels: { magic: 30, attack: 10 } }));
    expect(pick(picks, 'weapon').name).not.toBe("Bryophyta's staff");
    expect(pick(picks, 'weapon').better?.why).toContain('Attack 30');
  });
  it('arrows are matched to the bow: for oak — not mithril and not adamant', () => {
    const oak = adviseStyle(base({ levels: { ranged: 10 } }));
    expect(pick(oak, 'weapon').name).toBe('Oak shortbow');
    expect(pick(oak, 'ammo').name).toBe('Steel arrow');
    expect(pick(oak, 'ammo').better?.why).toContain('Maple shortbow');
    const maple = adviseStyle(base({ levels: { ranged: 30 } }));
    expect(pick(maple, 'ammo').name).toBe('Adamant arrow');
    const plain = adviseStyle(base({ levels: { ranged: 1 } }));
    expect(pick(plain, 'weapon').name).toBe('Shortbow');
    expect(pick(plain, 'ammo').name).toBe('Iron arrow');
  });
  it('magic from level 13: the staff of fire, not the cheapest elemental one; before 13 — the cheapest', () => {
    const prices: Record<string, number> = { 'Staff of fire': 900, 'Staff of earth': 600, 'Staff of water': 700, 'Staff of air': 650 };
    const at = (magic: number, cash: number | null) => pick(adviseStyle(base({ style: 'magic', levels: { magic, attack: 1 }, cash, price: (n) => prices[n] ?? 50 })), 'weapon');
    expect(at(20, 5000)).toMatchObject({ name: 'Staff of fire', status: 'buy' });
    expect(at(8, 5000).name).toBe('Staff of earth');
    expect(at(20, 700).name).toBe('Staff of earth');
  });
  it('the price is unknown (null) — money does not cut off', () => {
    const picks = adviseStyle(base({ levels: { ranged: 40 }, cash: null }));
    expect(pick(picks, 'weapon').status).toBe('buy');
  });
});

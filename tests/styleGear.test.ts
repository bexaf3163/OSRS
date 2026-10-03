import { describe, expect, it } from 'vitest';
import { parseOption } from '../scripts/style-gear-parse';
import { adviseStyle, shoppingTotal, STYLE_GEAR, unmet, type StyleInput } from '../src/lib/styleGear';

const base = (over: Partial<StyleInput>): StyleInput => ({
  style: 'ranged', levels: {}, quests: new Set(), worn: new Set(), bag: new Set(), cash: null, price: () => 100, ...over,
});
const pick = (picks: ReturnType<typeof adviseStyle>, slot: string) => picks.find((p) => p.slot === slot)!;

describe('разбор блока «Recommended equipment»', () => {
  it('два требования через запятую и квест', () => {
    const o = parseOption("{{plink|Gilded d'hide body}} <small>(40 [[Ranged]], 40 [[Defence]], [[Dragon Slayer I]])</small>")!;
    expect(o.names).toEqual(["Gilded d'hide body"]);
    expect(o.reqs).toEqual([{ skill: 'ranged', level: 40 }, { skill: 'defence', level: 40 }]);
    expect(o.quests).toEqual(['Dragon Slayer I']);
  });
  it('«30 Attack and Magic» — оба навыка, а не только первый', () => {
    const o = parseOption("{{plink|Bryophyta's staff}} <small>(30 [[Attack]] and [[Magic]])</small>")!;
    expect(o.reqs).toEqual([{ skill: 'attack', level: 30 }, { skill: 'magic', level: 30 }]);
    expect(o.note).toBeUndefined();
  });
  it('«A / B» — любой из двух предметов; сноски отбрасываются', () => {
    const o = parseOption('{{plink|Black robe}} / {{plink|Zamorak monk top}}<ref>что-то</ref>')!;
    expect(o.names).toEqual(['Black robe', 'Zamorak monk top']);
  });
  it('нет предмета — нет варианта', () => expect(parseOption('просто текст')).toBeNull());
});

describe('данные вики', () => {
  it('у каждого слота есть вариант без требований — слот никогда не остаётся пустым', () => {
    for (const style of ['magic', 'ranged'] as const) {
      for (const [slot, opts] of Object.entries(STYLE_GEAR[style])) {
        expect(opts.some((o) => !o.reqs.length && !o.quests.length), `${style}/${slot}`).toBe(true);
      }
    }
  });
  it('у посоха Бриофиты оба требования — Attack и Magic', () => {
    const o = STYLE_GEAR.magic.weapon.find((x) => x.names.includes("Bryophyta's staff"))!;
    expect(o.reqs.map((r) => r.skill).sort()).toEqual(['attack', 'magic']);
  });
});

describe('советник по экипировке', () => {
  it('unmet: неизвестный уровень не блокирует, известный — блокирует', () => {
    const o = { names: ['x'], reqs: [{ skill: 'ranged', level: 40 }], quests: ['Dragon Slayer I'] };
    expect(unmet(o, {}, new Set())).toEqual(['Dragon Slayer I']);
    expect(unmet(o, { ranged: 30 }, new Set(['Dragon Slayer I']))).toEqual(['Ranged 40']);
    expect(unmet(o, { ranged: 40 }, new Set(['Dragon Slayer I']))).toEqual([]);
  });
  it('низкий уровень: лук по уровню, а лучшие варианты названы как «лучше»', () => {
    const picks = adviseStyle(base({ levels: { ranged: 22, defence: 12 } }));
    expect(pick(picks, 'weapon').name).toBe('Willow shortbow');
    expect(pick(picks, 'weapon').better?.name).toBe('Maple shortbow');
    expect(pick(picks, 'body').name).toBe('Hardleather body');
  });
  it('без Dragon Slayer I зелёную шкуру не советуем даже с уровнями', () => {
    const picks = adviseStyle(base({ levels: { ranged: 50, defence: 50 } }));
    expect(pick(picks, 'body').name).toBe('Studded body');
    expect(pick(picks, 'body').better?.why).toContain('Dragon Slayer I');
    const done = adviseStyle(base({ levels: { ranged: 50, defence: 50 }, quests: new Set(['Dragon Slayer I']) }));
    expect(["Gilded d'hide body", "Green d'hide body"]).toContain(pick(done, 'body').name);
  });
  it('уже надетое побеждает покупку; в сумке — тоже', () => {
    const picks = adviseStyle(base({ levels: { ranged: 22 }, worn: new Set(['Willow shortbow']), bag: new Set(['Mithril arrow']) }));
    expect(pick(picks, 'weapon')).toMatchObject({ name: 'Willow shortbow', status: 'worn' });
    expect(pick(picks, 'ammo')).toMatchObject({ name: 'Mithril arrow', status: 'bag' });
  });
  it('кошелёк: лучшее не по карману — берём то, что по карману, и сообщаем о лучшем', () => {
    const prices: Record<string, number> = { 'Maple shortbow': 500, 'Willow shortbow': 80, 'Oak shortbow': 40, Shortbow: 10 };
    const picks = adviseStyle(base({ levels: { ranged: 40 }, cash: 100, price: (n) => prices[n] ?? 5 }));
    expect(pick(picks, 'weapon')).toMatchObject({ name: 'Willow shortbow', status: 'buy', price: 80 });
    expect(pick(picks, 'weapon').better?.name).toBe('Maple shortbow');
  });
  it('денег нет совсем — «копить» самое дешёвое подходящее', () => {
    const picks = adviseStyle(base({ levels: { ranged: 40 }, cash: 0, price: () => 50 }));
    expect(pick(picks, 'weapon').status).toBe('save');
    expect(shoppingTotal(picks)).toBeGreaterThan(0);
  });
  it('предмет без цены на бирже — «добыть», а не «купить»', () => {
    const picks = adviseStyle(base({ style: 'magic', levels: { magic: 40, attack: 40 }, price: () => null }));
    expect(pick(picks, 'weapon')).toMatchObject({ name: "Bryophyta's staff", status: 'find' });
  });
  it('магия 30, но атаки 10 — посох Бриофиты не советуем', () => {
    const picks = adviseStyle(base({ style: 'magic', levels: { magic: 30, attack: 10 } }));
    expect(pick(picks, 'weapon').name).not.toBe("Bryophyta's staff");
    expect(pick(picks, 'weapon').better?.why).toContain('Attack 30');
  });
  it('стрелы подбираются под лук: к дубовому — не мифриловые и не адамантовые', () => {
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
  it('цена неизвестна (null) — деньги не отсекают', () => {
    const picks = adviseStyle(base({ levels: { ranged: 40 }, cash: null }));
    expect(pick(picks, 'weapon').status).toBe('buy');
  });
});

import { describe, expect, it } from 'vitest';
import { parseOption } from '../../../scripts/data/style-gear-parse';
import { STYLE_GEAR, ammoFits, usableStyleOption } from './styleGear';

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
  it('members bows from the Bow table: usable on members accounts at their level, firing every arrow up to their best', () => {
    const option = (name: string) => [...STYLE_GEAR.ranged.weapon, ...STYLE_GEAR.ranged.ammo].find((x) => x.names.includes(name))!;
    expect(usableStyleOption(option('Magic shortbow'), () => 50, () => true, 'members')).toBe(true);
    expect(usableStyleOption(option('Magic shortbow'), () => 50, () => true, 'f2p')).toBe(false);
    expect(usableStyleOption(option('Magic shortbow'), () => 49, () => true, 'members')).toBe(false);
    const fits = (arrow: string, bow: string) => ammoFits(option(arrow), bow, STYLE_GEAR.ranged.weapon) === null;
    expect(fits('Amethyst arrow', 'Magic shortbow')).toBe(true);
    expect(fits('Adamant arrow', 'Magic shortbow')).toBe(true);
    expect(fits('Amethyst arrow', 'Yew shortbow')).toBe(false);
    expect(fits('Rune arrow', 'Maple shortbow')).toBe(false);
  });
});

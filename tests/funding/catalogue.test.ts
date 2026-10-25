import { describe, expect, it } from 'vitest';
import { allQuests, itemById } from '../../src/data';
import coverageJson from '../../src/data/fundingCoverage.json';
import moneyJson from '../../src/data/moneyMaking.json';
import { COMBAT_FOES } from '../../src/lib/combatEstimate';
import { CATALOGUE, chanceOf, DEPENDABLE_CHANCE, expectedQty, isDependable, METHODS, methodById, validateCatalogue } from '../../src/lib/funding/methods';
import type { Catalogue } from '../../src/lib/funding/types';

const quests = new Set(allQuests.map((q) => q.title));
const foes = new Map<string, string[]>();
for (const f of COMBAT_FOES) if (!f.members) foes.set(f.name, [...(foes.get(f.name) ?? []), f.version ?? '']);
const ctx = { quests, foes };

describe('the method catalogue', () => {
  it('passes its own validation against the route and the combat data', () => {
    expect(validateCatalogue(CATALOGUE, ctx)).toEqual([]);
  });

  it('has the methods the audit promised, with stable ids', () => {
    expect(METHODS.map((m) => m.id).sort()).toEqual([
      'anchovy-pizzas', 'apple-pies', 'berry-pies', 'chocolate-cakes', 'chop-oak-draynor', 'chop-yew-edgeville', 'collect-iron-al-kharid',
      'cows-cowhide', 'feather-packs', 'fill-jugs-falador', 'fish-lobster-musa', 'giant-frogs', 'grind-chocolate', 'hill-giants', 'jug-packs',
      'kebabs-al-kharid', 'meat-pies', 'mine-coal-dwarven', 'mine-iron-dwarven', 'oziach-shields', 'pie-shells', 'pizza-bases', 'smelt-silver-bars',
      'smelt-steel-bars',
    ]);
    expect(methodById('hill-giants')?.combat?.foe).toBe('Hill Giant');
    expect(methodById('nothing')).toBeUndefined();
  });

  it('every method is free to play and names where its figures came from and when', () => {
    for (const m of METHODS) {
      expect(m.access, m.id).toBe('f2p');
      expect(m.sources.every((s) => s.url.startsWith('https://oldschool.runescape.wiki/')), m.id).toBe(true);
      expect(m.sources.every((s) => s.retrievedAt <= m.verifiedAt), m.id).toBe(true);
      expect(m.sources.some((s) => s.revision !== undefined), m.id).toBe(true);
    }
  });

  it('item ids agree with the project database wherever it knows the item', () => {
    for (const m of METHODS) {
      for (const f of [...m.inputs, ...m.outputs]) {
        const known = itemById.get(f.item.id);
        if (known) expect(known.nameEn, `${m.id}: ${f.item.id}`).toBe(f.item.name);
      }
    }
  });

  it('the Hill Giant drop table matches the wiki guide: expected coins and the always-dropped bones', () => {
    const hg = methodById('hill-giants')!;
    const coins = hg.outputs.filter((f) => f.item.id === 995).reduce((s, f) => s + expectedQty(f), 0);
    // 5*18 + 38*14 + 52*10 + 15*8 + 10*7 + 8*6 + 88*2 = 1556, over 128 (worked by hand from the wiki's drop lines).
    expect(coins).toBeCloseTo(1556 / 128, 10);
    const bones = hg.outputs.find((f) => f.item.id === 532)!;
    expect(chanceOf(bones)).toBe(1);
    expect(isDependable(bones)).toBe(true);
    // Limpwurt (11/128) is counted on; the runes and the body talisman (under 1/16) are upside.
    expect(isDependable(hg.outputs.find((f) => f.item.id === 225)!)).toBe(true);
    expect(isDependable(hg.outputs.find((f) => f.item.id === 563)!)).toBe(false);
    expect(DEPENDABLE_CHANCE).toBeCloseTo(0.0625, 10);
  });

  it('validation catches the mistakes it exists for', () => {
    const broken = structuredClone(CATALOGUE) as Catalogue;
    broken.methods[0].outputs[0].chance = [5, 3];
    broken.methods[1].rate.perHour = { slow: 10, typical: 5, fast: 1 };
    broken.methods[2].sources = [];
    broken.methods[3].requirements.push({ kind: 'quest', quest: 'No Such Quest', state: 'complete' });
    broken.methods[4].spot.plane = 9;
    broken.methods.push({ ...structuredClone(broken.methods[5]) });
    const problems = validateCatalogue(broken, ctx).join('\n');
    expect(problems).toMatch(/not a probability/);
    expect(problems).toMatch(/slow <= typical <= fast/);
    expect(problems).toMatch(/at least one source/);
    expect(problems).toMatch(/no quest called "No Such Quest"/);
    expect(problems).toMatch(/plane 9/);
    expect(problems).toMatch(/duplicate id/);
  });
});

describe('the coverage ledger', () => {
  const entries = coverageJson.entries;

  it('accounts for every guide in moneyMaking.json, once', () => {
    const ids = moneyJson.methods.map((m) => m.id).sort();
    expect(entries.map((e) => e.id).sort()).toEqual(ids);
  });

  it('every supported entry points at catalogue methods, and every method is covered', () => {
    const covered = new Set<string>();
    for (const e of entries) {
      if (e.status === 'supported') {
        expect((e as { methods?: string[] }).methods?.length, e.id).toBeGreaterThan(0);
        for (const id of (e as { methods: string[] }).methods) {
          expect(methodById(id), `${e.id} -> ${id}`).toBeDefined();
          covered.add(id);
        }
      } else {
        expect((e as { reason?: string }).reason, e.id).toBeTruthy();
      }
    }
    // A method that is no wiki guide (Giant frogs, 2.74.19) is covered by an extra that names it.
    for (const x of coverageJson.extras as { status: string; methods?: string[] }[]) if (x.status === 'supported') for (const id of x.methods ?? []) covered.add(id);
    expect([...covered].sort()).toEqual(METHODS.map((m) => m.id).sort());
  });

  it('names the families that are not wiki rows too, and says no to one-time rewards as a plan', () => {
    const extra = coverageJson.extras;
    expect(extra.map((e) => e.family).sort()).toEqual(['combat', 'one-time', 'self-supply', 'surplus-sale']);
    expect(extra.find((e) => e.family === 'one-time')?.status).toBe('unsupported');
  });
});

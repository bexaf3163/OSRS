import { describe, expect, it } from 'vitest';
import { allQuests, itemById, fundingCoverageJson as coverageJson, fundingWikiJson } from '../../src/data';
import { COMBAT_FOES } from '../../src/domain/combat/combatEstimate';
import { CATALOGUE, chanceOf, DEPENDABLE_CHANCE, expectedQty, isDependable, METHODS, methodById, validateCatalogue } from '../../src/domain/economy/funding/methods';
import type { Catalogue } from '../../src/domain/economy/funding/types';

const quests = new Set(allQuests.map((q) => q.title));
const foes = new Map<string, string[]>();
for (const f of COMBAT_FOES) if (!f.members) foes.set(f.name, [...(foes.get(f.name) ?? []), f.version ?? '']);
const ctx = { quests, foes };
const wiki = fundingWikiJson as unknown as { methods: { id: string }[]; notBuilt: { id: string }[] };
const WIKI = new Set(wiki.methods.map((m) => m.id));
const authored = METHODS.filter((m) => !WIKI.has(m.id));

describe('the method catalogue', () => {
  it('passes its own validation against the route and the combat data', () => {
    expect(validateCatalogue(CATALOGUE, ctx)).toEqual([]);
  });

  it('has the methods the audit promised, with stable ids', () => {
    expect(authored.map((m) => m.id).sort()).toEqual([
      'aerial-fishing-molch', 'agility-pyramid-tops', 'alch-ethereum-bracelets', 'anchovy-pizzas', 'apple-pies', 'berry-pies', 'blast-mine-lovakengj',
      'buy-pies-cooks-guild', 'buy-steel-nails', 'charge-air-orbs', 'charge-earth-orbs', 'charge-fire-orbs', 'charge-water-orbs', 'chocolate-cakes',
      'chop-oak-draynor', 'chop-yew-edgeville', 'clean-grimy-avantoe', 'clean-grimy-cadantine', 'clean-grimy-dwarf-weed', 'clean-grimy-guam',
      'clean-grimy-harralander', 'clean-grimy-irit', 'clean-grimy-kwuarm', 'clean-grimy-lantadyme', 'clean-grimy-marrentill',
      'clean-grimy-ranarr-weed', 'clean-grimy-snapdragon', 'clean-grimy-tarromin', 'clean-grimy-toadflax', 'clean-grimy-torstol',
      'collect-black-scimitars', 'collect-iron-al-kharid', 'collect-jangerberries', 'collect-monks-robes', 'collect-spades-falador',
      'cook-anglerfish', 'cook-dark-crabs', 'cook-marlin', 'cows-cowhide', 'craft-diamond-bracelets', 'craft-emerald-bracelets',
      'craft-gold-bracelets', 'craft-limestone-bricks', 'craft-ruby-bracelets', 'craft-sapphire-bracelets', 'crush-bird-nests',
      'cut-amethyst-arrowtips', 'cut-diamond-bolt-tips', 'cut-redwood-logs', 'cut-ruby-bolt-tips', 'dismantle-ethereum-bracelets',
      'enchant-dragonstone-rings', 'enchant-jade-amulets', 'enchant-sapphire-rings', 'enchant-topaz-rings', 'exchange-mole-parts', 'feather-packs',
      'fill-bullseye-lanterns', 'fill-jugs-falador', 'fish-anglerfish', 'fish-dark-crabs', 'fish-lobster-musa', 'fletch-diamond-bolts',
      'fletch-headless-arrows', 'fletch-sunlight-antler-bolts', 'giant-frogs', 'grind-chocolate', 'grind-goat-horns', 'grind-unicorn-horns',
      'hill-giants', 'jug-packs', 'kebabs-al-kharid', 'mahogany-planks-varrock', 'mahogany-planks-woodcutting-guild', 'make-ascension-bolts',
      'make-avantoe-potions-unf', 'make-cadantine-potions-unf', 'make-crystal-keys', 'make-diamond-ascension-bolts', 'make-dwarf-weed-potions-unf',
      'make-gloves-of-silence', 'make-guam-potions-unf', 'make-harralander-potions-unf', 'make-irit-potions-unf', 'make-kwuarm-potions-unf',
      'make-lantadyme-potions-unf', 'make-pineapple-pizzas', 'make-ranarr-potions-unf', 'make-raw-admiral-pies', 'make-raw-summer-pies',
      'make-raw-wild-pies', 'make-redwood-pyre-logs', 'make-snapdragon-potions-unf', 'make-super-combat-potions', 'make-tarromin-potions-unf',
      'make-toadflax-potions-unf', 'make-ultracompost', 'make-willow-birdhouses', 'meat-pies', 'mine-amethyst', 'mine-coal-dwarven',
      'mine-iron-dwarven', 'mine-runite-wilderness', 'motherlode-mine', 'open-crystal-chests', 'open-grubby-chests', 'open-sinister-chests',
      'oziach-shields', 'pick-bananas', 'pie-shells', 'pizza-bases', 'sell-silk-ardougne', 'smelt-silver-bars', 'smelt-steel-bars',
      'smith-steel-cannonballs', 'spin-flax-lumbridge', 'string-magic-longbows', 'string-maple-longbows', 'string-yew-longbows', 'subdue-tempoross',
      'tan-black-dragonhide', 'tan-blue-dragonhide', 'tan-green-dragonhide', 'tan-red-dragonhide', 'telegrab-wine-deep-wilderness',
      'telegrab-wine-of-zamorak', 'weave-bolts-of-canvas', 'weave-drift-nets',
    ]);
    expect(methodById('hill-giants')?.combat?.foe).toBe('Hill Giant');
    expect(methodById('nothing')).toBeUndefined();
  });

  it('every method says whether it needs membership and names where its figures came from and when', () => {
    for (const m of METHODS) {
      expect(['f2p', 'members'], m.id).toContain(m.access);
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

  it('accounts for every wiki guide once: hand-modelled or excluded in the ledger, built from its card, or listed as not built', () => {
    const ids = [...entries.map((e) => e.id), ...WIKI, ...wiki.notBuilt.map((n) => n.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(85);
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
    expect([...covered].sort()).toEqual(authored.map((m) => m.id).sort());
  });

  it('names the families that are not wiki rows too, and says no to one-time rewards as a plan', () => {
    const extra = coverageJson.extras;
    expect(extra.map((e) => e.family).sort()).toEqual(['combat', 'one-time', 'self-supply', 'surplus-sale']);
    expect(extra.find((e) => e.family === 'one-time')?.status).toBe('unsupported');
  });
});

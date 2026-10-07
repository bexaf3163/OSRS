import { describe, expect, it } from 'vitest';
import { allSteps, stepById } from '../src/data';
import type { QuestStageLine } from '../src/types';
import { BANK_SPOTS, countOf, guardedDestination, itemPreflight, missingChip } from '../src/lib/preflight';
import { dist, EXCHANGE } from '../src/lib/travel';
import { nameKey } from '../src/lib/checklist';
import { stepGuide } from '../src/services/runeliteBridge';
import type { GearItem } from '../src/services/runeliteBridge';

// The item pre-flight guard: a quest stage step that uses an item does not lead the arrow to its tile while the item is missing.

type Row = { step: string; stage: number; line: QuestStageLine };

const f2p = allSteps.filter((s) => !s.membersOnly && s.questStages);
const rows: Row[] = f2p.flatMap((s) => s.questStages!.stages.flatMap((st, stage) => st.do.map((line) => ({ step: s.id, stage, line }))));
const lineOf = (step: string, k: string, stage?: number): QuestStageLine => rows.find((r) => r.step === step && r.line.k === k && (stage === undefined || r.stage === stage))!.line;
const bag = (...rows: [string, number, number?][]): GearItem[] => rows.map(([name, id, count]) => ({ id, name, count: count ?? 1 }));
const at = (x: number, y: number, plane = 0) => ({ x, y, plane });
const strip = (s: string) => nameKey(s.replace(/\(.*\)/, ''));
const namesOf = (l: QuestStageLine) => (l.pre ?? []).map((p) => p.item);

/** The lines that use an item on an object or an NPC, or hand one in. */
const usesItem = (l: QuestStageLine) => !!l.need || (!!l.hl?.item?.length && !!(l.hl.obj?.length || l.hl.npc?.length || l.hl.on?.length));
const itemsOf = (l: QuestStageLine) => [...(l.need ? [l.need] : []), ...(l.hl?.item ?? [])];

/** Why a line that uses an item has no guard. */
const EXEMPT: Record<string, string> = {
  'S5-02:getShield': 'the line gives the item',
  'S5-05:repairMap': 'the map is made from three parts, not bought',
  'S5-07:repairMap': 'the map is made from three parts, not bought',
  'S5-07:talkToNed': 'the map is made from three parts, not bought',
  'S5-08:enterElvargArea': 'on Crandor: there is no way back to a shop, the shield is checked on the ship',
  'S5-09:finishQuest': "Elvarg's head cannot be fetched, only killed again",
};
const exempt = (r: Row) => r.step === 'S1-07' || `${r.step}:${r.line.k}` in EXEMPT;

describe('S3-02 Black Knights Fortress: the cabbage comes first', () => {
  const door = lineOf('S3-02', 'enterFortress');
  const entrance = at(3016, 3514);

  it('at the fortress entrance with no cabbage the arrow turns to the Falador cabbage field and says so', () => {
    const b = itemPreflight(door, { carried: bag(['Bronze med helm', 1139], ['Iron chainbody', 1101]), from: entrance })!;
    expect(b).not.toBeNull();
    expect(b.item).toBe('Cabbage');
    expect(b.via).toBe('source');
    expect(b.target).toMatchObject({ x: 3058, y: 3290, plane: 0 });
    expect(b.instruction).toBe('Pick Cabbage south of Falador (do NOT pick Draynor cabbage)');
    expect(b.on).toEqual(['Cabbage']);
    expect(b.chip).toBe('⚠ Missing Item: Cabbage - Turn back!');
    expect(guardedDestination(door, { carried: [], from: entrance })).toMatchObject({ x: 3058, y: 3290 });
  });

  it('the Draynor Manor cabbage has the same name and does not count: only the field cabbage (1965) does', () => {
    const manor = bag(['Cabbage', 1967]);
    expect(itemPreflight(door, { carried: manor, from: entrance })).not.toBeNull();
    expect(countOf(manor, { item: 'Cabbage', id: 1965 })).toBe(0);
    expect(itemPreflight(door, { carried: bag(['Cabbage', 1965]), from: entrance })).toBeNull();
    expect(guardedDestination(door, { carried: bag(['Cabbage', 1965]), from: entrance })).toEqual(at(3016, 3514));
  });

  it('both stages that enter the fortress and the hole line carry the guard', () => {
    const doors = rows.filter((r) => r.step === 'S3-02' && r.line.k === 'enterFortress');
    expect(doors).toHaveLength(2);
    for (const r of [...doors, ...rows.filter((x) => x.step === 'S3-02' && x.line.k === 'useCabbageOnHole')]) {
      expect(r.line.pre, `${r.step} stage ${r.stage}`).toEqual([expect.objectContaining({ item: 'Cabbage', id: 1965, at: [3058, 3290, 0] })]);
    }
  });

  it('a cabbage in the bank turns the arrow to the nearest bank instead of the field', () => {
    const b = itemPreflight(door, { carried: [], bank: bag(['Cabbage', 1965, 3]), from: at(2965, 3380) })!;
    expect(b.via).toBe('bank');
    expect(BANK_SPOTS).toContainEqual(expect.objectContaining({ x: b.target.x, y: b.target.y }));
    const nearest = BANK_SPOTS.reduce((m, c) => (dist(at(2965, 3380), c) < dist(at(2965, 3380), m) ? c : m));
    expect(b.target).toMatchObject({ x: nearest.x, y: nearest.y });
    // A bank holding only the Draynor cabbage does not help.
    expect(itemPreflight(door, { carried: [], bank: bag(['Cabbage', 1967]), from: at(2965, 3380) })!.via).toBe('source');
  });
});

describe('unknown is not missing', () => {
  it('a bag that was never read blocks nothing, and an unseen bank is not used', () => {
    const door = lineOf('S3-02', 'enterFortress');
    expect(itemPreflight(door, { carried: null, from: at(3016, 3514) })).toBeNull();
    expect(itemPreflight(door, { carried: [], bank: null, from: at(3016, 3514) })!.via).toBe('source');
    expect(itemPreflight({}, { carried: [], from: at(0, 0) })).toBeNull();
  });
});

describe('the Grand Exchange is the fallback for what can be bought', () => {
  it('Redberry pie has no place of its own: the arrow turns to the exchange and the bank wins when it holds one', () => {
    const l = lineOf('S2-07', 'talkToThurgo');
    const b = itemPreflight(l, { carried: [], from: at(3000, 3145) })!;
    expect(b).toMatchObject({ item: 'Redberry pie', via: 'exchange' });
    expect(b.target).toMatchObject({ x: EXCHANGE.x, y: EXCHANGE.y });
    expect(b.instruction).toBe('Buy Redberry pie on the Grand Exchange');
    expect(itemPreflight(l, { carried: [], bank: bag(['Redberry pie', 2325]), from: at(3000, 3145) })!.via).toBe('bank');
  });

  it('counts: two Iron bars are needed and one is not enough', () => {
    const l = lineOf('S2-07', 'bringThurgoOre');
    const have = bag(['Blurite ore', 668], ['Iron bar', 2351]);
    const b = itemPreflight(l, { carried: have, from: at(3000, 3145) })!;
    expect(b).toMatchObject({ item: 'Iron bar', need: 2, have: 1 });
    expect(itemPreflight(l, { carried: bag(['Blurite ore', 668], ['Iron bar', 2351, 2]), from: at(3000, 3145) })).toBeNull();
  });
});

describe('the quests named in the audit', () => {
  const items = (step: string, k: string) => namesOf(lineOf(step, k));

  it('Demon Slayer: the bucket of water before the drain, Silverlight before Delrith', () => {
    expect(items('S3-03', 'useFilledBucketOnDrain')).toEqual(['Bucket of water']);
    expect(items('S3-03', 'killDelrithStep')).toEqual(['Silverlight']);
    const delrith = itemPreflight(lineOf('S3-03', 'killDelrithStep'), { carried: bag(['Bucket', 1925]), from: at(3227, 3370) })!;
    expect(delrith.target).toMatchObject({ x: 3203, y: 3472 });
    expect(delrith.npc).toBe('Sir Prysin');
    expect(itemPreflight(lineOf('S3-03', 'killDelrithStep'), { carried: bag(['Silverlight', 2402]), from: at(3227, 3370) })).toBeNull();
  });

  it("The Knight's Sword: the pie before Thurgo, blurite ore and two iron bars before the smithing", () => {
    expect(items('S2-07', 'talkToThurgo')).toEqual(['Redberry pie']);
    expect(items('S2-07', 'bringThurgoOre')).toEqual(['Blurite ore', 'Iron bar']);
  });

  it('Vampyre Slayer: garlic, a stake and a hammer before the manor trapdoor', () => {
    for (const k of ['enterDraynorManor', 'goDownToBasement', 'openCoffin']) expect(items('S2-08', k), k).toEqual(['Garlic', 'Stake', 'Hammer']);
    const b = itemPreflight(lineOf('S2-08', 'goDownToBasement'), { carried: bag(['Garlic', 1550], ['Hammer', 2347]), from: at(3116, 3358) })!;
    expect(b.item).toBe('Stake');
    expect(b.target).toMatchObject({ x: 3222, y: 3397 });
  });

  it('Prince Ali Rescue: the dye for the wig, then rope, skirt, paste and the bronze key before the jail', () => {
    expect(items('S2-10', 'dyeWig')).toEqual(['Yellow dye']);
    for (const k of ['talkToJoe', 'useRopeOnKeli']) expect(items('S2-10', k), k).toEqual(['Rope', 'Pink skirt', 'Paste', 'Bronze key']);
    expect(items('S2-10', 'useKeyOnDoor')).toContain('Bronze key');
    const empty = itemPreflight(lineOf('S2-10', 'useRopeOnKeli'), { carried: [], from: at(3127, 3244) })!;
    expect(empty).toMatchObject({ item: 'Rope', via: 'source' });
    expect(empty.target).toMatchObject({ x: 3099, y: 3259 });
  });

  it('Dragon Slayer I: the four door items before the Dwarven Mine, the shield before the ship', () => {
    expect(items('S5-04', 'goIntoDwarvenMine')).toEqual(['Silk', 'Lobster pot', 'Unfired bowl', "Wizard's mind bomb"]);
    expect(items('S5-04', 'useMindBombOnDoor')).toEqual(["Wizard's mind bomb"]);
    const ship = lineOf('S5-08', 'boardShipToGo');
    expect(namesOf(ship)).toEqual(['Anti-dragon shield']);
    // Worn counts as carried: the plugin merges the bag and the worn items.
    expect(itemPreflight(ship, { carried: bag(['Anti-dragon shield', 1540]), from: at(3047, 3205) })).toBeNull();
    expect(itemPreflight(ship, { carried: [], from: at(3047, 3205) })!.target).toMatchObject({ x: 3211, y: 3223, plane: 1 });
  });
});

describe('every step that uses an item on an object or an NPC is guarded', () => {
  const used = rows.filter((r) => usesItem(r.line) && !exempt(r));

  it('there are such lines, and each carries a guard that names every item the line uses', () => {
    expect(used.length).toBeGreaterThanOrEqual(20);
    for (const r of used) {
      const have = (r.line.pre ?? []).map((p) => strip(p.item));
      for (const name of itemsOf(r.line)) expect(have, `${r.step} ${r.line.k}: ${name}`).toContain(strip(name));
    }
  });

  it('with none of the items the arrow never points at the step itself', () => {
    for (const r of used.filter((x) => x.line.at)) {
      const tile = at(r.line.at![0], r.line.at![1], r.line.at![2]);
      const dest = guardedDestination(r.line, { carried: [], from: tile })!;
      expect(dest, `${r.step} ${r.line.k}`).not.toBeNull();
      expect(dest.x === tile.x && dest.y === tile.y && dest.plane === tile.plane, `${r.step} ${r.line.k} still points at the step`).toBe(false);
    }
  });

  it('with everything in the bag the step is open and the arrow is its own tile', () => {
    for (const r of used.filter((x) => x.line.at)) {
      const all: GearItem[] = r.line.pre!.map((p, i) => ({ id: p.id ?? 900_000 + i, name: p.item, count: p.n ?? 1 }));
      const tile = at(r.line.at![0], r.line.at![1], r.line.at![2]);
      expect(itemPreflight(r.line, { carried: all, from: tile }), `${r.step} ${r.line.k}`).toBeNull();
      expect(guardedDestination(r.line, { carried: all, from: tile })).toEqual(tile);
    }
  });

  it('the exemptions are lines that exist and use an item', () => {
    for (const key of Object.keys(EXEMPT)) {
      const [step, k] = key.split(':');
      expect(rows.some((r) => r.step === step && r.line.k === k), key).toBe(true);
    }
  });
});

describe('the data of the guards', () => {
  const guarded = rows.filter((r) => r.line.pre);

  it('every entry is well formed: a name, a count of at least one, a place on the map, plain English and no id that is not a number', () => {
    expect(guarded.length).toBeGreaterThan(30);
    for (const { step, line } of guarded) {
      for (const p of line.pre!) {
        const where = `${step} ${line.k} ${p.item}`;
        expect(p.item.trim().length, where).toBeGreaterThan(0);
        expect(p.n === undefined || (Number.isInteger(p.n) && p.n >= 1), where).toBe(true);
        expect(p.id === undefined || (Number.isInteger(p.id) && p.id > 0), where).toBe(true);
        if (p.at) {
          expect(p.at, where).toHaveLength(3);
          expect(p.at[0] > 0 && p.at[1] > 0 && p.at[2] >= 0 && p.at[2] <= 3, where).toBe(true);
        }
        expect(JSON.stringify(p), where).not.toMatch(/[Ѐ-ӿ]/);
      }
    }
  });

  it('an item that cannot be bought has a place of its own: the exchange is never the answer for a quest item', () => {
    const QUEST_ITEMS = ['Portrait', 'Research notes', 'Research package', 'Silverlight', 'Paste', 'Bronze key', 'Key print', 'Chest key', 'Karamjan rum', 'Cadava potion'];
    for (const { step, line } of guarded) {
      for (const p of line.pre!.filter((x) => QUEST_ITEMS.includes(x.item))) expect(p.at, `${step} ${p.item}`).toBeDefined();
    }
  });

  it('the payload for the game carries the guards and the banks', () => {
    const g = stepGuide(stepById.get('S3-02')!);
    const lines = g.stage!.stages.flatMap((s) => s.steps);
    expect(lines.filter((l) => l.pre).map((l) => l.k).sort()).toEqual(['enterFortress', 'enterFortress', 'useCabbageOnHole']);
    expect(g.stage!.banks!.length).toBeGreaterThan(5);
    expect(g.stage!.banks).toContainEqual(expect.objectContaining({ label: 'Grand Exchange' }));
    expect(stepGuide(stepById.get('S1-04')!).stage?.banks).toBeUndefined();
  });

  it('the chip says what is missing and to turn back', () => {
    expect(missingChip('Stake')).toBe('⚠ Missing Item: Stake - Turn back!');
  });
});

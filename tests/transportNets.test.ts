import { describe, expect, it } from 'vitest';
import { TRANSPORT, travelOptions, wildernessLevel, type TravelInput } from '../src/lib/travel';
import { transportWatch, travelInputOf } from '../src/lib/travelInput';
import { recommendedTransport } from '../src/lib/transport';
import type { GearItem } from '../src/services/runeliteBridge';

// The transport the audit asked for and 2.54.1 left out (River Dougne canoes, spirit trees, gnome gliders, the Cowbell amulet). Each checked against the
// OSRS Wiki on 2026-10-15: the canoe station attendants' map pins and the wiki's numbered Dougne canoe map; the spirit tree list with its unlocks; the
// glider stations and the captains' pages (only Captain Errdo at the Grand Tree flies everywhere); the Cowbell amulet's two item ids and its teleport line.

const at = (x: number, y: number, plane = 0) => ({ x, y, plane });
const bag = (...rows: [string, number, number?][]): GearItem[] => rows.map(([name, count, id], i) => ({ id: id ?? i + 1, name, count }));
const base = (over: Partial<TravelInput>): TravelInput => ({ from: at(3222, 3218), to: at(3222, 3218), levels: {}, carried: null, bankSeen: false, members: true, ...over });
const option = (inp: TravelInput, id: string) => travelOptions(inp).find((o) => o.id === id);

describe('River Dougne canoes', () => {
  const castleWars = at(2442, 3140);
  const trainingCamp = at(2527, 3412);

  it('the five stations in the river order of the wiki map, members only', () => {
    expect(TRANSPORT.dougne!.members).toBe(true);
    expect(TRANSPORT.dougne!.stations.map((s) => s.npc)).toEqual(['Lara', 'Porkai', 'Pete', 'Amergin', 'Kaiquir']);
  });

  it('a Waka goes the whole river; the station is the first stop and is highlighted like a River Lum one', () => {
    const inp = base({ from: castleWars, to: trainingCamp, levels: { woodcutting: 60 }, carried: bag(['Bronze axe', 1]) });
    const o = option(inp, 'canoe-dougne')!;
    expect(o.title).toBe('Canoe Castle Wars → Combat Training Camp');
    expect(o.legs[1].label).toMatch(/^Waka: 4 stops/);
    expect(o.availability).toBe('ready');
    const rec = recommendedTransport([option(inp, 'walk')!, o])!;
    expect(rec.type).toBe('canoe');
    expect(rec.interactionName).toBe('Canoe Station');
    expect(rec.tile).toMatchObject({ x: 2439, y: 3136 });
  });

  it('the level decides the reach: Woodcutting 27 is two stops, and the farther canoe is shown as needing the level', () => {
    const inp = base({ from: castleWars, to: trainingCamp, levels: { woodcutting: 27 }, carried: bag(['Bronze axe', 1]) });
    expect(option(inp, 'canoe-dougne')!.availability).toBe('locked');
    const now = option(inp, 'canoe-dougne-now');
    if (now) expect(now.legs[1].label).toMatch(/^(Log|Dugout): [12] stops?/);
  });

  it('a free-to-play account is never offered the Dougne; an unknown membership makes it a thing to check', () => {
    expect(option(base({ from: castleWars, to: trainingCamp, levels: { woodcutting: 60 }, carried: bag(['Bronze axe', 1]), members: false }), 'canoe-dougne')).toBeUndefined();
    const unsure = option(base({ from: castleWars, to: trainingCamp, levels: { woodcutting: 60 }, carried: bag(['Bronze axe', 1]), members: null }), 'canoe-dougne')!;
    expect(unsure.availability).toBe('maybe');
  });

  it('the River Lum canoe keeps its ids and is not mixed with the Dougne', () => {
    const lum = option(base({ from: at(3241, 3240), to: at(3130, 3510), levels: { woodcutting: 60 }, carried: bag(['Bronze axe', 1]) }), 'canoe')!;
    expect(lum.title).toBe('Canoe Lumbridge → Edgeville');
  });
});

describe('spirit trees', () => {
  const ge = at(3165, 3487);
  const battlefield = at(2552, 3262);

  it('Tree Gnome Village completed: ready; not reported: a thing to check; reported missing: locked', () => {
    const go = (questsDone: string[] | null) => option(base({ from: ge, to: battlefield, questsDone }), 'spirit-tree')!;
    const ready = go(['Tree Gnome Village']);
    expect(ready.title).toBe('Spirit tree Grand Exchange → Battlefield of Khazard');
    expect(ready.availability).toBe('ready');
    expect(go(null).availability).toBe('maybe');
    expect(go([]).availability).toBe('locked');
    expect(ready.overheadTiles).toBeGreaterThan(0);
  });

  it('leaving from the Gnome Stronghold tree needs The Grand Tree as well', () => {
    const fromStronghold = (questsDone: string[]) => option(base({ from: at(2461, 3440), to: ge, questsDone }), 'spirit-tree')!;
    expect(fromStronghold(['Tree Gnome Village']).title).toMatch(/^Spirit tree Gnome Stronghold → /);
    expect(fromStronghold(['Tree Gnome Village']).availability).toBe('locked');
    expect(fromStronghold(['Tree Gnome Village', 'The Grand Tree']).availability).toBe('ready');
  });

  it('the recommendation names the tree to click, and a free-to-play account is not offered one', () => {
    const inp = base({ from: ge, to: battlefield, questsDone: ['Tree Gnome Village'] });
    const rec = recommendedTransport(travelOptions(inp))!;
    expect(rec.type).toBe('spirit_tree');
    expect(rec.interactionName).toBe('Spirit tree');
    expect(rec.tile).toMatchObject({ x: 3185, y: 3510 });
    expect(option({ ...inp, members: false }, 'spirit-tree')).toBeUndefined();
  });
});

describe('gnome gliders', () => {
  const alKharid = at(3282, 3215);
  const whiteWolf = at(2849, 3495);

  it('two outer stations are two flights through the Grand Tree, both counted', () => {
    const o = option(base({ from: alKharid, to: whiteWolf, questsDone: ['The Grand Tree'] }), 'glider')!;
    expect(o.title).toBe('Glider Kar-Hewo (Al Kharid) → Sindarpos (White Wolf Mountain)');
    expect(o.legs[1].label).toMatch(/two flights/);
    expect(o.overheadTiles).toBe(2 * Math.round(10 * (2 / 0.6)));
    expect(o.availability).toBe('ready');
    const rec = recommendedTransport([option(base({ from: alKharid, to: whiteWolf, questsDone: ['The Grand Tree'] }), 'walk')!, o])!;
    expect(rec.type).toBe('glider');
    expect(rec.interactionName).toBe('Captain Dalbur');
  });

  it('the Grand Tree station is on the top floor: the stairs count in the walk', () => {
    const top = TRANSPORT.gliders!.stations.find((s) => s.id === 'ta-quir-priw')!;
    expect(top.plane).toBe(3);
  });

  it('Lemanto Andra is only ever a destination', () => {
    for (const to of [whiteWolf, at(2466, 3496), at(2972, 2974)]) {
      const o = option(base({ from: at(3325, 3430), to, questsDone: ['The Grand Tree'] }), 'glider');
      if (o) expect(o.title).not.toMatch(/^Glider Lemanto Andra/);
    }
  });

  it('Ape Atoll needs Monkey Madness II; the Feldip glider is a thing to check (One Small Favour is read only as done or not)', () => {
    const ape = option(base({ from: at(2466, 3496, 3), to: at(2714, 2805), questsDone: ['The Grand Tree'] }), 'glider')!;
    expect(ape.title).toMatch(/→ Ookookolly Undri/);
    expect(ape.availability).toBe('locked');
    const feldip = option(base({ from: at(2466, 3496, 3), to: at(2544, 2975), questsDone: ['The Grand Tree'] }), 'glider')!;
    expect(feldip.availability).toBe('maybe');
  });
});

describe('the Cowbell amulet', () => {
  const C = TRANSPORT.cowbell!;
  const cows = at(3255, 3280);
  const far = at(3100, 3420);

  it('the wiki facts: free-to-play, two item ids, one Air rune per charge, the cow field line', () => {
    expect([C.emptyId, C.chargedId]).toEqual([33103, 33104]);
    expect(C.chargeWith).toBe('Air rune');
    expect(C.dest).toMatchObject({ x: 3259, y: 3277 });
  });

  it('charged (by item id): ready, even on a free-to-play account; the same name with the empty id is not', () => {
    const charged = option(base({ from: far, to: cows, members: false, carried: bag(['Cowbell amulet', 1, C.chargedId]) }), 'cowbell')!;
    expect(charged.availability).toBe('ready');
    const rec = recommendedTransport(travelOptions(base({ from: far, to: cows, members: false, carried: bag(['Cowbell amulet', 1, C.chargedId]) })))!;
    expect(rec).toMatchObject({ type: 'item_teleport', item: 'Cowbell amulet' });
    const empty = option(base({ from: far, to: cows, carried: bag(['Cowbell amulet', 1, C.emptyId]), bankSeen: true, bank: new Map() }), 'cowbell')!;
    expect(empty.availability).toBe('locked');
  });

  it('empty with Air runes in the bag: ready after one Air rune is used on it', () => {
    const o = option(base({ from: far, to: cows, carried: bag(['Cowbell amulet', 1, C.emptyId], ['Air rune', 30]) }), 'cowbell')!;
    expect(o.availability).toBe('ready');
    expect(o.needs.find((n) => n.action)?.action).toBe('use an Air rune on the Cowbell amulet');
  });

  it('an id the game did not tell is a thing to check, never ready', () => {
    const o = option(base({ from: far, to: cows, carried: [{ name: 'Cowbell amulet', count: 1 } as unknown as GearItem] }), 'cowbell')!;
    expect(o.availability).toBe('maybe');
  });

  it('not above level 20 Wilderness; not offered when it is not carried (it cannot be bought)', () => {
    expect(wildernessLevel(at(3100, 3700))).toBe(23);
    expect(wildernessLevel(at(3222, 3218))).toBe(0);
    expect(option(base({ from: at(3100, 3700), to: cows, carried: bag(['Cowbell amulet', 1, C.chargedId]) }), 'cowbell')!.availability).toBe('locked');
    expect(option(base({ from: far, to: cows, carried: bag(['Coins', 100]) }), 'cowbell')).toBeUndefined();
  });

  it('the game is asked to count it', () => {
    expect(transportWatch('f2p')).toContain('Cowbell amulet');
  });
});

describe('the completed quests reach the planner', () => {
  it('travelInputOf passes them on; absent stays absent (unknown)', () => {
    const src = { from: at(1, 1), to: at(2, 2), levels: {}, stats: null, gear: null, owned: null, mode: 'members' as const };
    expect(travelInputOf({ ...src, questsDone: ['The Grand Tree'] }).questsDone).toEqual(['The Grand Tree']);
    expect('questsDone' in travelInputOf(src)).toBe(false);
  });
});

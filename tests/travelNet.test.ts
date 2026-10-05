import { describe, expect, it } from 'vitest';
import {
  EXCHANGE, NET, OPPORTUNISTIC_MAX_COST, OPPORTUNISTIC_MAX_DETOUR_TILES, OPPORTUNISTIC_MIN_SAVING_TILES, TRANSPORT, dist, travelOptions, type TravelInput, type TravelOption,
} from '../src/lib/travel';
import { nameKey } from '../src/lib/checklist';
import type { GearItem } from '../src/services/runeliteBridge';

const at = (x: number, y: number, plane = 0) => ({ x, y, plane });
const bag = (...rows: [string, number][]): GearItem[] => rows.map(([name, count], i) => ({ id: i + 1, name, count }));
const run = (over: Partial<TravelInput>): TravelOption[] => travelOptions({ from: at(3222, 3218), to: at(2780, 3613), levels: {}, carried: null, bankSeen: false, ...over });
const find = (opts: TravelOption[], id: string) => opts.find((o) => o.id === id);

describe('transport networks: the data generated from the wiki', () => {
  it('fairy rings: unique three-letter codes in the real code alphabet, tiles on the map, some underground', () => {
    const codes = NET.fairyRings.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.length).toBeGreaterThanOrEqual(45);
    for (const r of NET.fairyRings) {
      expect(r.code, r.code).toMatch(/^[A-D][I-L][P-S]$/);
      expect(r.x).toBeGreaterThan(1000);
      expect(r.x).toBeLessThan(4000);
      expect(r.place.length, r.code).toBeGreaterThan(3);
      expect(r.underground, r.code).toBe(r.y >= 4000);
    }
    expect(NET.fairyRings.find((r) => r.code === 'AIQ')).toMatchObject({ x: 2996, y: 3114 });
    expect(NET.fairyRings.some((r) => r.underground)).toBe(true);
  });

  it('charter: a square fare table with no fare to the same port, and the wiki example fare', () => {
    const { ports, fares } = NET.charter;
    expect(ports.length).toBeGreaterThanOrEqual(15);
    expect(fares.length).toBe(ports.length);
    fares.forEach((row, i) => {
      expect(row.length).toBe(ports.length);
      expect(row[i], ports[i].name).toBeNull();
      for (const f of row) if (f !== null) expect(f).toBeGreaterThanOrEqual(200);
      for (const f of row) if (f !== null) expect(f).toBeLessThanOrEqual(5200);
    });
    const idx = (n: string) => ports.findIndex((p) => p.name === n);
    expect(fares[idx('Brimhaven')][idx('Civitas illa Fortis')]).toBe(2400); // the example on the wiki page
    expect(ports.find((p) => p.name === 'Port Sarim')).toMatchObject({ x: 3038, y: 3191 });
  });

  it('the tablets point at existing spells, and the exchange is the Grand Exchange tile', () => {
    for (const t of NET.tablets) expect(TRANSPORT.teleports.some((s) => s.id === t.spell), t.id).toBe(true);
    expect(NET.tablets.map((t) => t.item)).toEqual(['Varrock teleport', 'Lumbridge teleport', 'Falador teleport']);
    expect(dist(EXCHANGE, at(3165, 3490))).toBeLessThan(5);
  });
});

describe('fairy ring routing', () => {
  it('Lumbridge to the Rellekka slayer cave: a ring pair saves a lot, only surface rings, a fairy leg in the middle', () => {
    const o = find(run({ members: true, carried: bag(['Dramen staff', 1]) }), 'fairy')!;
    expect(o).toBeTruthy();
    const direct = dist(at(3222, 3218), at(2780, 3613));
    expect(o.walkTiles).toBeLessThan(direct - 100);
    expect(o.legs.map((l) => l.kind)).toEqual(['walk', 'fairy', 'walk']);
    const [, a, b] = /([A-D][I-L][P-S]) → ([A-D][I-L][P-S])/.exec(o.title)!;
    for (const code of [a, b]) expect(NET.fairyRings.find((r) => r.code === code)!.underground, code).toBe(false);
    expect(o.go).toBeTruthy();
  });

  it('it is never "ready" while the quest is unknown, locked without a staff once the bank was seen, and hidden on a free-to-play account', () => {
    const ok = find(run({ members: true, carried: bag(['Dramen staff', 1]) }), 'fairy')!;
    expect(ok.availability).toBe('maybe');
    expect(ok.needs.find((n) => n.text.includes('Fairytale II'))!.ok).toBeNull();
    expect(ok.needs.find((n) => n.text.includes('dramen'))!.ok).toBe(true);
    expect(find(run({ members: false, carried: bag(['Dramen staff', 1]) }), 'fairy'), 'a known free-to-play account is not offered members-only ways').toBeUndefined();
    expect(find(run({ members: false, carried: bag(['Coins', 9000]) }), 'charter')).toBeUndefined();
    expect(find(run({ members: true, carried: bag(['Coins', 5]), bankSeen: true }), 'fairy')!.availability).toBe('locked');
    const lunar = find(run({ members: true, carried: bag(['Lunar staff', 1]) }), 'fairy')!;
    expect(lunar.needs.find((n) => n.text.includes('dramen'))!.ok).toBe(true);
  });

  it('without game data nothing is invented: the staff and the account are "unknown", not "missing"', () => {
    const o = find(run({}), 'fairy')!;
    expect(o.needs.find((n) => n.text.includes('dramen'))!.ok).toBeNull();
    expect(o.needs.find((n) => n.text.includes('members'))!.ok).toBeNull();
    expect(o.availability).toBe('maybe');
    const bagOnly = find(run({ carried: bag(['Coins', 5]), bankSeen: false }), 'fairy')!;
    expect(bagOnly.needs.find((n) => n.text.includes('dramen'))!.ok, 'the bank was not opened: it may be lying there').toBeNull();
  });

  it('a short trip does not offer a ring', () => {
    expect(find(run({ from: at(3222, 3218), to: at(3213, 3240) }), 'fairy')).toBeUndefined();
  });
});

describe('charter ship routing', () => {
  const sarim = at(3040, 3195);
  const catherby = at(2795, 3420);

  it('Port Sarim to Catherby: a charter with the wiki fare, ready with the coins and a members account', () => {
    const o = find(run({ from: sarim, to: catherby, members: true, carried: bag(['Coins', 5000]) }), 'charter')!;
    expect(o).toBeTruthy();
    expect(o.title).toBe('Charter ship Port Sarim → Catherby');
    expect(o.legs[1]).toMatchObject({ kind: 'charter' });
    expect(o.legs[1].label).toContain('1000 gp');
    expect(o.availability).toBe('ready');
  });

  it('too few coins once the bank was seen locks it; unknown coins do not', () => {
    const poor = find(run({ from: sarim, to: catherby, members: true, carried: bag(['Coins', 100]), bankSeen: true }), 'charter')!;
    expect(poor.availability).toBe('locked');
    const unknown = find(run({ from: sarim, to: catherby, members: true, carried: null }), 'charter')!;
    expect(unknown.needs.find((n) => n.text.includes('gp'))!.ok).toBeNull();
    expect(unknown.availability).toBe('maybe');
  });

  it('a port pair with no route is never chosen', () => {
    const { ports, fares } = NET.charter;
    const a = ports.findIndex((p) => p.name === 'Aldarin');
    const s = ports.findIndex((p) => p.name === 'Sunset Coast');
    expect(fares[a][s]).toBeNull();
    const o = find(run({ from: at(ports[a].x, ports[a].y), to: at(ports[s].x + 2, ports[s].y), members: true }), 'charter');
    if (o) expect(o.title).not.toBe('Charter ship Aldarin → Sunset Coast');
  });

  it('a requirement of a port is shown as a thing to check, not as met', () => {
    const o = find(run({ from: at(3700, 3500), to: at(3668, 2935), members: true, carried: bag(['Coins', 9000]) }), 'charter');
    if (o) for (const n of o.needs.filter((x) => /Priest in Peril|Cabin Fever/.test(x.text))) expect(n.ok).toBeNull();
  });
});

describe('opportunistic routing: fetch the teleport first when it is clearly worth it', () => {
  // Near the Grand Exchange, heading for Falador: the tablet saves the long walk and the exchange is 50 tiles away.
  const nearGE = at(3165, 3440);
  const falador = at(2970, 3380);
  const price = (p: number | undefined) => (name: string) => (name === 'Falador teleport' ? p : undefined);

  it('buy at the exchange: the detour, the price and a point to lead to; the app only suggests it', () => {
    const o = find(run({ from: nearGE, to: falador, carried: bag(['Coins', 5000]), bankSeen: true, priceOf: price(600) }), 'falador-tab-acquire')!;
    expect(o).toBeTruthy();
    expect(o.acquire).toMatchObject({ source: 'exchange', cost: 600, where: 'Grand Exchange' });
    expect(o.legs[0].label).toContain('buy Falador teleport (~600 gp)');
    expect(o.go).toMatchObject({ x: EXCHANGE.x, y: EXCHANGE.y });
    expect(o.walkTiles).toBeLessThan(dist(nearGE, falador) - OPPORTUNISTIC_MIN_SAVING_TILES);
    expect(o.acquire!.tiles).toBeLessThanOrEqual(OPPORTUNISTIC_MAX_DETOUR_TILES);
    expect(o.availability, 'it is a suggestion to act on: never "ready" before the item is in the bag').toBe('maybe');
  });

  it('an unknown price is shown as unknown, never as free', () => {
    const o = find(run({ from: nearGE, to: falador, carried: bag(['Coins', 5000]) }), 'falador-tab-acquire')!;
    expect(o.acquire!.cost).toBeNull();
    expect(o.legs[0].label).toContain('price unknown');
  });

  it('too expensive, too far a detour, or too small a saving: not offered', () => {
    expect(find(run({ from: nearGE, to: falador, priceOf: price(OPPORTUNISTIC_MAX_COST + 1) }), 'falador-tab-acquire')).toBeUndefined();
    // From Lumbridge the exchange is a long detour.
    expect(find(run({ from: at(3222, 3218), to: falador, priceOf: price(600) }), 'falador-tab-acquire')).toBeUndefined();
    // Almost there already.
    expect(find(run({ from: at(3165, 3440), to: at(3165, 3470), priceOf: price(600) }), 'falador-tab-acquire')).toBeUndefined();
  });

  it('not enough coins, with the bank seen, locks the option; unknown coins leave it open', () => {
    expect(find(run({ from: nearGE, to: falador, carried: bag(['Coins', 50]), bankSeen: true, priceOf: price(600) }), 'falador-tab-acquire')!.availability).toBe('locked');
    expect(find(run({ from: nearGE, to: falador, carried: null, priceOf: price(600) }), 'falador-tab-acquire')!.needs[0].ok).toBeNull();
  });

  it('a tablet in the bank is a free withdrawal at the nearest bank, before the exchange', () => {
    const bank = new Map([[nameKey('Falador teleport'), 3]]);
    const o = find(run({ from: nearGE, to: falador, carried: bag(['Coins', 5]), bankSeen: true, bank, priceOf: price(600) }), 'falador-tab-acquire')!;
    expect(o.acquire).toMatchObject({ source: 'bank', cost: 0 });
    expect(o.acquire!.where).toMatch(/Bank/);
    expect(o.legs[0].label).toContain('withdraw Falador teleport (free)');
    expect(o.availability).toBe('maybe');
  });

  it('a tablet already in the bag is just a ready option, with no detour', () => {
    const opts = run({ from: nearGE, to: falador, carried: bag(['Falador teleport', 1]) });
    const o = find(opts, 'falador-tab')!;
    expect(o.availability).toBe('ready');
    expect(o.acquire).toBeUndefined();
    expect(find(opts, 'falador-tab-acquire')).toBeUndefined();
  });

  it('every option keeps a sane total: tiles are never negative and the list is sorted by availability then tiles', () => {
    const opts = run({ from: nearGE, to: falador, members: true, carried: bag(['Coins', 900], ['Dramen staff', 1]), bankSeen: true, priceOf: price(600) });
    for (const o of opts) {
      expect(o.walkTiles, o.id).toBeGreaterThanOrEqual(0);
      for (const l of o.legs) expect(l.tiles, `${o.id}: ${l.label}`).toBeGreaterThanOrEqual(0);
    }
    const rank = (o: TravelOption) => (o.availability === 'ready' ? 0 : o.availability === 'maybe' ? 1 : 2);
    for (let i = 1; i < opts.length; i++) expect(rank(opts[i - 1]) <= rank(opts[i]), `${opts[i - 1].id} before ${opts[i].id}`).toBe(true);
  });
});

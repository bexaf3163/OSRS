import { describe, expect, it } from 'vitest';
import { dist, travelOptions, TRANSPORT, walkText, type TravelInput } from '../src/lib/travel';
import type { GearItem } from '../src/services/runeliteBridge';

const at = (x: number, y: number, plane = 0) => ({ x, y, plane });
const bag = (...rows: [string, number][]): GearItem[] => rows.map(([name, count], i) => ({ id: i + 1, name, count }));
const input = (over: Partial<TravelInput>): TravelInput => ({
  from: at(3222, 3218), to: at(3213, 3424), levels: {}, carried: null, bankSeen: false, ...over,
});

describe('how to get there', () => {
  it('data: five teleport points and five canoe stations, as on the wiki', () => {
    expect(TRANSPORT.teleports.map((t) => t.id)).toEqual(['lumbridge-home', 'lumbridge-teleport', 'varrock-teleport', 'falador-teleport', 'chronicle']);
    expect(TRANSPORT.canoe.stations.map((s) => s.name)).toEqual(["Lumbridge", "Champions' Guild", 'Barbarian Village', 'Edgeville', 'Ferox Enclave']);
    expect(TRANSPORT.teleports.find((t) => t.id === 'varrock-teleport')).toMatchObject({ magic: 25, runes: { law: 1, air: 3, fire: 1 } });
  });

  it('distance — in a straight line with the diagonal', () => {
    expect(dist(at(0, 0), at(3, 4))).toBe(4);
    expect(walkText(0)).toBe('on the spot');
    expect(walkText(30)).toBe('30 tiles · running at least 9 s');
  });

  it('Lumbridge → Varrock: Varrock Teleport without Magic 25 is locked, with runes — ready, the home one — always available', () => {
    const none = travelOptions(input({ levels: { magic: 20 }, carried: bag(['Coins', 100]) }));
    const v0 = none.find((o) => o.id === 'varrock-teleport')!;
    expect(v0.availability).toBe('locked');
    expect(v0.needs[0]).toMatchObject({ text: 'Magic 25 (you have 20)', ok: false });
    const ready = travelOptions(input({ levels: { magic: 25 }, carried: bag(['Law rune', 1], ['Air rune', 3], ['Fire rune', 1]) }));
    expect(ready.find((o) => o.id === 'varrock-teleport')!.availability).toBe('ready');
    expect(ready.find((o) => o.id === 'varrock-teleport')!.walkTiles).toBeLessThan(10);
    // From Varrock on foot to Varrock is closer than Home Teleport to Lumbridge: that one is not needed at all.
    const near = travelOptions(input({ from: at(3213, 3430) }));
    expect(near.map((o) => o.id)).toEqual(['walk']);
  });

  it('a staff replaces air and fire runes; the bank was not opened — "maybe", opened — "no"', () => {
    const staff = travelOptions(input({ levels: { magic: 25 }, carried: bag(['Law rune', 1], ['Staff of fire', 1], ['Staff of air', 1]), bankSeen: true }));
    expect(staff.find((o) => o.id === 'varrock-teleport')!.availability).toBe('ready');
    const maybe = travelOptions(input({ levels: { magic: 25 }, carried: bag(['Coins', 5]), bankSeen: false }));
    expect(maybe.find((o) => o.id === 'varrock-teleport')!.availability).toBe('maybe');
    const no = travelOptions(input({ levels: { magic: 25 }, carried: bag(['Coins', 5]), bankSeen: true }));
    expect(no.find((o) => o.id === 'varrock-teleport')!.availability).toBe('locked');
  });

  it('without game data we invent nothing: "maybe", not "ready"', () => {
    const opts = travelOptions(input({}));
    expect(opts.find((o) => o.id === 'varrock-teleport')!.availability).toBe('maybe');
    expect(opts.find((o) => o.id === 'lumbridge-home')).toBeUndefined(); // from Lumbridge to Lumbridge there is no need
  });

  it('canoe: Lumbridge → Edgeville needs a Waka (Woodcutting 57) — unavailable at 30 woodcutting, at 57 with an axe — ready', () => {
    const to = at(3094, 3491); // Edgeville
    const low = travelOptions({ from: at(3241, 3237), to, levels: { woodcutting: 30 }, carried: bag(['Bronze axe', 1]), bankSeen: true });
    const c = low.find((o) => o.id === 'canoe');
    expect(c?.title).toContain('Lumbridge');
    expect(c?.availability).toBe('locked');
    const high = travelOptions({ from: at(3241, 3237), to, levels: { woodcutting: 57 }, carried: bag(['Rune axe', 1]), bankSeen: true });
    expect(high.find((o) => o.id === 'canoe')!.availability).toBe('ready');
    // The Ferox station is reachable only on a Waka.
    expect(TRANSPORT.canoe.stations.find((s) => s.id === 'ferox')!.wakaOnly).toBe(true);
  });

  it('the Port Sarim → Karamja boat: 30 coins needed; to the Brimhaven side of Karamja it is shorter on foot', () => {
    const to = at(2950, 3160); // Musa Point
    const rich = travelOptions({ from: at(3028, 3220), to, levels: {}, carried: bag(['Coins', 500]), bankSeen: true });
    const boat = rich.find((o) => o.id === 'karamja-boat')!;
    expect(boat.availability).toBe('ready');
    expect(boat.walkTiles).toBeLessThan(15);
    const poor = travelOptions({ from: at(3028, 3220), to, levels: {}, carried: bag(['Coins', 10]), bankSeen: true });
    expect(poor.find((o) => o.id === 'karamja-boat')!.availability).toBe('locked');
  });

  it('available options go above unavailable ones, at a tie — the one with less walking', () => {
    const opts = travelOptions(input({ levels: { magic: 20 }, carried: bag(['Coins', 1]), bankSeen: true }));
    const rank = (a: string) => (a === 'ready' ? 0 : a === 'maybe' ? 1 : 2);
    const ranks = opts.map((o) => rank(o.availability));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});

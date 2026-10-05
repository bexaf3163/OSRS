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

// ---------- Fetch it first: why it did not show live, and the purchase detour ----------
import { allSteps as routeSteps, stepById } from '../src/data';
import { buildPlayerState } from '../src/lib/playerState';
import { createReadinessEngine } from '../src/lib/readinessEngine';
import { emptyProgress } from '../src/lib/progress';
import { nameKey, type OwnedItem, type OwnedState } from '../src/lib/checklist';
import { stepPlaces } from '../src/lib/stepPlaces';
import { planPayload } from '../src/lib/prepEnvelope';
import { DETOUR_MAX_EXTRA_TILES, procurementDetour } from '../src/lib/detours';
import { OPPORTUNISTIC_MAX_DETOUR_TILES, OPPORTUNISTIC_MIN_SAVING_TILES, setDetourLog, type DetourDecision } from '../src/lib/travel';
import type { PrepPlan } from '../src/lib/prepPlan';

describe('fetch it first: every verdict has a reason, and the thresholds do not starve the routes', () => {
  const falador = at(2970, 3380);
  const price = (name: string) => (name === 'Falador teleport' ? 600 : undefined);
  const decisions = (over: Partial<TravelInput>): DetourDecision[] => {
    const seen: DetourDecision[] = [];
    travelOptions(input({ to: falador, carried: bag(['Coins', 5000]), bankSeen: true, priceOf: price, ...over, onDecision: (d) => seen.push(d) }));
    return seen.filter((d) => d.subject === 'Falador teleport');
  };

  it('the limits are the relaxed ones: 40 tiles of saving, a 300-tile sanity cap on the fetch', () => {
    expect(OPPORTUNISTIC_MIN_SAVING_TILES).toBe(40);
    expect(OPPORTUNISTIC_MAX_DETOUR_TILES).toBe(300);
  });

  it('a candidate that saves too little is logged with the reason and the numbers', () => {
    // From Lumbridge the exchange is farther than the target itself: nothing to save.
    const d = decisions({ from: at(3222, 3218) });
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ outcome: 'rejected', reason: 'insufficient_savings' });
    expect(d[0].detail.saving as number).toBeLessThan(OPPORTUNISTIC_MIN_SAVING_TILES);
  });

  it('a fetch beyond the sanity cap is logged as exceeding the detour limit', () => {
    const d = decisions({ from: at(3222, 2800) });
    expect(d[0]).toMatchObject({ outcome: 'rejected', reason: 'exceeds_detour_limit' });
  });

  it('an offered suggestion carries its caveat: price unknown, or coins that do not cover it', () => {
    const near = at(3165, 3440);
    expect(decisions({ from: near, priceOf: undefined })[0]).toMatchObject({ outcome: 'offered', caveat: 'price_unknown' });
    expect(decisions({ from: near, carried: bag(['Coins', 50]) })[0]).toMatchObject({ outcome: 'offered', caveat: 'missing_coins' });
    expect(decisions({ from: near })[0]).toMatchObject({ outcome: 'offered' });
  });

  it('the debug sink sees every verdict', () => {
    const all: DetourDecision[] = [];
    setDetourLog((d) => all.push(d));
    travelOptions(input({ from: at(3165, 3440), to: falador, carried: bag(['Coins', 5000]), bankSeen: true, priceOf: price }));
    setDetourLog(null);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((d) => d.outcome === 'offered' || d.reason)).toBe(true);
  });

  it('a tablet in the Draynor bank is fetched in one tile: Draynor to Goblin Village produces the option', () => {
    const draynor = at(3093, 3244);
    const goblinVillage = at(2957, 3512);
    const bank = new Map([[nameKey('Falador teleport'), 2]]);
    const o = travelOptions(input({ from: draynor, to: goblinVillage, carried: bag(['Coins', 100]), bankSeen: true, bank })).find((x) => x.id === 'falador-tab-acquire');
    expect(o?.acquire).toMatchObject({ source: 'bank' });
    expect(o!.walkTiles).toBeLessThan(dist(draynor, goblinVillage) - OPPORTUNISTIC_MIN_SAVING_TILES);
  });
});

describe('purchase detours: a thing the next steps need, near where the player is', () => {
  const none = { bag: 0, noted: 0, bank: 0, equipped: 0 };
  const owned = (rows: Record<string, Partial<OwnedItem>>): OwnedState => {
    const items = new Map<string, OwnedItem>();
    for (const [name, o] of Object.entries(rows)) items.set(nameKey(name), { name, carried: 0, noted: 0, ...o });
    return { bankSeen: true, items };
  };
  const planFor = (id: string, rows: Record<string, Partial<OwnedItem>>): PrepPlan => {
    const step = stepById.get(id)!;
    const state = buildPlayerState({
      mode: 'f2p', stats: null, progress: { levels: {} }, owned: owned(rows), gear: { equipment: [], inventory: [], coins: 600, bankCoins: 0 }, questsDone: null, connected: true,
    });
    return createReadinessEngine({ steps: routeSteps, progress: emptyProgress(), qp: 0, mode: 'f2p', state }).plan(step);
  };
  const dyes = { 'Blue dye': { carried: 1 }, 'Orange dye': { carried: 0, bank: 0 }, 'Red dye': { carried: 0, bank: 0 }, 'Yellow dye': { carried: 1, bank: 0 } };

  it('Draynor to Goblin Village (S2-12): Aggie is 13 tiles away and makes the missing Red dye, so the stop is suggested', () => {
    const plan = planFor('S2-12', dyes);
    const to = stepPlaces(stepById.get('S2-12')!)[0];
    const seen: DetourDecision[] = [];
    const d = procurementDetour({ plan, stepId: 'S2-12', from: at(3093, 3244), to, coins: 600, onDecision: (x) => seen.push(x) });
    expect(d, JSON.stringify(seen)).not.toBeNull();
    expect(d!.items).toContain('Red dye');
    expect(d!.text).toMatch(/^Detour: Get Red dye at Aggie \(\+\d+ tiles, saves ~/);
    expect(seen.some((x) => x.outcome === 'offered')).toBe(true);
  });

  it('the stop travels in the plan payload to the game: text and where the arrow leads', () => {
    const plan = planFor('S2-12', dyes);
    const to = stepPlaces(stepById.get('S2-12')!)[0];
    const d = procurementDetour({ plan, stepId: 'S2-12', from: at(3093, 3244), to, coins: 600 })!;
    const payload = planPayload(plan, d);
    expect(payload.detour).toMatchObject({ text: d.text, x: d.stop.x, y: d.stop.y, plane: 0 });
    expect(planPayload(plan, null).detour).toBeUndefined();
    expect(planPayload(plan).detour).toBeUndefined();
  });

  it('far from the place, the stop is dropped with the reason', () => {
    const plan = planFor('S2-12', dyes);
    const seen: DetourDecision[] = [];
    const d = procurementDetour({ plan, stepId: 'S2-12', from: at(3213, 3424), to: at(3300, 3800), coins: 600, onDecision: (x) => seen.push(x) });
    expect(d).toBeNull();
    expect(seen.some((x) => x.reason === 'exceeds_detour_limit' || x.reason === 'insufficient_savings')).toBe(true);
    expect(DETOUR_MAX_EXTRA_TILES).toBeGreaterThan(0);
  });

  it('the Varrock shopping steps put the exchange first when it is close, with all the items at that stop', () => {
    const ge = { x: 3165, y: 3487, plane: 0 };
    const buy = (name: string, price: number) => ({
      key: name, name, count: 1, exact: true, where: 'MISSING' as const, have: none, toGet: 1, priority: 'CRITICAL' as const, timing: 'NOW' as const,
      action: { kind: 'BUY' as const, label: `Buy ${name}`, price, nav: { label: `Grand Exchange: ${name}`, ...ge, itemName: name } }, why: '', usedIn: ['S2-01'],
    });
    const aggie = {
      key: 'Red dye', name: 'Red dye', count: 1, exact: true, where: 'MISSING' as const, have: none, toGet: 1, priority: 'IMPORTANT' as const, timing: 'NOW' as const,
      action: { kind: 'GATHER' as const, label: 'Aggie', nav: { label: 'Aggie: Red dye', x: 3180, y: 3470, plane: 0, itemName: 'Red dye' } }, why: '', usedIn: ['S2-01'],
    };
    const plan = { now: [buy('Pot', 1), buy('Bucket', 2), buy('Rope', 18), aggie], soon: [] };
    const d = procurementDetour({ plan, stepId: 'S2-01', from: at(3190, 3470), to: at(3213, 3424), coins: 500 });
    expect(d?.stop.x).toBe(ge.x);
    expect(d?.items).toEqual(['Pot', 'Bucket', 'Rope']);
  });

  it('an unpriced purchase, one we cannot afford, and a thing with no place are each dropped with their own reason', () => {
    const base = { key: 'x', name: 'X', count: 1, exact: true, where: 'MISSING' as const, have: none, toGet: 1, priority: 'IMPORTANT' as const, timing: 'NOW' as const, why: '', usedIn: ['S2-12'] };
    const nav = { label: 'Shop: X', x: 3094, y: 3245, plane: 0 };
    const reasons = (line: object, coins: number | null) => {
      const seen: DetourDecision[] = [];
      procurementDetour({ plan: { now: [line as never], soon: [] }, stepId: 'S2-12', from: at(3093, 3244), to: at(2957, 3512), coins, onDecision: (d) => seen.push(d) });
      return seen.map((d) => d.reason);
    };
    expect(reasons({ ...base, action: { kind: 'BUY', label: 'Buy', nav } }, 500)).toEqual(['price_unknown']);
    expect(reasons({ ...base, action: { kind: 'BUY', label: 'Buy', price: 900, nav } }, 100)).toEqual(['missing_coins']);
    expect(reasons({ ...base, action: { kind: 'EARN', label: 'Earn it first' } }, 500)).toEqual(['not_whitelisted']);
  });
});

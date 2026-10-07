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
import { recommendedTransport } from '../src/lib/transport';
import { DETOUR_MAX_EXTRA_TILES, procurementDetour } from '../src/lib/detours';
import { EXCHANGE, OPPORTUNISTIC_MAX_DETOUR_TILES, OPPORTUNISTIC_MAX_EXCHANGE_TILES, OPPORTUNISTIC_MIN_SAVING_TILES, reachTiles, setDetourLog, type DetourDecision } from '../src/lib/travel';
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
    const payload = planPayload(plan, { detour: d });
    expect(payload.activeDetour).toMatchObject({ text: d.text, label: 'Aggie', targetTile: { x: d.stop.x, y: d.stop.y, plane: 0 }, actionType: 'GET' });
    expect(payload.activeDetour!.costTiles).toBe(Math.round(d.extraTiles));
    expect(planPayload(plan, { detour: null }).activeDetour).toBeUndefined();
    expect(planPayload(plan).activeDetour).toBeUndefined();
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

describe('detour caps by kind of place, and teleports that shorten the way to the exchange', () => {
  const alKharid = at(3293, 3167);
  const goblinVillage = at(2957, 3512);
  const base = { key: 'Orange dye', name: 'Orange dye', count: 1, exact: true, where: 'MISSING' as const, have: { bag: 0, noted: 0, bank: 0, equipped: 0 }, toGet: 1, priority: 'CRITICAL' as const, timing: 'NOW' as const, why: '', usedIn: ['S2-12'] };
  const ge = { label: 'Grand Exchange: Orange dye', x: 3165, y: 3487, plane: 0, itemName: 'Orange dye' };
  const orange = { ...base, action: { kind: 'BUY' as const, label: 'Buy', price: 300, nav: ge } };

  it('the caps are 300 tiles for vendors and banks and 500 for the exchange', () => {
    expect(OPPORTUNISTIC_MAX_DETOUR_TILES).toBe(300);
    expect(OPPORTUNISTIC_MAX_EXCHANGE_TILES).toBe(500);
  });

  it('Al Kharid to the exchange (320 tiles) is inside the exchange cap: an active quest blocker is offered', () => {
    expect(dist(alKharid, at(ge.x, ge.y))).toBeGreaterThan(OPPORTUNISTIC_MAX_DETOUR_TILES);
    const seen: DetourDecision[] = [];
    const d = procurementDetour({ plan: { now: [orange], soon: [] }, stepId: 'S2-12', from: alKharid, to: goblinVillage, coins: 600, onDecision: (x) => seen.push(x) });
    expect(d, JSON.stringify(seen)).not.toBeNull();
    expect(d).toMatchObject({ actionType: 'BUY' });
    expect(d!.text).toMatch(/^Detour: Buy Orange dye at the Grand Exchange \(\+\d+ tiles, saves ~/);
    expect(seen.find((x) => x.outcome === 'offered')?.detail.blocker).toBe(1);
  });

  it('the same distance to a vendor is over the vendor cap and is dropped with the reason', () => {
    const vendor = { ...orange, action: { ...orange.action, nav: { ...ge, label: 'Aggie: Orange dye', x: 3293, y: 3480 } } };
    const seen: DetourDecision[] = [];
    const d = procurementDetour({ plan: { now: [vendor], soon: [] }, stepId: 'S2-12', from: alKharid, to: goblinVillage, coins: 600, onDecision: (x) => seen.push(x) });
    expect(d).toBeNull();
    expect(seen[0]).toMatchObject({ outcome: 'rejected', reason: 'exceeds_detour_limit' });
  });

  it('beyond 500 tiles even the exchange is dropped', () => {
    const seen: DetourDecision[] = [];
    const d = procurementDetour({ plan: { now: [orange], soon: [] }, stepId: 'S2-12', from: at(3293, 2900), to: goblinVillage, coins: 600, onDecision: (x) => seen.push(x) });
    expect(d).toBeNull();
    expect(seen[0]).toMatchObject({ reason: 'exceeds_detour_limit' });
  });

  it('a blocker is judged by time: when making it by hand is quicker than the trip, no stop', () => {
    const quick = { ...orange, name: 'Orange dye' };
    // Standing next to the exchange target with the dye still 3 minutes away by hand is a clear win; far away with a long extra walk it is not.
    const far = procurementDetour({ plan: { now: [quick], soon: [] }, stepId: 'S2-12', from: at(3293, 3167), to: at(3300, 3130), coins: 600 });
    expect(far).toBeNull();
  });

  it('a Chronicle or a Varrock tablet in the bag makes the exchange close: the way there is counted from the landing tile', () => {
    const noTele = reachTiles({ from: alKharid, levels: {}, carried: bag(['Coins', 100]), bankSeen: true }, EXCHANGE);
    expect(noTele.via).toBeUndefined();
    const chronicle = reachTiles({ from: alKharid, levels: {}, carried: bag(['Chronicle', 1]), bankSeen: true }, EXCHANGE);
    expect(chronicle.via).toBe('Chronicle');
    expect(chronicle.tiles).toBeLessThan(noTele.tiles);
    const tab = reachTiles({ from: alKharid, levels: {}, carried: bag(['Varrock teleport', 1]), bankSeen: true }, EXCHANGE);
    expect(tab.via).toBe('Varrock teleport tablet');
    expect(tab.tiles).toBeLessThan(dist(at(3213, 3424), EXCHANGE) + 1);
  });

  it('a teleport that may be available (unknown bag) or a spell without runes is never assumed', () => {
    expect(reachTiles({ from: alKharid, levels: { magic: 99 }, carried: null, bankSeen: false }, EXCHANGE).via).toBeUndefined();
    expect(reachTiles({ from: alKharid, levels: { magic: 99 }, carried: bag(['Coins', 1]), bankSeen: true }, EXCHANGE).via).toBeUndefined();
    const withRunes = reachTiles({ from: alKharid, levels: { magic: 25 }, carried: bag(['Law rune', 1], ['Air rune', 3], ['Fire rune', 1]), bankSeen: true }, EXCHANGE);
    expect(withRunes.via).toMatch(/Varrock Teleport/i);
  });

  it('with a teleport in the bag the stop is cheaper and says how', () => {
    const none = procurementDetour({ plan: { now: [orange], soon: [] }, stepId: 'S2-12', from: alKharid, to: goblinVillage, coins: 600 })!;
    const tele = procurementDetour({ plan: { now: [orange], soon: [] }, stepId: 'S2-12', from: alKharid, to: goblinVillage, coins: 600, travel: { levels: {}, carried: bag(['Varrock teleport', 1]), bankSeen: true } })!;
    expect(tele.via).toBe('Varrock teleport tablet');
    expect(tele.extraTiles).toBeLessThan(none.extraTiles);
    expect(tele.text).toContain('by Varrock teleport tablet');
  });
});

describe('bridge payload: the transport and the detour reach the game together', () => {
  it('a teleport in the bag is the recommended transport, with a destination, a tile or an item, and a text', () => {
    const o = travelOptions(input({ from: at(3222, 3218), to: at(2957, 3512), levels: { magic: 37 }, carried: bag(['Falador teleport', 1], ['Coins', 100]), bankSeen: true }));
    const t = recommendedTransport(o);
    expect(t, JSON.stringify(o.map((x) => x.id))).not.toBeNull();
    expect(t!.type).not.toBe('walk' as never);
    expect(t!.text.length).toBeGreaterThan(0);
    expect(t!.interactionId).toBeGreaterThanOrEqual(0);
    expect(t!.item ?? t!.interactionName ?? t!.tile).toBeTruthy();
  });

  it('a payload for an active plan carries both the detour and the transport, never null when both exist', () => {
    const items = new Map<string, OwnedItem>();
    for (const [name, o] of Object.entries({ 'Blue dye': { carried: 1 }, 'Yellow dye': { carried: 1 }, 'Orange dye': { carried: 0, bank: 0 }, 'Red dye': { carried: 0, bank: 0 } }))
      items.set(nameKey(name), { name, noted: 0, ...o, carried: o.carried });
    const state = buildPlayerState({
      mode: 'f2p', stats: null, progress: { levels: {} }, owned: { bankSeen: true, items }, gear: { equipment: [], inventory: [], coins: 600, bankCoins: 0 }, questsDone: null, connected: true,
    });
    const plan = createReadinessEngine({ steps: routeSteps, progress: emptyProgress(), qp: 0, mode: 'f2p', state }).plan(stepById.get('S2-12')!);
    const from = at(3093, 3244);
    const to = at(2957, 3512);
    const d = procurementDetour({ plan, stepId: 'S2-12', from, to, coins: 600 });
    const t = recommendedTransport(travelOptions(input({ from, to, levels: { magic: 37 }, carried: bag(['Falador teleport', 1]), bankSeen: true })));
    expect(d).not.toBeNull();
    const payload = planPayload(plan, { detour: d, transport: t });
    expect(payload.activeDetour).toBeTruthy();
    expect(payload.activeDetour!.targetTile.plane).toBe(0);
    if (t) expect(payload.recommendedTransport).toMatchObject({ type: t.type, destination: t.destination, interactionId: t.interactionId });
    expect(planPayload(plan, { detour: d }).recommendedTransport).toBeUndefined();
  });
});

// ---------- Fast travel: acquired along the route, chosen over walking, and shown in the game ----------
import { itemSource } from '../src/lib/stepPlaces';
import { MIN_SAVING_TILES } from '../src/lib/travel';

describe('fast travel in the route: Chronicle, runes and the unlock levels', () => {
  const draynor = at(3093, 3244);
  const varrockSquare = at(3213, 3428);
  const planFor = (id: string, rows: Record<string, Partial<OwnedItem>>): PrepPlan => {
    const items = new Map<string, OwnedItem>();
    for (const [name, o] of Object.entries(rows)) items.set(nameKey(name), { name, carried: 0, noted: 0, ...o });
    const state = buildPlayerState({
      mode: 'f2p', stats: null, progress: { levels: {} }, owned: { bankSeen: true, items }, gear: { equipment: [], inventory: [], coins: 3000, bankCoins: 0 }, questsDone: null, connected: true,
    });
    return createReadinessEngine({ steps: routeSteps, progress: emptyProgress(), qp: 0, mode: 'f2p', state }).plan(stepById.get(id)!);
  };

  it('Draynor to Varrock: a Chronicle in the bag is the recommended way, a tablet beats it, and a ready spell is used when there are runes', () => {
    const chronicle = recommendedTransport(travelOptions(input({ from: draynor, to: varrockSquare, carried: bag(['Chronicle', 1]), bankSeen: true })));
    expect(chronicle).toMatchObject({ type: 'item_teleport', item: 'Chronicle' });
    expect(chronicle!.destination).toMatch(/Champions/);
    const tablet = recommendedTransport(travelOptions(input({ from: draynor, to: varrockSquare, carried: bag(['Chronicle', 1], ['Varrock teleport', 1]), bankSeen: true })));
    expect(tablet, 'the tablet lands on the square: ready and nearer than the book').toMatchObject({ type: 'tablet', item: 'Varrock teleport' });
    const spell = recommendedTransport(travelOptions(input({
      from: draynor, to: varrockSquare, levels: { magic: 25 }, carried: bag(['Law rune', 3], ['Air rune', 9], ['Fire rune', 3]), bankSeen: true,
    })));
    expect(spell).toMatchObject({ type: 'spell_teleport' });
    expect(spell!.text).toMatch(/Varrock Teleport/);
  });

  it('a ready teleport goes above walking: the engine does not default to the overland path', () => {
    const o = travelOptions(input({ from: draynor, to: varrockSquare, levels: { magic: 25 }, carried: bag(['Law rune', 1], ['Air rune', 3], ['Fire rune', 1]), bankSeen: true }));
    expect(o[0].id).toBe('varrock-teleport');
    expect(o[0].availability).toBe('ready');
    const walk = o.find((x) => x.id === 'walk')!;
    expect(o.indexOf(walk)).toBeGreaterThan(0);
    // Every other way kept is shorter than walking by at least the saving threshold.
    for (const x of o.filter((y) => y.id !== 'walk')) expect(x.walkTiles + MIN_SAVING_TILES, x.id).toBeLessThanOrEqual(walk.walkTiles);
  });

  it('the teleport landing is the origin of the rest of the way: from Draynor with a Varrock tablet the exchange is a short walk', () => {
    const r = reachTiles({ from: draynor, levels: {}, carried: bag(['Varrock teleport', 1]), bankSeen: true }, EXCHANGE);
    expect(r.via).toBe('Varrock teleport tablet');
    expect(r.landing).toMatchObject({ x: 3213, y: 3424 });
    expect(r.tiles).toBeLessThan(dist(draynor, EXCHANGE) - 40);
  });

  it('the spells unlock at the Magic levels: Varrock 25, Lumbridge 31, Falador 37, locked below and ready at the level with runes', () => {
    const runes = bag(['Law rune', 5], ['Air rune', 20], ['Fire rune', 5], ['Earth rune', 5], ['Water rune', 5]);
    const far = (magic: number) => travelOptions({ from: at(3093, 3244), to: at(2957, 3512), levels: { magic }, carried: runes, bankSeen: true });
    expect(TRANSPORT.teleports.find((t) => t.id === 'varrock-teleport')!.magic).toBe(25);
    expect(TRANSPORT.teleports.find((t) => t.id === 'lumbridge-teleport')!.magic).toBe(31);
    expect(TRANSPORT.teleports.find((t) => t.id === 'falador-teleport')!.magic).toBe(37);
    expect(far(36).find((x) => x.id === 'falador-teleport')!.availability).toBe('locked');
    expect(far(37).find((x) => x.id === 'falador-teleport')!.availability).toBe('ready');
    const lum = (magic: number) => travelOptions({ from: at(3213, 3428), to: at(3222, 3218), levels: { magic }, carried: runes, bankSeen: true }).find((x) => x.id === 'lumbridge-teleport');
    expect(lum(30)!.availability).toBe('locked');
    expect(lum(31)!.availability).toBe('ready');
  });

  it('the Chronicle and its cards are bought at Draynor (Diango) on S1-10, before the first step that uses the book', () => {
    const s = stepById.get('S1-10')!;
    expect(s.itemsRequired!.find((i) => i.nameEn === 'Chronicle')).toMatchObject({ amount: 1, from: 'Diango' });
    expect(s.itemsRequired!.find((i) => i.nameEn === 'Teleport card')).toMatchObject({ from: 'Diango' });
    expect(s.itemsRequired!.find((i) => i.nameEn === 'Chronicle')!.howToGet).toMatch(/300 gp/);
    expect(s.itemsRequired!.find((i) => i.nameEn === 'Teleport card')!.howToGet).toMatch(/150 gp/);
    const diango = itemSource('Diango', 'S1-10')!;
    expect(diango, 'Diango is a place the plan can lead to').toBeDefined();
    expect(Math.abs(diango.x - 3082)).toBeLessThan(30);
    const order = routeSteps.map((x) => x.id);
    const firstUse = routeSteps.find((x) => x.id !== 'S1-10' && (x.branches?.some((b) => b.id === 'chronicle') || /Chronicle/.test(JSON.stringify(x.how ?? ''))))!;
    expect(order.indexOf('S1-10')).toBeLessThan(order.indexOf(firstUse.id));
    // In a plan made at S1-10 with nothing owned, the book and the cards are on it (picked up at Diango during the step) and the 1,800 gp they cost is checked.
    const plan = planFor('S1-10', {});
    for (const name of ['Chronicle', 'Teleport card']) expect(plan.lines.some((l) => l.name === name), name).toBe(true);
    expect(plan.coins.need).toBeGreaterThanOrEqual(1800);
  });

  it('the Varrock Teleport runes are on the route: the Magic 25 step lists Law, Air and Fire runes, and the teleport branches ask for the same three', () => {
    const magic = stepById.get('S2-04')!;
    const names = [...(magic.itemsRequired ?? []), ...(magic.itemsRecommended ?? [])].map((i) => i.nameEn);
    expect(names).toEqual(expect.arrayContaining(['Law rune', 'Air rune', 'Fire rune']));
    const needs = stepById.get('S2-05')!.branches!.find((b) => b.id === 'varrock-teleport')!.needs!.map((n) => n.items[0]);
    expect(needs).toEqual(['Law rune', 'Air rune', 'Fire rune']);
  });

  it('the canoe branches on the Stronghold step follow the canoe table: Woodcutting 12 for one stop, 27 for two, and an axe', () => {
    const branches = stepById.get('S1-09')!.branches!;
    const level = (id: string) => (branches.find((b) => b.id === id)!.condition as { minLevel: number }).minLevel;
    expect(level('canoe-log')).toBe(TRANSPORT.canoe.types.find((t) => t.name === 'Log')!.level);
    expect(level('canoe-dugout')).toBe(TRANSPORT.canoe.types.find((t) => t.name === 'Dugout')!.level);
    for (const b of branches) expect(b.needs![0].items).toEqual(TRANSPORT.canoe.axes);
  });
});

describe('River Lum canoes and the ferries', () => {
  const lumbridge = at(3241, 3237);
  const barbarian = at(3110, 3409);
  const run = (wc: number | undefined, carried: GearItem[] | null, bankSeen = true) =>
    travelOptions({ from: lumbridge, to: barbarian, levels: wc === undefined ? {} : { woodcutting: wc }, carried, bankSeen });

  it('with Woodcutting 27 and an axe the canoe from Lumbridge to Barbarian Village is ready and is the recommended way, pointing at the Lumbridge station', () => {
    const o = run(27, bag(['Bronze axe', 1]));
    expect(o.find((x) => x.id === 'canoe')).toMatchObject({ availability: 'ready' });
    expect(o.find((x) => x.id === 'canoe-now')).toBeUndefined();
    const t = recommendedTransport(o)!;
    expect(t.type).toBe('canoe');
    expect(t.destination).toBe('Barbarian Village');
    expect(t.tile).toMatchObject({ x: 3241, y: 3235, plane: 0 });
    expect(t.interactionName).toBe('Canoe Station');
  });

  it('at Woodcutting 12 the two-stop canoe is locked, and the log canoe that the player can chop is offered and recommended instead', () => {
    const o = run(12, bag(['Iron axe', 1]));
    expect(o.find((x) => x.id === 'canoe')!.availability).toBe('locked');
    const now = o.find((x) => x.id === 'canoe-now')!;
    expect(now.availability).toBe('ready');
    expect(now.title).toContain("Champions' Guild");
    expect(recommendedTransport(o)).toMatchObject({ type: 'canoe', destination: "Champions' Guild" });
    // Below Woodcutting 12 there is no canoe the player can chop.
    expect(run(11, bag(['Iron axe', 1])).find((x) => x.id === 'canoe-now')).toBeUndefined();
  });

  it('without an axe the canoe is not ready: none in the bag after the bank was opened is locked, an unknown bag is only possible', () => {
    expect(run(30, bag(['Coins', 5])).find((x) => x.id === 'canoe')!.availability).toBe('locked');
    expect(run(30, bag(['Coins', 5]), false).find((x) => x.id === 'canoe')!.availability).toBe('maybe');
    expect(run(30, null).find((x) => x.id === 'canoe')!.availability).toBe('maybe');
    expect(recommendedTransport(run(30, bag(['Coins', 5])))?.type).not.toBe('canoe');
  });

  it('transport.json links the stations in river order and the ferries in both directions, Port Sarim to Musa Point and Rimmington to Corsair Cove', () => {
    expect(TRANSPORT.canoe.stations.slice(0, 4).map((s) => s.id)).toEqual(['lumbridge', 'champions', 'barbarian', 'edgeville']);
    const ys = TRANSPORT.canoe.stations.map((s) => s.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    expect(TRANSPORT.canoe.types.map((t) => `${t.name}:${t.level}:${t.stops}`)).toEqual(['Log:12:1', 'Dugout:27:2', 'Stable Dugout:42:3', 'Waka:57:4']);
    const ids = TRANSPORT.boats.map((b) => b.id);
    expect(ids).toEqual(expect.arrayContaining(['karamja-boat', 'port-sarim-boat', 'corsair-boat', 'rimmington-boat']));
    for (const [a, b] of [['karamja-boat', 'port-sarim-boat'], ['corsair-boat', 'rimmington-boat']]) {
      const x = TRANSPORT.boats.find((t) => t.id === a)!;
      const y = TRANSPORT.boats.find((t) => t.id === b)!;
      expect([x.from.x, x.from.y]).toEqual([y.to.x, y.to.y]);
      expect([x.to.x, x.to.y]).toEqual([y.from.x, y.from.y]);
    }
  });

  it('Rimmington to Corsair Cove: the free ferry is possible (the quest must be started), never ready, and points at Captain Tock', () => {
    const o = travelOptions({ from: at(2915, 3226), to: at(2558, 2858), levels: {}, carried: bag(['Coins', 0]), bankSeen: true });
    const boat = o.find((x) => x.id === 'corsair-boat')!;
    expect(boat.availability).toBe('maybe');
    expect(boat.needs.some((n) => /Corsair Curse/.test(n.text) && n.ok === null)).toBe(true);
    expect(boat.needs.some((n) => /gp in coins/.test(n.text))).toBe(false);
    const t = recommendedTransport(o)!;
    expect(t).toMatchObject({ type: 'ferry', interactionName: 'Captain Tock' });
    expect(t.tile).toMatchObject({ x: 2910, y: 3226 });
  });
});

import { describe, expect, it } from 'vitest';
import { allSteps, stepById } from '../src/data';
import { buildPlayerState } from '../src/lib/playerState';
import { nameKey, type OwnedItem, type OwnedState } from '../src/lib/checklist';
import { decideTransport, supplyStop, SUPPLY_NEAR_TILES, transportSources } from '../src/lib/liveTransport';
import { planTravelSupplies, roadLegs, roadSteps, savedText, stepTargets, SUPPLY_MIN_TOTAL_TILES, type TravelSupplies } from '../src/lib/travelSupplies';
import { BANKS, EXCHANGE, STAFF_NAMES, STAIRS_TILES_PER_FLOOR, bankTiles, dist, staffCover, stavesFor, travelOptions, type TravelInput } from '../src/lib/travel';
import { recommendedTransport } from '../src/lib/transport';
import { planPayload } from '../src/lib/prepEnvelope';
import { createReadinessEngine } from '../src/lib/readinessEngine';
import { emptyProgress } from '../src/lib/progress';
import { transportWatch } from '../src/lib/travelInput';
import { isOverworld } from '../src/lib/instances';
import type { GearItem, GearState } from '../src/services/runeliteBridge';

// Supplies for the road (the 2.53 request): before a long run the guide says how many teleports pay off and what to buy for them, a wielded staff
// counts as runes, the Chronicle's charges are read from the game, and the Grand Exchange and Lumbridge Castle banks are stops.

const at = (x: number, y: number, plane = 0) => ({ x, y, plane });
const bag = (...rows: [string, number][]): GearItem[] => rows.map(([name, count], i) => ({ id: i + 1, name, count }));
const owned = (rows: Record<string, number>, bankSeen = true): OwnedState => {
  const items = new Map<string, OwnedItem>();
  for (const [name, bank] of Object.entries(rows)) items.set(nameKey(name), { name, carried: 0, noted: 0, bank });
  return { bankSeen, items };
};
const gear = (inventory: GearItem[], equipment: GearItem[] = []): GearState => ({ equipment, inventory, coins: 5000, bankCoins: 0 } as unknown as GearState);
const DIANGO = at(3081, 3246);
const diango = (name: string) => (name === 'Teleport card' ? { kind: 'shop' as const, where: "Diango's Toy Store — Draynor Village", point: DIANGO, price: 150 }
  : name === 'Chronicle' ? { kind: 'shop' as const, where: "Diango's Toy Store — Draynor Village", point: DIANGO, price: 300 } : null);
const input = (over: Partial<TravelInput>): TravelInput => ({ from: at(3222, 3219), to: at(3190, 3360), levels: { magic: 25 }, carried: bag(['Coins', 5000]), bankSeen: true, bank: new Map(), members: false, sourceOf: diango, ...over });

describe('a wielded staff is runes', () => {
  it('the wiki table: the four staves are free-to-play, the battle, mystic and combination ones are members; a combination staff gives two runes', () => {
    expect(stavesFor('air', false)).toEqual(['Staff of air']);
    expect(stavesFor('fire', true)).toEqual(expect.arrayContaining(['Staff of fire', 'Fire battlestaff', 'Smoke battlestaff', 'Steam battlestaff', 'Lava battlestaff', 'Mystic lava staff']));
    expect(stavesFor('air', true)).toEqual(expect.arrayContaining(['Mist battlestaff', 'Dust battlestaff', 'Smoke battlestaff']));
    expect(STAFF_NAMES.length).toBeGreaterThanOrEqual(26);
  });

  it('worn, it gives the rune; in the bag, the way says "wield it" first; a members staff does nothing on a free-to-play account', () => {
    const to = at(3210, 3494);
    const worn = recommendedTransport(travelOptions(input({ from: at(3093, 3248), to, carried: bag(['Staff of air', 1], ['Law rune', 1], ['Fire rune', 1]), worn: bag(['Staff of air', 1]) })))!;
    expect(worn.summary).toMatch(/^Cast Varrock Teleport → Varrock Square · saves ~\d+ s$/);
    const inBag = recommendedTransport(travelOptions(input({ from: at(3093, 3248), to, carried: bag(['Staff of air', 1], ['Law rune', 1], ['Fire rune', 1]), worn: [] })))!;
    expect(inBag.summary).toMatch(/· wield your Staff of air$/);
    expect(inBag.actions).toEqual(['wield your Staff of air']);
    expect(staffCover('air', { carried: bag(['Smoke battlestaff', 1]), worn: bag(['Smoke battlestaff', 1]), members: false })).toBeNull();
    expect(staffCover('fire', { carried: bag(['Smoke battlestaff', 1]), worn: bag(['Smoke battlestaff', 1]), members: true })).toEqual({ staff: 'Smoke battlestaff', worn: true });
    // Without a separate list of what is worn (an older plugin) a staff anywhere counts, as before.
    expect(staffCover('air', { carried: bag(['Staff of air', 1]), members: false })).toEqual({ staff: 'Staff of air', worn: true });
  });
});

describe('the Chronicle’s charges', () => {
  const book = bag(['Chronicle', 1], ['Coins', 5000]);
  it('known charges make the book ready, without "check charges"; unknown ones keep the check', () => {
    expect(recommendedTransport(travelOptions(input({ carried: book, chronicleCharges: 12 })))!.summary).toMatch(/^Use Chronicle → Champions' Guild · saves ~\d+ s$/);
    expect(recommendedTransport(travelOptions(input({ carried: book })))!.summary).toMatch(/· check charges$/);
  });

  it('an empty book is not a way; a card in the bag charges it on the spot; otherwise the card is what it lacks', () => {
    const empty = travelOptions(input({ carried: book, chronicleCharges: 0 }));
    expect(empty.find((o) => o.id === 'chronicle')!.availability).toBe('locked');
    expect(recommendedTransport(empty)?.item).not.toBe('Chronicle');
    const card = recommendedTransport(travelOptions(input({ carried: bag(['Chronicle', 1], ['Teleport card', 2]), chronicleCharges: 0 })))!;
    expect(card.summary).toMatch(/· use a Teleport card on the Chronicle$/);
    // Next to Diango: the empty book gets a prepared variant with a card bought at the toy store.
    const prepared = travelOptions(input({ from: at(3093, 3248), carried: book, chronicleCharges: 0 })).find((o) => o.id === 'chronicle-prepare')!;
    expect(prepared.prepare!.stops[0]).toMatchObject({ action: 'buy', where: "Diango's Toy Store — Draynor Village", items: [{ name: 'Teleport card', qty: 1, price: 150 }] });
  });

  it('a new book is bought with a card (a new book has no charges): one stop, the price of both', () => {
    const acquire = travelOptions(input({ from: at(3093, 3248) })).find((o) => o.id === 'chronicle-acquire')!;
    expect(acquire.prepare!.stops).toHaveLength(1);
    expect(acquire.prepare!.stops[0].items.map((i) => i.name)).toEqual(['Chronicle', 'Teleport card']);
    expect(acquire.prepare!.cost).toBe(450);
  });

  it('the cards and the book are counted by the game', () => {
    expect(transportWatch('f2p')).toEqual(expect.arrayContaining(['Chronicle', 'Teleport card']));
  });
});

describe('more banks', () => {
  it('the Grand Exchange bankers and the Lumbridge Castle bank are stops; the castle one costs the stairs', () => {
    const labels = BANKS.map((b) => b.label);
    expect(labels).toEqual(expect.arrayContaining(['Grand Exchange bank', 'Lumbridge Bank (castle top floor)']));
    const lumbridge = BANKS.find((b) => b.plane === 2)!;
    expect(bankTiles(at(3222, 3219), lumbridge)).toBe(14 + 2 * STAIRS_TILES_PER_FLOOR);
    // From the castle courtyard the castle's own bank is the nearest, stairs and all.
    const withdraw = travelOptions(input({ from: at(3222, 3219), to: at(3210, 3494), carried: bag(['Coins', 5]), bank: new Map([['law rune', 5], ['air rune', 30], ['fire rune', 5]]) }))
      .find((o) => o.id === 'varrock-teleport-prepare');
    if (withdraw) expect(withdraw.prepare!.stops[0].where).toBe('Lumbridge Bank (castle top floor)');
  });
});

describe('supplies for the road', () => {
  const steps = allSteps.filter((s) => s.stage === 2);
  const state = buildPlayerState({ mode: 'f2p', stats: null, progress: { levels: {} }, owned: owned({}, false), gear: gear([]), questsDone: null, connected: true });
  const sourceOf = transportSources(state);

  it('the road goes through the canonical quest lines in order and never through a point underground', () => {
    const s501 = stepTargets(stepById.get('S5-01')!);
    expect(s501.map((t) => t.label)).toEqual(expect.arrayContaining([expect.stringContaining('Guildmaster'), expect.stringContaining('Oziach')]));
    const legs = roadLegs({ steps: allSteps.filter((s) => s.stage === 5) });
    expect(legs.length).toBeGreaterThan(5);
    expect(legs.every((l) => isOverworld(l.from) && isOverworld(l.to))).toBe(true);
    // A step in progress starts at the line the game confirms.
    expect(stepTargets(stepById.get('S5-01')!, { stepId: 'S5-01', stageAt: 0, lineIndex: 1, peeking: false })[0].label).toContain('Oziach');
  });

  it('counts the teleports that pay off and says what to buy where; an unread bank makes it "up to", never "none"', () => {
    const plan = planTravelSupplies({ steps, levels: { magic: 25, woodcutting: 15 }, members: false, gear: gear([]), owned: owned({}, false), spellbook: 0, chronicleCharges: null, sourceOf });
    expect(plan.uses.map((u) => u.wayId)).toEqual(expect.arrayContaining(['chronicle', 'varrock-teleport']));
    expect(plan.savedTiles).toBeGreaterThan(SUPPLY_MIN_TOTAL_TILES);
    const cards = plan.items.find((i) => i.name === 'Teleport card')!;
    expect(cards).toMatchObject({ certain: false, have: null, source: { kind: 'shop', price: 150 } });
    expect(cards.need).toBe(plan.uses.find((u) => u.wayId === 'chronicle')!.count);
    expect(cards.use).toContain('one card, one charge');
    const law = plan.items.find((i) => i.name === 'Law rune')!;
    expect(law.source).toMatchObject({ kind: 'exchange' });
    expect(plan.items.find((i) => i.name === 'Air rune')!.source).toMatchObject({ kind: 'shop' });
  });

  it('what the bag, the bank and the book hold is subtracted; a worn staff saves its runes', () => {
    const base = { steps, levels: { magic: 25, woodcutting: 15 }, members: false, spellbook: 0, sourceOf } as const;
    const plain = planTravelSupplies({ ...base, gear: gear([]), owned: owned({ 'Teleport card': 0, Chronicle: 0, 'Law rune': 0, 'Air rune': 0, 'Fire rune': 0 }), chronicleCharges: 0 });
    const uses = plain.uses.find((u) => u.wayId === 'chronicle')!.count;
    expect(plain.items.find((i) => i.name === 'Teleport card')).toMatchObject({ certain: true, buy: uses, cost: uses * 150 });
    expect(plain.items.find((i) => i.name === 'Chronicle')).toMatchObject({ need: 1, buy: 1, certain: true });
    const charged = planTravelSupplies({ ...base, gear: gear([['Chronicle', 1]].map(([n, c], i) => ({ id: i + 1, name: n as string, count: c as number }))), owned: owned({ 'Teleport card': 0 }), chronicleCharges: 500 });
    expect(charged.items.find((i) => i.name === 'Teleport card')).toMatchObject({ buy: 0 });
    expect(charged.items.find((i) => i.name === 'Chronicle')).toMatchObject({ buy: 0 });
    const staff = planTravelSupplies({ ...base, gear: gear([], bag(['Staff of air', 1])), owned: owned({}), chronicleCharges: null });
    expect(staff.items.some((i) => i.name === 'Air rune')).toBe(false);
    const staffInBag = planTravelSupplies({ ...base, gear: gear(bag(['Staff of air', 1])), owned: owned({}), chronicleCharges: null });
    expect(staffInBag.staffHints.join(' ')).toContain('wield your Staff of air');
  });

  it('the road is the open steps from the shown one on', () => {
    const road = roadSteps(allSteps, (id) => id !== 'S5-02', 'S5-01', 4);
    expect(road.map((s) => s.id)).toEqual(['S5-01', 'S5-03', 'S5-04', 'S5-05']);
  });
});

describe('"stock up here" on the game card', () => {
  const supplies = (certain: boolean): TravelSupplies => ({
    legs: [], steps: 8, staffHints: [], savedTiles: 600,
    uses: [{ wayId: 'chronicle', way: 'Chronicle', count: 6, savedTiles: 600 }],
    items: [{ name: 'Teleport card', need: 6, have: certain ? 1 : null, buy: certain ? 5 : 6, certain, source: diango('Teleport card'), cost: certain ? 750 : 900, for: ['Chronicle ×6'], use: 'use them on the Chronicle: one card, one charge' }],
  });

  it('standing by the shop: what to buy, how many, the price and why; an unread count says "up to" and what to check', () => {
    const near = supplyStop(supplies(true), at(3085, 3250), at(3190, 3360))!;
    expect(near.rec.state).toBe('prepare');
    expect(near.rec.summary).toBe("Stock up for the road: buy Teleport card ×5 at Diango's Toy Store (~750 gp) · Chronicle ×6 save ~3 min");
    expect(near.rec.prepare!.buy).toEqual([{ name: 'Teleport card', quantity: 5, where: "Diango's Toy Store — Draynor Village" }]);
    expect(near.rec.text).toContain('Then use them on the Chronicle: one card, one charge.');
    expect(near.rec.tile).toMatchObject({ x: 3081, y: 3246 });
    const unsure = supplyStop(supplies(false), at(3085, 3250), at(3190, 3360))!;
    expect(unsure.rec.summary).toMatch(/^Stock up for the road: buy up to Teleport card ×6 at Diango's Toy Store .* · check the book’s charges first$/);
  });

  it('away from the shop: only a confirmed shortage on the way is worth a detour; a small saving is never worth one', () => {
    // From Port Sarim to Draynor and on: the toy store is on the way.
    expect(supplyStop(supplies(true), at(3030, 3240), at(3110, 3290))).not.toBeNull();
    expect(supplyStop(supplies(false), at(3030, 3240), at(3110, 3290))).toBeNull();
    // Far off the way.
    expect(supplyStop(supplies(true), at(3222, 3219) /* Lumbridge */, at(3190, 3360))).toBeNull();
    const small = { ...supplies(true), uses: [{ wayId: 'chronicle', way: 'Chronicle', count: 1, savedTiles: SUPPLY_MIN_TOTAL_TILES - 1 }] };
    expect(supplyStop(small, at(3085, 3250), at(3190, 3360))).toBeNull();
    expect(SUPPLY_NEAR_TILES).toBeGreaterThan(0);
  });

  describe('a way is stocked for only when everything it lacks can be had on the trip (the live check, Varrock east)', () => {
    const AUBURY = at(3253, 3401);
    const GE = { x: EXCHANGE.x, y: EXCHANGE.y, plane: EXCHANGE.plane };
    const runes = (lawCertain: boolean): TravelSupplies => ({
      legs: [], steps: 8, staffHints: [], savedTiles: 290,
      uses: [{ wayId: 'varrock-teleport', way: 'Varrock Teleport', count: 1, savedTiles: 290 }],
      items: [
        { name: 'Fire rune', need: 1, have: 0, buy: 1, certain: true, source: { kind: 'shop', where: "Aubury's Rune Shop — Varrock", point: AUBURY, price: 4 }, cost: 4, for: ['Varrock Teleport ×1'] },
        { name: 'Law rune', need: 1, have: lawCertain ? 0 : null, buy: 1, certain: lawCertain, source: { kind: 'exchange', where: EXCHANGE.label, point: GE, price: 160 }, cost: 160, for: ['Varrock Teleport ×1'] },
      ],
    });
    const varrockEast = at(3256, 3447);
    const musaPoint = at(2923, 3180);

    it('a Fire rune alone is not a teleport: with the Law rune short and the exchange far off, there is nothing to stock up', () => {
      expect(supplyStop(runes(true), varrockEast, musaPoint)).toBeNull();
    });

    it('what is not known to be short does not hold the way back: the confirmed Fire rune is still suggested', () => {
      const stop = supplyStop(runes(false), varrockEast, musaPoint)!;
      expect(stop.rec.prepare!.buy).toEqual([{ name: 'Fire rune', quantity: 1, where: "Aubury's Rune Shop — Varrock" }]);
    });

    it('by the exchange, with the rune shop on the way, both are one trip: nearest first, each with its own stop', () => {
      const stop = supplyStop(runes(true), at(3170, 3480), at(3253, 3430))!;
      expect(stop.rec.prepare!.stops.map((s) => s.where)).toEqual([EXCHANGE.label, "Aubury's Rune Shop — Varrock"]);
      expect(stop.rec.prepare!.buy.map((b) => b.name)).toEqual(['Law rune', 'Fire rune']);
      // The saving is the road's minus the detour of the stops (player > exchange > rune shop > target against going straight).
      const pos = at(3170, 3480);
      const target = at(3253, 3430);
      const detour = dist(pos, GE) + dist(GE, AUBURY) + dist(AUBURY, target) - dist(pos, target);
      expect(stop.rec.savedTiles).toBe(290 - detour);
      expect(stop.rec.summary).toBe(`Stock up for the road: buy Law rune ×1 at the ${EXCHANGE.label}; Fire rune ×1 at Aubury's Rune Shop (~164 gp) · Varrock Teleport ×1 save ${savedText(290 - detour)}`);
      expect(stop.rec.tile).toMatchObject({ x: GE.x, y: GE.y });
    });
  });

  it('the card plans from the objective: a shop next to it cannot serve the leg that leads there (the live check, Lumbridge to Reldo)', () => {
    const ow = owned({ 'Law rune': 0, 'Air rune': 632, 'Fire rune': 0, 'Teleport card': 0, Chronicle: 0 });
    const g = gear(bag(['Chronicle', 1], ['Coins', 2005]));
    const st = buildPlayerState({ mode: 'f2p', stats: null, progress: { levels: {} }, owned: ow, gear: g, questsDone: null, connected: true });
    const base = { steps: roadSteps(allSteps, () => true, 'S3-05').slice(0, 1), levels: { magic: 25, woodcutting: 15 }, members: false, gear: g, owned: ow, spellbook: 0, chronicleCharges: 0, sourceOf: transportSources(st) };
    const lumbridge = at(3222, 3219);
    const reldo = at(3210, 3494);
    // The drawer's list starts at the player: this leg's Varrock Teleport is part of what to bring.
    const fromPlayer = planTravelSupplies({ ...base, from: lumbridge });
    expect(fromPlayer.legs[0]).toMatchObject({ stepId: 'S3-05', wayId: 'varrock-teleport' });
    expect(fromPlayer.items.find((i) => i.name === 'Law rune')).toMatchObject({ have: 0, buy: 1, certain: true });
    // Planned from the player, the exchange (next to Reldo) looked like a stop "on the way" (the bug seen live in 2.53). Since 2.55 the trip also has to
    // fetch the Air runes from the castle bank upstairs and pay for its detour, so even planned from the player it is not offered.
    expect(supplyStop(fromPlayer, lumbridge, reldo)).toBeNull();
    // The card's road starts at the objective, so there is no stop to suggest on this leg.
    const fromObjective = planTravelSupplies({ ...base, from: null });
    expect(fromObjective.legs.some((l) => l.stepId === 'S3-05')).toBe(false);
    expect(supplyStop(fromObjective, lumbridge, reldo)).toBeNull();
  });

  it('the decision: by the shop the stock-up comes first; the plugin gets the purchases', () => {
    const step = stepById.get('S5-01')!;
    const ow = owned({ Chronicle: 0, 'Teleport card': 0 });
    const g = gear(bag(['Chronicle', 1], ['Coins', 5000]));
    const st = buildPlayerState({ mode: 'f2p', stats: null, progress: { levels: {} }, owned: ow, gear: g, questsDone: null, connected: true });
    const d = decideTransport({
      step, pos: at(3085, 3250), instruction: null, nextStep: null, levels: { magic: 25, woodcutting: 15 }, stats: null, gear: g, owned: ow, mode: 'f2p',
      homeCooldownSec: 900, homeCooldownKnown: true, spellbook: 0, chronicleCharges: 1, sourceOf: transportSources(st), supplies: supplies(true),
    });
    expect(d.supply).toMatchObject({ where: "Diango's Toy Store — Draynor Village", items: ['Teleport card ×5'] });
    expect(d.recommended!.summary).toMatch(/^Stock up for the road/);
    const engine = createReadinessEngine({ steps: allSteps, progress: emptyProgress(), qp: 0, mode: 'f2p', state: st });
    const payload = planPayload(engine.plan(step), { transport: d.recommended });
    expect(payload.recommendedTransport!.buy).toEqual([{ name: 'Teleport card', quantity: 5, where: "Diango's Toy Store — Draynor Village" }]);
    expect(payload.recommendedTransport!.state).toBe('prepare');
  });
});

describe('the stock-up trip covers the whole kit, pays for its detour and says what it does not know (2.55)', () => {
  const AUBURY = at(3253, 3401);
  const GE = { x: EXCHANGE.x, y: EXCHANGE.y, plane: EXCHANGE.plane };
  const shop = (name: string, point: { x: number; y: number; plane: number }, price: number, kind: 'shop' | 'exchange' = 'shop') => ({ kind, where: name, point, price });
  const item = (over: Partial<TravelSupplies['items'][number]> & { name: string; need: number }): TravelSupplies['items'][number] => ({
    have: 0, buy: over.need, certain: true, source: null, cost: 0, for: ['Varrock Teleport ×1'], inBag: 0, inBank: 0, ...over,
  });
  const road = (items: TravelSupplies['items'], saved = 400, coins?: TravelSupplies['coins']): TravelSupplies => ({
    legs: [], steps: 8, staffHints: [], savedTiles: saved, uses: [{ wayId: 'varrock-teleport', way: 'Varrock Teleport', count: 1, savedTiles: saved }], items, ...(coins ? { coins } : {}),
  });
  // Standing by Aubury's, the target to the north.
  const here = at(3250, 3405);
  const target = at(3240, 3480);

  it('what the bank holds and the bag does not is taken from the bank on the same trip, before or after buying the rest', () => {
    const s = road([
      item({ name: 'Fire rune', need: 1, buy: 1, source: shop("Aubury's Rune Shop — Varrock", AUBURY, 4), cost: 4 }),
      item({ name: 'Air rune', need: 3, have: 632, buy: 0, inBag: 0, inBank: 632 }),
      item({ name: 'Law rune', need: 1, have: 5, buy: 0, inBag: 0, inBank: 5 }),
    ]);
    const stop = supplyStop(s, here, target)!;
    expect(stop).not.toBeNull();
    expect(stop.rec.prepare!.withdraw).toEqual(expect.arrayContaining([{ name: 'Air rune', quantity: 3 }, { name: 'Law rune', quantity: 1 }]));
    expect(stop.rec.prepare!.buy).toEqual([{ name: 'Fire rune', quantity: 1, where: "Aubury's Rune Shop — Varrock" }]);
    expect(stop.rec.prepare!.stops.map((x) => x.action).sort()).toEqual(['buy', 'withdraw']);
    expect(stop.rec.summary).toMatch(/take .*Air rune ×3.* from /);
  });

  it('quantities are the road\'s, less what the bag already holds; the bag and the bank are not both counted', () => {
    const s = road([item({ name: 'Law rune', need: 3, have: 1, buy: 2, inBag: 1, inBank: 0, source: shop("Aubury's Rune Shop — Varrock", AUBURY, 160), cost: 320 })]);
    const stop = supplyStop(s, here, target)!;
    expect(stop.rec.prepare!.buy).toEqual([{ name: 'Law rune', quantity: 2, where: "Aubury's Rune Shop — Varrock" }]);
    expect(stop.rec.prepare!.withdraw).toEqual([]);
    expect(stop.rec.prepare!.cost).toBe(320);
  });

  it('a trip whose detour eats the saving is not offered, however good the teleports are', () => {
    const items = [item({ name: 'Law rune', need: 1, buy: 1, source: shop(EXCHANGE.label, GE, 160, 'exchange'), cost: 160 })];
    // By the exchange the trip is free: offered.
    expect(supplyStop(road(items, 200), at(3165, 3485), at(3220, 3430))).not.toBeNull();
    // From the rune shop the exchange is a detour of about 170 tiles against a 200-tile saving: what is left is under the minimum, not offered.
    expect(supplyStop(road(items, 200), here, at(3260, 3340))).toBeNull();
  });

  it('an unconfirmed item off the trip does not hide: the summary says to check the bank for it', () => {
    const s = road([
      item({ name: 'Fire rune', need: 1, buy: 1, source: shop("Aubury's Rune Shop — Varrock", AUBURY, 4), cost: 4 }),
      item({ name: 'Law rune', need: 1, have: null, buy: 1, certain: false, inBag: 0, inBank: null, source: shop(EXCHANGE.label, GE, 160, 'exchange'), cost: 160 }),
    ]);
    const stop = supplyStop(s, here, at(3250, 3300))!;
    expect(stop.rec.prepare!.buy.map((b) => b.name)).toEqual(['Fire rune']);
    expect(stop.rec.summary).toMatch(/check your bank for Law rune/);
  });

  it('coins: a known total too small is no trip; short in the bag but in the bank is a withdrawal on the way; unknown is said', () => {
    const items = [item({ name: 'Law rune', need: 2, buy: 2, source: shop("Aubury's Rune Shop — Varrock", AUBURY, 160), cost: 320 })];
    expect(supplyStop(road(items, 400, { bag: 100, bank: 50 }), here, target)).toBeNull();
    const withdraw = supplyStop(road(items, 400, { bag: 100, bank: 5000 }), here, target)!;
    expect(withdraw.rec.prepare!.withdraw).toEqual([{ name: 'Coins', quantity: 220 }]);
    const unknown = supplyStop(road(items, 400, { bag: 100, bank: null }), here, target)!;
    expect(unknown.rec.summary).toMatch(/check you have the coins/);
    expect(supplyStop(road(items, 400, { bag: 1000, bank: null }), here, target)!.rec.summary).not.toMatch(/coins/);
  });
});

import { describe, expect, it } from 'vitest';
import { buildPlayerState } from '../src/lib/playerState';
import { emptyProgress } from '../src/lib/progress';
import { RANGED_WATCH, rangedEquipment, rangedNeeds } from '../src/lib/rangedLoadout';
import { methodNeeds, personalize, trainingMethods } from '../src/lib/trainingRouter';
import { methodRate, rateKeyOf } from '../src/lib/methodRates';
import type { PriceView } from '../src/lib/funding/quotes';

const prices: PriceView = { status: 'live', at: 1, idOf: () => undefined, limitOf: () => undefined, sell: () => null,
  buy: name => ({ price: name.startsWith('Gilded') ? 1000000 : name.endsWith(' arrow') || name === 'Salmon' ? 1 : 10,
    basis: 'side', confidence: 'HIGH', ageMinutes: 0, volumePerHour: null, notes: [] }) };
const state = (ranged: number | null, defence = 1, cash: number | null = 10000, owned: Record<string, number> = {}, quests: string[] = [], bankSeen = true) => buildPlayerState({
  mode: 'f2p', stats: null, progress: { ...emptyProgress(), levels: { ...(ranged === null ? {} : { ranged }), defence, hitpoints: 30 } },
  gear: cash === null ? null : { equipment: [], inventory: [], coins: cash, bankCoins: 0 } as never,
  questsDone: quests, connected: true,
  owned: { bankSeen, items: new Map(RANGED_WATCH.map(name => [name.toLowerCase(), { name, carried: 0, noted: 0, ...(bankSeen ? { bank: owned[name] ?? 0 } : {}) }])) },
});
const names = (s: ReturnType<typeof state>) => rangedNeeds(s, prices).flatMap(n => n.type === 'item' ? [n.name] : []);

describe('one complete, level-appropriate F2P ranged kit', () => {
  it.each([[1, 'Shortbow'], [5, 'Oak shortbow'], [20, 'Willow shortbow'], [30, 'Maple shortbow']] as const)('chooses the unlocked shortbow at Ranged %s', (level, bow) => {
    expect(names(state(level))[0]).toBe(bow);
  });
  it('checks body Defence and Dragon Slayer separately from Ranged', () => {
    expect(names(state(40, 1))).toContain('Leather body');
    expect(names(state(40, 20))).toContain('Studded body');
    expect(names(state(40, 40))).not.toContain("Green d'hide body");
    const kit = names(state(40, 40, 10000, {}, ['Dragon Slayer I']));
    expect(kit).toEqual(expect.arrayContaining(["Green d'hide body", "Green d'hide chaps", "Green d'hide vambraces", 'Coif', 'Amulet of power']));
    expect(kit.some(n => n.startsWith('Gilded'))).toBe(false);
    expect(kit).not.toContain('Amulet of strength');
  });
  it('reuses an owned bow, compatible banked arrows and owned armour with no cash', () => {
    const kit = names(state(40, 40, 0, { 'Maple shortbow': 1, 'Adamant arrow': 100, "Green d'hide chaps": 1, 'Amulet of power': 1 }));
    expect(kit[0]).toBe('Maple shortbow');
    expect(kit[1]).toBe('Adamant arrow');
    expect(kit).toContain("Green d'hide chaps");
    expect(kit).toContain('Amulet of power');
  });
  it('does not invent cash, an unlocked level or an owned expensive outfit', () => {
    const unknown = names(state(null, 1, null, {}, [], false));
    expect(unknown[0]).toBe('Shortbow');
    expect(unknown).not.toContain('Maple shortbow');
    expect(unknown).not.toContain("Green d'hide body");
    expect(unknown).not.toContain('Amulet of power');
    expect(rangedNeeds(state(null), prices)).toContainEqual({ type: 'skill', skill: 'ranged', min: 1 });
  });
  it('forecasts in the requested ranged outfit, without plate armour, shield or a duplicated two-handed bow', () => {
    const equipment = rangedEquipment({ weapon: 'Adamant scimitar', body: 'Iron platebody', legs: 'Iron plateskirt', shield: 'Iron kiteshield' }, rangedNeeds(state(20, 20), prices));
    expect(equipment.weapon).toBe('Willow shortbow');
    expect(equipment.body).toBe('Studded body');
    expect(equipment.legs).toBe('Studded chaps');
    expect(equipment.shield).toBeUndefined();
    expect(equipment['2h']).toBeUndefined();
  });
  it('invalidates cached forecasts when only budget or quest unlocks change', () => {
    const method = trainingMethods.find(m => m.id === 'ra-lumb')!;
    const poor = state(30, 1, 0), funded = state(30, 1, 10000);
    const low = personalize([method], 'ranged', poor, prices)[0];
    const high = personalize([method], 'ranged', funded, prices)[0];
    expect(high).not.toBe(low);
    expect(high.xph).toEqual(methodRate(method, 'ranged', funded, { prices })!.xph.map(Math.round));
    expect(high.xph).not.toEqual(low.xph);
    expect(rateKeyOf(state(40, 40))).not.toBe(rateKeyOf(state(40, 40, 10000, {}, ['Dragon Slayer I'])));
    expect(rateKeyOf({ ...funded, position: { known: true, source: 'game', value: { x: 1, y: 2, plane: 0 } } })).toBe(rateKeyOf(funded));
  });
  it('uses the same kit for a newly declared ranged method, not a step-ID exception', () => {
    const method = { ...trainingMethods.find(m => m.id === 'ra-lumb')!, id: 'future-ranged-method' };
    const st = state(30, 20);
    expect(methodNeeds(method, st, prices)).toEqual(rangedNeeds(st, prices));
  });
});

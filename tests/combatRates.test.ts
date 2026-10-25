// The combat model's own rates for the Skills page's combat methods (2.76, T10): melee, Ranged and Magic from one engine, for this player's levels
// and worn gear, and the spot registry and the Skills catalogue kept in step.

import { describe, expect, it } from 'vitest';
import { buildPlayerState, type PlayerState } from '../src/lib/playerState';
import { adviseTraining, trainingMethods, type TrainingMethod } from '../src/lib/trainingRouter';
import { methodRate } from '../src/lib/combatRates';
import { attacksToKill } from '../src/lib/combatEstimate';
import { TRAINER_SPOTS } from '../src/lib/combatRoute/spots';
import { market } from './funding/market';
import type { PriceView } from '../src/lib/funding/quotes';

const prices = market();
/** A fixed exchange for the costs: every rune 5 gp, every arrow 3 gp (the recorded market has neither). */
const fixed: PriceView = {
  status: 'live', at: 1, idOf: () => undefined, limitOf: () => undefined, sell: () => null,
  buy: (name) => (/ rune$/.test(name) ? 5 : / arrow$/.test(name) ? 3 : null) === null ? null
    : { price: / rune$/.test(name) ? 5 : 3, basis: 'side', confidence: 'HIGH', ageMinutes: 0, volumePerHour: null, notes: [] },
};
const method = (id: string) => trainingMethods.find((m) => m.id === id) as TrainingMethod;
const state = (stats: Record<string, number>, equipment: [number, string, string, number?][], known = true): PlayerState => buildPlayerState({
  mode: 'f2p', stats: stats as never, progress: { levels: {} }, owned: null, questsDone: [], connected: true,
  gear: known ? { equipment: equipment.map(([id, name, slot, count]) => ({ id, name, slot, ...(count ? { count } : {}) })), inventory: [], coins: 0, bankCoins: 0 } as never : null,
});
const MELEE: [number, string, string][] = [[1331, 'Adamant scimitar', 'weapon'], [1153, 'Iron full helm', 'head'], [1115, 'Iron platebody', 'body'], [1081, 'Iron plateskirt', 'legs'], [1191, 'Iron kiteshield', 'shield']];
const BOW: [number, string, string, number?][] = [[841, 'Shortbow', 'weapon'], [882, 'Bronze arrow', 'ammo', 100]];
const mid = (r: { xph: [number, number] }) => (r.xph[0] + r.xph[1]) / 2;

describe('one engine for every combat method', () => {
  it('melee: the fight plans\' model, faster with better levels, and nothing for a fight that is not safe', () => {
    const weak = state({ attack: 20, strength: 20, defence: 1, hitpoints: 20 }, MELEE);
    const strong = state({ attack: 40, strength: 40, defence: 30, hitpoints: 40 }, MELEE);
    const frogsWeak = methodRate(method('me-frog'), 'attack', weak)!;
    const frogsStrong = methodRate(method('me-frog'), 'attack', strong)!;
    expect(frogsWeak.xph[0]).toBeLessThan(frogsWeak.xph[1]);
    expect(mid(frogsStrong)).toBeGreaterThan(mid(frogsWeak));
    // Hill Giants hit 4: with 7 health that is more than half - no rate, the wiki's guide stays.
    expect(methodRate(method('me-hill'), 'attack', state({ attack: 20, strength: 20, defence: 1, hitpoints: 7 }, MELEE))).toBeNull();
  });

  it('Ranged: the trainers the wiki names come out of the numbers, seagulls first, frogs after 20, moss giants late', () => {
    const at = (level: number) => {
      const s = state({ ranged: level, defence: 1, hitpoints: Math.max(10, level) }, BOW);
      return Object.fromEntries(['ra-lumb', 'ra-monk', 'ra-frog', 'ra-moss'].map((id) => [id, methodRate(method(id), 'ranged', s)]));
    };
    const one = at(1);
    expect(mid(one['ra-lumb']!)).toBeGreaterThan(mid(one['ra-frog']!));
    const thirty = at(30);
    expect(mid(thirty['ra-frog']!)).toBeGreaterThan(mid(thirty['ra-lumb']!));
    const seventy = at(70);
    expect(mid(seventy['ra-moss']!)).toBeGreaterThan(mid(seventy['ra-lumb']!));
  });

  it('Ranged: the arrows broken are the cost an hour, at the exchange price', () => {
    const r = methodRate(method('ra-frog'), 'ranged', state({ ranged: 30, hitpoints: 30 }, BOW), { prices: fixed })!;
    // One arrow in five breaks: 3 gp each, a few hundred to a few thousand shots an hour.
    expect(r.costPerHour!).toBeGreaterThan(100);
    expect(r.costPerHour!).toBeLessThan(3 * 0.2 * 2400);
    expect(methodRate(method('ra-frog'), 'ranged', state({ ranged: 30, hitpoints: 30 }, BOW))!.costPerHour).toBeNull();
  });

  it('Magic: every strike hits as hard as the tier allows, a landed 0 does no damage, and the runes are the cost', () => {
    // A spell can land for 0: it takes more casts than a melee hit of the same max, whose 0 counts as 1.
    expect(attacksToKill(8, 2, 0.8, false).mean).toBeGreaterThan(attacksToKill(8, 2, 0.8).mean);
    const s = (magic: number) => state({ magic, hitpoints: 10 }, []);
    const low = methodRate(method('ma-strike'), 'magic', s(3), { prices: fixed })!;
    const high = methodRate(method('ma-strike'), 'magic', s(13), { prices: fixed })!;
    // Magic 13 unlocks the strike tier's max hit of 8 (from 2 at Magic 1): more XP an hour on cows, though a kill now takes a few casts and the walk to the next one counts.
    expect(mid(high)).toBeGreaterThan(mid(low) * 1.1);
    expect(low.basis).toBe('Wind Strike');
    // Wind Strike: an air and a mind rune a cast, 10 gp at this exchange; a cast every 3 s at most.
    expect(low.costPerHour!).toBeGreaterThan(0);
    expect(low.costPerHour!).toBeLessThanOrEqual(1200 * 10);
  });

  it('never guesses: unread worn items, an unknown level or a weapon the data does not know give no rate', () => {
    expect(methodRate(method('me-frog'), 'attack', state({ attack: 20, strength: 20, defence: 1, hitpoints: 20 }, MELEE, false))).toBeNull();
    expect(methodRate(method('me-frog'), 'attack', state({ strength: 20, defence: 1, hitpoints: 20 }, MELEE))).toBeNull();
    expect(methodRate(method('me-frog'), 'attack', state({ attack: 20, strength: 20, defence: 1, hitpoints: 20 }, [[999999, 'Mystery blade', 'weapon']]))).toBeNull();
  });
});

describe('the Skills page reads the same numbers', () => {
  it('a combat method gets the model\'s rate "for you", and the time to the goal is the model\'s', () => {
    const s = state({ ranged: 30, defence: 1, hitpoints: 30 }, BOW);
    const a = adviseTraining({ skill: 'ranged', target: 40, state: s, mode: 'f2p', style: 'chill', priority: 'balanced', prices });
    expect(a.best?.method.rateSource).toBe('model');
    expect(a.reason).toMatch(/XP per hour for you/);
    expect(a.time?.source).toBe('model');
  });

  it('without the game the wiki\'s guide stays, said as such', () => {
    const s = state({ ranged: 30 }, [], false);
    const a = adviseTraining({ skill: 'ranged', target: 40, state: s, mode: 'f2p', style: 'chill', priority: 'balanced' });
    expect(a.best?.method.rateSource).toBeUndefined();
    expect(a.reason).not.toMatch(/for you/);
  });
});

describe('drops weigh the same on the Skills page as in the fight plans', () => {
  const hero = state({ attack: 30, strength: 21, defence: 1, hitpoints: 24 }, MELEE);
  it('the Big bones of the frogs are banked when they pay: coins an hour, the pickups and bank trips taken from the XP', () => {
    const bare = methodRate(method('me-frog'), 'attack', hero)!;
    const looted = methodRate(method('me-frog'), 'attack', hero, { prices, restriction: 'LIFTED' })!;
    expect(looted.loot).toBe('Big bones');
    expect(looted.lootPerHour!).toBeGreaterThan(10000);
    expect(looted.xph[1]).toBeLessThan(bare.xph[1]);
    // A restricted account cannot sell cowhides: the cows bring nothing then.
    expect(methodRate(method('me-cow'), 'attack', hero, { prices, restriction: 'RESTRICTED' })!.lootPerHour).toBeUndefined();
  });

  it('the Skills page picks the spot the fight plan picks for the same character: the frogs with their Big bones', () => {
    const a = adviseTraining({ skill: 'attack', target: 40, state: hero, mode: 'f2p', style: 'chill', priority: 'balanced', prices, restriction: 'LIFTED' });
    expect(a.best?.method.id).toBe('me-frog');
    expect(a.reason).toMatch(/Big bones ≈ \+[\d.]+k gp per hour/);
    // The path under it weighs every later level the same way: no switch away from the frogs a level later.
    expect(a.path.map((l) => l.method.id)).toEqual(['me-frog']);
  });
});

describe('the spot registry and the Skills catalogue', () => {
  it('every free melee training spot is a Skills method and every free melee method\'s opponent has a spot: adding one without the other fails', () => {
    const melee = trainingMethods.filter((m) => m.kind === 'method' && !m.members && m.skills.includes('attack') && m.npcNames?.length);
    const spots = TRAINER_SPOTS.filter((t) => !t.members).map((t) => t.foe);
    const methodFoes = melee.map((m) => m.npcNames![0]);
    // Lesser demons and Moss giants are Skills-page methods for later levels, not route spots yet.
    const later = ['Lesser demon', 'Moss giant'];
    expect(methodFoes.filter((f) => !spots.includes(f) && !later.includes(f))).toEqual([]);
    expect(spots.filter((f) => !methodFoes.includes(f))).toEqual([]);
  });
});

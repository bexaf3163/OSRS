import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { adviseTraining, trainingMethods, type PathLeg } from '../src/domain/training/trainingRouter';
import { coinsPerMinute, coinTimeShare, ZERO_SHARE } from '../src/domain/market/lootValue';
import { buildPlayerState } from '../src/domain/player/playerState';
import { emptyProgress } from '../src/domain/persistence/progress';
import { fakePrices } from './funding/helpers';
import { questCatalogue } from '../src/domain/planning/catalogue';
import { SKILL_NAMES } from '../src/domain/training/skillTrack';
import { methodPoint } from '../src/domain/training/methodStep';
import { levelForXp, xpForLevel } from '../src/domain/player/xp';

const prices = fakePrices(JSON.parse(readFileSync('tests/fixtures/gePrices.json', 'utf8')).prices);
const net = (m: PathLeg['method']) => m.marketNetPerHour
  ?? (m.costPerHour === null || (m.costPerHour === undefined && m.cost === 'cost') ? null : (m.lootPerHour ?? 0) - (m.costPerHour ?? 0));
// The plus-or-zero rule (owner, 2026-11-23): a loss under ZERO_SHARE of the coin rate is break-even.
const losing = (m: PathLeg['method'], mode: 'f2p' | 'members') => { const n = net(m); return n !== null && coinTimeShare(n, coinsPerMinute(prices, mode)) < -ZERO_SHARE; };
// A slower next leg is a planning error unless the faster one began to lose coins there and the plus-or-zero rule left it.
const slowerLegs = (legs: readonly PathLeg[]) => legs.slice(1).flatMap((leg, i) => {
  const before = legs[i].method.xph, now = leg.method.xph;
  return before && now && (now[0] + now[1]) < 0.7 * (before[0] + before[1]) && !leg.leftLoss
    ? [`${legs[i].fromLevel}-${legs[i].toLevel} ${legs[i].method.id} ${before} -> ${leg.fromLevel}-${leg.toLevel} ${leg.method.id} ${now}`] : [];
});
// A leg below its method's level, or a Members method in a free-to-play plan, is a plan the player cannot follow.
const unusableLegs = (legs: readonly PathLeg[], mode: string) => legs
  .filter((l) => l.fromLevel < l.method.from || (mode === 'f2p' && l.method.members)).map((l) => `${l.fromLevel}-${l.toLevel} ${l.method.id}`);
const SKILLS = ['attack', 'strength', 'defence', 'ranged', 'magic', 'prayer', 'cooking', 'woodcutting', 'fishing', 'firemaking', 'crafting', 'smithing', 'mining', 'runecraft'];

// A plan whose next leg is much slower than the one before is a planning error (a mixed wiki and model rate, an unmodelled tool,
// a cheap recipe beating a better one): levels only make the same method faster.
describe('F2P training plans from 1 to 99 never slow down from one leg to the next', () => {
  it.each(SKILLS)('%s', (skill) => {
    const stats = { attack: 40, strength: 40, defence: 40, hitpoints: 40, ranged: 40, magic: 40, prayer: 40, [skill]: 1 };
    const state = buildPlayerState({ mode: 'f2p', connected: true, player: 'P', stats, progress: emptyProgress(), questsDone: null,
      owned: { bankSeen: true, items: new Map() }, gear: { equipment: [], inventory: [], coins: 0, bankCoins: 5_000_000 } } as never);
    const advice = adviseTraining({ skill, target: 99, state, mode: 'f2p', prices } as never);
    expect(advice.time).not.toBeNull();
    expect(slowerLegs(advice.path)).toEqual([]);
    expect(unusableLegs(advice.path, 'f2p')).toEqual([]);
  });
});

// The owner's F2P rule (2026-11-23): a leg loses coins only where no free or earning method is open at its level (Prayer buys its bones).
describe('F2P training plans never lose coins while a free or earning method is open', () => {
  const f2pState = (skill: string, level: number) => buildPlayerState({ mode: 'f2p', connected: true, player: 'P', progress: emptyProgress(), questsDone: null,
    stats: { attack: 40, strength: 40, defence: 40, hitpoints: 40, ranged: 40, magic: 40, prayer: 40, [skill]: level },
    owned: { bankSeen: true, items: new Map() }, gear: { equipment: [], inventory: [], coins: 0, bankCoins: 5_000_000 } } as never);
  it.each(SKILLS)('%s', (skill) => {
    const advise = (level: number) => adviseTraining({ skill, target: 99, state: f2pState(skill, level), mode: 'f2p', prices } as never);
    const lossLegs = advise(1).path.filter((l) => losing(l.method, 'f2p'));
    const avoidable = lossLegs.filter((l) => !losing(advise(l.fromLevel).best!.method, 'f2p')).map((l) => `${l.fromLevel}-${l.toLevel} ${l.method.id}`);
    expect(avoidable).toEqual([]);
  });
});

describe('Members training plans from 1 to 99 never slow down from one leg to the next', () => {
  const MEMBERS = (SKILL_NAMES as readonly string[]).filter((s) => s !== 'hitpoints');
  it.each(MEMBERS)('%s', (skill) => {
    // Druidic Ritual, done here, already brings Herblore to 3.
    const stats = Object.fromEntries((SKILL_NAMES as readonly string[]).map((s) => [s, s === skill ? (skill === 'herblore' ? 3 : 1) : 50]));
    const state = buildPlayerState({ mode: 'members', connected: true, player: 'P', stats, progress: emptyProgress(), questsDone: questCatalogue.map((q) => q.id),
      owned: { bankSeen: true, items: new Map() }, gear: { equipment: [], inventory: [], coins: 0, bankCoins: 50_000_000 } } as never);
    const advice = adviseTraining({ skill, target: 99, state, mode: 'members', prices } as never);
    expect(advice.time).not.toBeNull();
    expect(slowerLegs(advice.path)).toEqual([]);
    expect(unusableLegs(advice.path, 'members')).toEqual([]);
  });
});

// The player's goal (owner, 2026-11-23) changes only the method choice: Fastest XP the fastest, Most coins the best earner, both plus or zero.
describe('the training goal picks the fastest or the best-earning method, never a losing one', () => {
  const base = { ...trainingMethods.find((m) => m.id === 'wc-tree')!, skills: ['crafting'], from: 1, to: 99, needs: [], objectNames: undefined, place: undefined };
  // A small break-even cost, a slower earner, and the fastest of all that loses far more than the break-even share.
  const methods = [
    { ...base, id: 'goal-fast', xph: [20000, 20000] as [number, number], cost: 'cost' as const, costPerHour: 500, lootPerHour: 0 },
    { ...base, id: 'goal-rich', xph: [10000, 10000] as [number, number], cost: 'profit' as const, costPerHour: 0, lootPerHour: 50000 },
    { ...base, id: 'goal-loss', xph: [40000, 40000] as [number, number], cost: 'cost' as const, costPerHour: 30000, lootPerHour: 0 },
  ];
  const pick = (goal: 'xp' | 'coins') => adviseTraining({ skill: 'crafting', target: 50, mode: 'f2p', prices, methods, state: buildPlayerState({ mode: 'f2p', connected: true, player: 'P',
    stats: { crafting: 1 }, progress: { ...emptyProgress(), trainingGoals: { crafting: goal } }, questsDone: null,
    owned: { bankSeen: true, items: new Map() }, gear: { equipment: [], inventory: [], coins: 0, bankCoins: 5_000_000 } } as never) } as never).best!.method;
  it.each([['xp', 'goal-fast'], ['coins', 'goal-rich']] as const)('%s', (goal, id) => {
    expect(pick(goal).id).toBe(id);
    expect(losing(pick(goal), 'f2p')).toBe(false);
  });
});

// The plus-or-zero rule also picks the arrows: a method whose kit arrows would lose coins fires the strongest cheaper ones that do not.
describe('a Ranged method fires cheaper arrows when the kit arrows would lose coins', () => {
  it('Members Ranged 50 on Brutus', () => {
    const stats = Object.fromEntries((SKILL_NAMES as readonly string[]).map((s) => [s, 50]));
    const state = buildPlayerState({ mode: 'members', connected: true, player: 'P', stats, progress: emptyProgress(), questsDone: questCatalogue.map((q) => q.id),
      owned: { bankSeen: true, items: new Map() }, gear: { equipment: [], inventory: [], coins: 0, bankCoins: 50_000_000 } } as never);
    const best = adviseTraining({ skill: 'ranged', target: 55, state, mode: 'members', prices } as never).best!.method;
    expect(best.id).toBe('ra-brutus');
    expect(best.ammo).toBeDefined();
    expect(losing(best, 'members')).toBe(false);
  });
});

// A melee plan wears what the Gear page would buy with the coins at hand, as a Ranged plan buys its bows: never unarmed to 99.
describe('F2P melee plans buy the weapon the gear advisor recommends', () => {
  it.each(['attack', 'strength', 'defence'])('%s', (skill) => {
    const state = buildPlayerState({ mode: 'f2p', connected: true, player: 'P', progress: emptyProgress(), questsDone: null,
      stats: { attack: 40, strength: 40, defence: 40, hitpoints: 40, [skill]: 1 },
      owned: { bankSeen: true, items: new Map() }, gear: { equipment: [], inventory: [], coins: 0, bankCoins: 5_000_000 } } as never);
    const advice = adviseTraining({ skill, target: 99, state, mode: 'f2p', prices } as never);
    expect(advice.path.filter((l) => l.method.rateBasis === 'unarmed').map((l) => `${l.fromLevel}-${l.toLevel}`)).toEqual([]);
  });
});

// The audit sweep (owner, 2026-11-24): from any start level, on a fresh or a trained account, in both modes, the plan
// reaches 99 through methods the player can use, each with a place the route can send them to, a time and no avoidable loss.
describe('every start level gets a whole plan the route can walk', () => {
  const profiles = [['f2p', 1, 0], ['f2p', 40, 5_000_000], ['members', 1, 0], ['members', 50, 50_000_000]] as const;
  const cases = profiles.flatMap(([mode, base, coins]) => (SKILL_NAMES as readonly string[])
    .filter((s) => trainingMethods.some((m) => m.kind === 'method' && m.skills.includes(s) && (mode === 'members' || !m.members)))
    .map((skill) => [mode, base, coins, skill] as const));
  it.each(cases)('%s, other skills %i, %i coins: %s', (mode, base, coins, skill) => {
    const at = (level: number) => {
      // Melee and Ranged XP brings a third as much Hitpoints XP, so a fresh account at Ranged 60 is no longer at 10 Hitpoints.
      const hp = Math.max(10, base, ['attack', 'strength', 'defence', 'ranged'].includes(skill) ? levelForXp(xpForLevel(10) + xpForLevel(level) / 3) : 0);
      const stats = Object.fromEntries(SKILL_NAMES.map((s) => [s, s === skill ? level : s === 'hitpoints' ? hp : base]));
      const state = buildPlayerState({ mode, connected: true, player: 'P', stats, progress: emptyProgress(), questsDone: base > 1 ? questCatalogue.map((q) => q.id) : [],
        owned: { bankSeen: true, items: new Map() }, gear: { equipment: [], inventory: [], coins: 0, bankCoins: coins } } as never);
      return adviseTraining({ skill, target: 99, state, mode, prices } as never);
    };
    const bad: string[] = [];
    for (let level = 1; level < 99; level += 7) {
      const advice = at(level), legs = advice.path;
      if (!advice.best) { if (!/opens at level/.test(advice.reason)) bad.push(`${level}: ${advice.reason}`); continue; }
      if (advice.time === null) bad.push(`${level}: untimed`);
      if (legs[0]?.method.id !== advice.best.method.id) bad.push(`${level}: Train ${advice.best.method.id}, plan ${legs[0]?.method.id}`);
      if (legs[0]?.fromLevel !== level || legs.at(-1)?.toLevel !== 99 || legs.some((l, i) => i > 0 && legs[i - 1].toLevel !== l.fromLevel)) bad.push(`${level}: gap`);
      bad.push(...slowerLegs(legs), ...unusableLegs(legs, mode));
      for (const l of legs) {
        if (!l.method.spot && !methodPoint(l.method.id)) bad.push(`${l.fromLevel}-${l.toLevel} ${l.method.id}: no place`);
        if (losing(l.method, mode) && !losing(at(l.fromLevel).best!.method, mode)) bad.push(`${l.fromLevel}-${l.toLevel} ${l.method.id}: avoidable loss`);
      }
    }
    expect(bad).toEqual([]);
  });
});

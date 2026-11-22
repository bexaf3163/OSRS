import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { adviseTraining, type PathLeg } from '../src/domain/training/trainingRouter';
import { buildPlayerState } from '../src/domain/player/playerState';
import { emptyProgress } from '../src/domain/persistence/progress';
import { fakePrices } from './funding/helpers';
import { questCatalogue } from '../src/domain/planning/catalogue';
import { SKILL_NAMES } from '../src/domain/training/skillTrack';

const prices = fakePrices(JSON.parse(readFileSync('tests/fixtures/gePrices.json', 'utf8')).prices);
const slowerLegs = (legs: readonly PathLeg[]) => legs.slice(1).flatMap((leg, i) => {
  const before = legs[i].method.xph, now = leg.method.xph;
  return before && now && (now[0] + now[1]) < 0.7 * (before[0] + before[1])
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
  const net = (m: PathLeg['method']) => m.marketNetPerHour
    ?? (m.costPerHour === null || (m.costPerHour === undefined && m.cost === 'cost') ? null : (m.lootPerHour ?? 0) - (m.costPerHour ?? 0));
  it.each(SKILLS)('%s', (skill) => {
    const advise = (level: number) => adviseTraining({ skill, target: 99, state: f2pState(skill, level), mode: 'f2p', prices } as never);
    const losing = advise(1).path.filter((l) => (net(l.method) ?? 0) < 0);
    const avoidable = losing.filter((l) => (net(advise(l.fromLevel).best!.method) ?? -1) >= 0).map((l) => `${l.fromLevel}-${l.toLevel} ${l.method.id}`);
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

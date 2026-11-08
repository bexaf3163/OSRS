import { describe, expect, it } from 'vitest';
import { withTeleports, type TeleportInput } from './teleportWalk';

const lumbridge = { x: 3222, y: 3218, plane: 0 };
const varrock = { x: 3212, y: 3424, plane: 0 };
const walk = (from: { x: number; y: number } | null, to: { x: number; y: number }) => {
  if (!from) return null;
  const tiles = Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y));
  return { fast: tiles / 150, typical: tiles / 100, slow: tiles / 50, source: 'test walk' };
};
const runes = [{ id: 563, name: 'Law rune', count: 5 }, { id: 556, name: 'Air rune', count: 20 }, { id: 554, name: 'Fire rune', count: 5 }];
const caster = (magic: number, carried = runes): TeleportInput => ({ levels: { magic }, carried, bankSeen: true, worn: [], standardSpellbook: true, members: false, homeCooldownSec: null });

describe('walking with the teleports the character can cast now', () => {
  it('teleports when the level and runes are there and the landing is closer', () => {
    const leg = withTeleports(walk, caster(25))(lumbridge, varrock)!;
    expect(leg.typical).toBeLessThan(walk(lumbridge, varrock)!.typical);
    expect(leg.source).toContain('then');
  });

  it('walks when the level or the runes are missing, and with no start stays UNKNOWN', () => {
    expect(withTeleports(walk, caster(24))(lumbridge, varrock)).toEqual(walk(lumbridge, varrock));
    expect(withTeleports(walk, caster(25, []))(lumbridge, varrock)).toEqual(walk(lumbridge, varrock));
    expect(withTeleports(walk, caster(25))(null, varrock)).toBeNull();
  });
});

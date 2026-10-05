import { describe, expect, it } from 'vitest';
import { parseGear, parseNavTarget, parsePacing, parsePlayer, parsePos, parseQuests, parseStats, parseXp } from '../src/services/runeliteBridge';
import { parseOwned } from '../src/lib/checklist';
import { normalizeProgress, ownedManualOf } from '../src/lib/progress';
import { allSteps as steps, known as knownData, stepById } from '../src/data';
import { wealthOf } from '../src/lib/wealth';
import { adviseStyle } from '../src/lib/styleGear';
import { adviseMoney } from '../src/lib/moneyAdvisor';
import { travelOptions } from '../src/lib/travel';

// A deterministic generator: the test is reproducible, not "fails sometimes".
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}

function junk(r: () => number, depth = 0): unknown {
  const pick = Math.floor(r() * (depth > 2 ? 9 : 12));
  switch (pick) {
    case 0: return null;
    case 1: return undefined;
    case 2: return Math.floor(r() * 2000) - 500;
    case 3: return r() < 0.5 ? NaN : Infinity;
    case 4: return '';
    case 5: return ['Attack', '__proto__', 'constructor', '  ', 'S1-01', '9'.repeat(30)][Math.floor(r() * 6)];
    case 6: return r() < 0.5;
    case 7: return -1;
    case 8: return 1e308;
    case 9: return Array.from({ length: Math.floor(r() * 4) }, () => junk(r, depth + 1));
    default: {
      const o: Record<string, unknown> = {};
      for (const k of ['id', 'name', 'count', 'x', 'y', 'plane', 'items', 'stats', 'equipment', 'inventory', 'coins', 'bankCoins', 'steps', 'levels', 'notes', 'version', 'slot', 'attack', 'magic', 'type', 'label', 'at', 'xp', 'bank', 'carried', 'noted', 'bankSeen', '__proto__']) {
        if (r() < 0.25) o[k] = junk(r, depth + 1);
      }
      return o;
    }
  }
}

const parsers: [string, (x: unknown) => unknown][] = [
  ['parseStats', parseStats], ['parseXp', parseXp], ['parseQuests', parseQuests], ['parsePos', parsePos], ['parsePlayer', parsePlayer],
  ['parseGear', parseGear], ['parsePacing', parsePacing], ['parseNavTarget', parseNavTarget], ['parseOwned', parseOwned], ['ownedManualOf', ownedManualOf],
];

describe('garbage input does not crash the program', () => {
  it('bridge event and save parsers: 3000 random values each', () => {
    const r = rng(20261003);
    for (const [name, fn] of parsers) {
      for (let i = 0; i < 3000; i++) {
        const v = junk(r);
        expect(() => fn(v), `${name}(${JSON.stringify(v)?.slice(0, 120)})`).not.toThrow();
      }
    }
  }, 30_000);

  it('normalizeProgress: any value — progress or null, but not an exception', () => {
    const r = rng(7);
    const known = knownData;
    for (let i = 0; i < 4000; i++) {
      const v = junk(r);
      let out: ReturnType<typeof normalizeProgress> | undefined;
      expect(() => { out = normalizeProgress(v, known); }).not.toThrow();
      if (out) {
        for (const lv of Object.values(out.progress.levels)) expect(Number.isFinite(lv)).toBe(true);
        for (const id of Object.keys(out.progress.steps)) expect(stepById.has(id)).toBe(true);
      }
    }
  });

  it('game-data advisors: feeding gear, levels and coins of the wrong shape', () => {
    const r = rng(99);
    for (let i = 0; i < 1500; i++) {
      const gear = parseGear(junk(r));
      const stats = parseStats(junk(r));
      const w = wealthOf(gear);
      const cash = w ? (w.cash.total ?? w.cash.bag ?? null) : null;
      expect(() => adviseStyle({
        style: r() < 0.5 ? 'magic' : 'ranged', levels: stats ?? {}, quests: new Set(), worn: new Set((gear?.equipment ?? []).map((x) => x.name)),
        bag: new Set((gear?.inventory ?? []).map((x) => x.name)), cash, price: () => (r() < 0.5 ? null : Math.floor(r() * 1e6)),
      })).not.toThrow();
      expect(() => adviseMoney(stats ?? {}, steps, new Set(), undefined, cash)).not.toThrow();
      const pos = parsePos({ x: Math.floor(r() * 5000), y: Math.floor(r() * 5000), plane: Math.floor(r() * 4) });
      if (pos) expect(() => travelOptions({ from: pos, to: { x: 3213, y: 3424, plane: 0 }, levels: stats ?? {}, carried: gear ? [...(gear.equipment ?? []), ...(gear.inventory ?? [])] : null, bankSeen: r() < 0.5 })).not.toThrow();
    }
  });
});

import { describe, expect, it } from 'vitest';
import { adviseTraining, trainingMethods, type TrainingMethod } from '../src/lib/trainingRouter';
import { buildPlayerState } from '../src/lib/playerState';
import { emptyProgress } from '../src/lib/progress';
import { xpForLevel } from '../src/lib/xp';

const method = (id: string, from: number, xph: [number, number] | null, extra: Partial<TrainingMethod> = {}): TrainingMethod => ({
  ...trainingMethods[0], id, skills: ['mining'], kind: 'method', from, to: null, xph, needs: [], members: false,
  cost: 'free', risk: 'none', effort: 'low', npcNames: [], objectNames: [], kit: undefined, manualSetup: undefined, ...extra,
});
const advice = (methods: TrainingMethod[], level: number, target: number, extra = {}) => adviseTraining({
  skill: 'mining', target, mode: 'f2p', style: 'efficient', priority: 'fastest', methods,
  state: buildPlayerState({ mode: 'f2p', stats: { mining: level }, progress: emptyProgress(), gear: null, owned: null, questsDone: [] }),
  ...extra,
});

describe('time follows the complete training path', () => {
  const methods = [method('early', 10, [1000, 2000]), method('later', 15, [10000, 20000])];
  it('sums each method instead of extrapolating the starting rate to the goal, including partial XP', () => {
    const xp = xpForLevel(12) + 50;
    const a = advice(methods, 12, 20, { xp });
    expect(a.path.map((l) => l.method.id)).toEqual(['early', 'later']);
    expect(a.time?.minHours).toBeCloseTo((xpForLevel(15) - xp) / 2000 + (xpForLevel(20) - xpForLevel(15)) / 20000);
    expect(a.time?.maxHours).toBeCloseTo((xpForLevel(15) - xp) / 1000 + (xpForLevel(20) - xpForLevel(15)) / 10000);
  });
  it('does not apply the current measured pace to a different future method', () => {
    const a = advice(methods, 12, 20, { measuredXph: 3000 });
    expect(a.time?.source).toBe('forecast');
    expect(a.time?.minHours).toBeCloseTo((xpForLevel(15) - xpForLevel(12)) / 3000 + (xpForLevel(20) - xpForLevel(15)) / 20000);
  });
  it('does not attribute the followed method measurement to another recommended method', () => {
    const a = advice(methods, 15, 20, { measuredXph: 1, followed: 'early' });
    expect(a.time?.source).toBe('wiki');
    expect(a.time?.minHours).toBeCloseTo((xpForLevel(20) - xpForLevel(15)) / 20000);
  });
  it('retains the complete internal path beyond a compact display preview', () => {
    const ms = Array.from({ length: 8 }, (_, i) => method(`phase-${i}`, 10 + i, [1000 * (i + 1), 1000 * (i + 1)]));
    const a = advice(ms, 10, 18);
    expect(a.path).toHaveLength(8);
    const hours = ms.reduce((total, _m, i) => total + (xpForLevel(11 + i) - xpForLevel(10 + i)) / (1000 * (i + 1)), 0);
    expect(a.time?.maxHours).toBeCloseTo(hours);
  });
  it('does not claim a total when a later chosen method has no known rate', () => {
    const ms = [method('early', 10, [1000, 1000], { risk: 'low' }), method('unknown', 15, null)];
    const a = advice(ms, 12, 20, { priority: 'relaxed', style: 'chill' });
    expect(a.path.map((l) => l.method.id)).toEqual(['early', 'unknown']);
    expect(a.time).toBeNull();
  });
  it('does not recommend a tool on savings from XP assigned to another method', () => {
    const ms = [method('early', 10, [1000, 1000], { upgrades: [{ tool: 'Better tool', price: 10, xph: [2000, 2000] }] }), method('later', 15, [10000, 10000])];
    const a = advice(ms, 14, 80);
    expect(a.actionTarget).toBe(15);
    expect(a.upgrade).toBeNull();
  });
});

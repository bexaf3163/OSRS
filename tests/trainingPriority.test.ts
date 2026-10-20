// How training methods are chosen by default (2.69): "balanced" - the practical time to the goal, counting the setup of missing items, attention and
// material cost - instead of the old "Calm" default that put AFK methods first. An explicit "Efficient" from an older save stays as "Fastest".

import { describe, expect, it } from 'vitest';
import { adviseTraining, practicalRate, SETUP_HOURS, type TrainingMethod } from '../src/lib/trainingRouter';
import { buildPlayerState } from '../src/lib/playerState';
import { priorityOf } from '../src/lib/playStyle';
import { DEFAULT_FEATURES, parseFeatures } from '../src/lib/features';
import { xpForLevel } from '../src/lib/xp';
import type { OwnedState } from '../src/lib/checklist';

const progress = { version: 3, steps: {}, levels: {}, notes: {}, updatedAt: '' };
const stateAt = (skill: string, level: number, owned: OwnedState | null = null) =>
  buildPlayerState({ mode: 'f2p', stats: null, progress: { ...progress, levels: { [skill]: level } }, owned, gear: null, questsDone: null, player: null, connected: owned !== null });
const method = (o: Partial<TrainingMethod> & { id: string }): TrainingMethod => ({
  skills: ['fishing'], from: 1, to: null, name: o.id, members: false, needs: [], xph: [10_000, 10_000], xpa: null, act: null, effort: 'low', cost: 'free', risk: 'none',
  where: 'somewhere', url: 'https://oldschool.runescape.wiki/', kind: 'method', xpTotal: null, ...o,
});
// The game reports only the items it is asked to watch: a rod it was asked about and found nowhere is MISSING; one it never reported is unknown.
const emptyBank: OwnedState = { bankSeen: true, items: new Map([['fly fishing rod', { name: 'Fly fishing rod', carried: 0, noted: 0, bank: 0 }]]) };

describe('the preference', () => {
  it('a save that never chose gets "balanced"; an explicit "Efficient" stays as "fastest"; "relaxed" is its own choice', () => {
    expect(priorityOf(DEFAULT_FEATURES)).toBe('balanced');
    expect(priorityOf(parseFeatures(JSON.stringify({ efficient: false, inspector: true })))).toBe('balanced');
    expect(priorityOf(parseFeatures(JSON.stringify({ efficient: true })))).toBe('fastest');
    expect(priorityOf(parseFeatures(JSON.stringify({ relaxedTraining: true })))).toBe('relaxed');
  });
});

describe('balanced, on the real catalogue', () => {
  it('Magic 30 (F2P): balanced and fastest pick alching; only relaxed keeps the slow AFK splashing first', () => {
    const at = (priority: 'balanced' | 'fastest' | 'relaxed') => adviseTraining({ skill: 'magic', target: 40, state: stateAt('magic', 30), mode: 'f2p', style: 'chill', priority }).best?.method.id;
    expect(at('balanced')).toBe('ma-alch');
    expect(at('fastest')).toBe('ma-alch');
    expect(at('relaxed')).toBe('ma-splash');
  });

  it('a high-attention method is not the default when a calmer one is about as fast: Magic 1 splashes rather than strikes', () => {
    const r = adviseTraining({ skill: 'magic', target: 10, state: stateAt('magic', 1), mode: 'f2p', style: 'chill', priority: 'balanced' });
    expect(r.best?.method.effort).not.toBe('high');
    expect(r.reason).toMatch(/clicks|attention/);
  });

  it('every skill and level gets an answer from the same catalogue, never a locked method as the best', () => {
    for (const skill of ['woodcutting', 'fishing', 'mining', 'cooking', 'firemaking', 'smithing', 'crafting', 'magic', 'prayer', 'runecraft']) {
      for (const level of [1, 15, 30, 45]) {
        const r = adviseTraining({ skill, target: level + 10, state: stateAt(skill, level), mode: 'f2p', style: 'chill', priority: 'balanced' });
        if (r.best) expect(r.best.status, `${skill} ${level}`).not.toBe('LOCKED');
      }
    }
  });
});

describe('balanced counts the setup and does not switch for a sliver', () => {
  const ready = method({ id: 'ready-slow', xph: [10_000, 10_000] });
  const better = method({ id: 'needs-a-rod', xph: [30_000, 30_000], needs: [{ type: 'item', name: 'Fly fishing rod' }] });

  it('a long goal pays for getting a missing tool: the faster method wins once the bank shows the tool is missing', () => {
    const r = adviseTraining({ skill: 'fishing', target: 40, state: stateAt('fishing', 20, emptyBank), mode: 'f2p', style: 'chill', priority: 'balanced', methods: [ready, better] });
    expect(r.best?.method.id).toBe('needs-a-rod');
    expect(r.best?.status).toBe('PREP');
    // Relaxed (the old Calm) always kept the ready one first.
    expect(adviseTraining({ skill: 'fishing', target: 40, state: stateAt('fishing', 20, emptyBank), mode: 'f2p', style: 'chill', priority: 'relaxed', methods: [ready, better] }).best?.method.id).toBe('ready-slow');
  });

  it('a very short goal does not: the setup costs more than the few minutes it would save', () => {
    const xp = xpForLevel(21) - 300;
    const r = adviseTraining({ skill: 'fishing', target: 21, state: stateAt('fishing', 20, emptyBank), mode: 'f2p', style: 'chill', priority: 'balanced', methods: [ready, better], xp });
    const hoursReady = 300 / practicalRate(ready)!;
    const hoursBetter = 300 / practicalRate(better)! + SETUP_HOURS;
    expect(hoursReady).toBeLessThan(hoursBetter);
    expect(r.best?.method.id).toBe('ready-slow');
  });

  it('the path keeps the method in hand when a new unlock is barely better, and switches when it is clearly better', () => {
    const base = method({ id: 'base', xph: [10_000, 10_000] });
    const sliver = method({ id: 'sliver', from: 20, xph: [10_500, 10_500] });
    const leap = method({ id: 'leap', from: 30, xph: [25_000, 25_000] });
    const path = adviseTraining({ skill: 'fishing', target: 40, state: stateAt('fishing', 10), mode: 'f2p', style: 'chill', priority: 'balanced', methods: [base, sliver, leap] }).path;
    expect(path.map((l) => l.method.id)).toEqual(['base', 'leap']);
    const fastest = adviseTraining({ skill: 'fishing', target: 40, state: stateAt('fishing', 10), mode: 'f2p', style: 'efficient', priority: 'fastest', methods: [base, sliver, leap] }).path;
    expect(fastest.map((l) => l.method.id)).toEqual(['base', 'sliver', 'leap']);
  });
});

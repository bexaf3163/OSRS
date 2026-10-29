// How training methods are chosen by default (2.69): "balanced" - the practical time to the goal, counting the setup of missing items, attention and
// material cost - instead of the old "Calm" default that put AFK methods first. An explicit "Efficient" from an older save stays as "Fastest".

import { describe, expect, it } from 'vitest';
import { adviseTraining, BANK_SETUP_HOURS, practicalRate, SETUP_HOURS, type TrainingMethod } from '../src/lib/trainingRouter';
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
  it('Magic 30 does not auto-select unverified alchemy targets or splash equipment', () => {
    const at = (priority: 'balanced' | 'fastest' | 'relaxed') => adviseTraining({ skill: 'magic', target: 40, state: stateAt('magic', 30), mode: 'f2p', style: 'chill', priority }).best?.method.id;
    expect(at('balanced')).toBe('ma-strike');
    expect(at('fastest')).toBe('ma-strike');
    expect(at('relaxed')).toBe('ma-strike');
  });

  it('an unchecked splash setup remains a manual alternative instead of an automatic beginner default', () => {
    const r = adviseTraining({ skill: 'magic', target: 10, state: stateAt('magic', 1), mode: 'f2p', style: 'chill', priority: 'balanced' });
    expect(r.best?.method.id).toBe('ma-strike');
    const splash = r.others.find(v => v.method.id === 'ma-splash')!;
    expect(splash.status).toBe('PREP');
    expect(splash.unchecked.some(n => n.state === 'UNKNOWN' && /-64/.test(n.label))).toBe(true);
    expect(r.path.every(l => !l.method.manualSetup)).toBe(true);
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
  it('a suggested upper bracket does not lock an unlocked faster method or truncate its action goal', () => {
    const older = method({ id: 'still-useful', from: 20, to: 40, xph: [30_000, 35_000], xpa: 50, act: 'catch|catches' });
    const later = method({ id: 'newer-slower', from: 40, xph: [12_000, 15_000], xpa: 80 });
    const r = adviseTraining({ skill: 'fishing', target: 55, state: stateAt('fishing', 50), mode: 'f2p', style: 'chill', priority: 'balanced', methods: [older, later] });
    expect(r.best?.method.id).toBe('still-useful');
    expect(r.path.map(l => [l.method.id, l.fromLevel, l.toLevel])).toEqual([['still-useful', 50, 55]]);
    expect(r.actionsLeft).toBe(Math.ceil((xpForLevel(55) - xpForLevel(50)) / 50));
    expect(r.actionTarget).toBe(55);
  });

  it('retaining an older bracket does not bypass entry, mode or known quest requirements', () => {
    const available = method({ id: 'fallback', xph: [1_000, 1_000] });
    const gated = [
      method({ id: 'future', from: 60, xph: [100_000, 100_000] }),
      method({ id: 'members', from: 20, to: 40, members: true, xph: [100_000, 100_000] }),
      method({ id: 'quest', from: 20, to: 40, needs: [{ type: 'quest', quest: 'Swan Song' }], xph: [100_000, 100_000] }),
    ];
    const state = { ...stateAt('fishing', 50), quests: { known: true as const, source: 'game' as const, value: [] } };
    const r = adviseTraining({ skill: 'fishing', target: 55, state, mode: 'f2p', style: 'efficient', methods: [available, ...gated] });
    expect(r.best?.method.id).toBe('fallback');
    expect(r.path.every(l => l.method.id === 'fallback')).toBe(true);
    expect(r.others.find(v => v.method.id === 'quest')?.status).toBe('LOCKED');
    expect(r.others.some(v => ['members', 'future'].includes(v.method.id))).toBe(false);
  });

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

  it('supplies in the bank beat supplies to buy at the same speed: a bank stop (BANK_SETUP_HOURS) is shorter than buying', () => {
    const bank: OwnedState = { bankSeen: true, items: new Map([
      ['raw trout', { name: 'Raw trout', carried: 0, noted: 0, bank: 5000 }], ['raw pike', { name: 'Raw pike', carried: 0, noted: 0, bank: 0 }],
    ]) };
    const banked = method({ id: 'banked', xph: [20_000, 20_000], needs: [{ type: 'item', name: 'Raw trout', count: 26 }] });
    const bought = method({ id: 'bought', xph: [20_500, 20_500], needs: [{ type: 'item', name: 'Raw pike', count: 26 }] });
    const r = adviseTraining({ skill: 'fishing', target: 40, state: stateAt('fishing', 20, bank), mode: 'f2p', style: 'chill', priority: 'balanced', methods: [bought, banked] });
    expect(r.best?.method.id).toBe('banked');
    // A clearly faster method still wins: the detour is a fixed cost, not a ban.
    const faster = method({ id: 'bought', xph: [40_000, 40_000], needs: [{ type: 'item', name: 'Raw pike', count: 26 }] });
    expect(adviseTraining({ skill: 'fishing', target: 40, state: stateAt('fishing', 20, bank), mode: 'f2p', style: 'chill', priority: 'balanced', methods: [faster, banked] }).best?.method.id).toBe('bought');
    expect(BANK_SETUP_HOURS).toBeLessThan(SETUP_HOURS);
  });

  it('supplies confirmed in the bank rank with the ready methods for any method, not only the ranged kit', () => {
    const bank: OwnedState = { bankSeen: true, items: new Map([['raw trout', { name: 'Raw trout', carried: 0, noted: 0, bank: 500 }]]) };
    const banked = method({ id: 'banked-afk', effort: 'afk', needs: [{ type: 'item', name: 'Raw trout', count: 26 }] });
    const ready = method({ id: 'ready-busy', effort: 'medium' });
    // Relaxed ranks by status first, then effort: the banked supplies do not push the quieter method behind.
    const r = adviseTraining({ skill: 'fishing', target: 40, state: stateAt('fishing', 20, bank), mode: 'f2p', style: 'chill', priority: 'relaxed', methods: [ready, banked] });
    expect(r.best?.method.id).toBe('banked-afk');
  });

  it('the path keeps the method in hand when a new unlock is barely better, and switches when it is clearly better', () => {
    const base = method({ id: 'base', xph: [10_000, 10_000] });
    const sliver = method({ id: 'sliver', from: 20, xph: [10_500, 10_500] });
    const leap = method({ id: 'leap', from: 30, xph: [25_000, 25_000] });
    const path = adviseTraining({ skill: 'fishing', target: 40, state: stateAt('fishing', 10), mode: 'f2p', style: 'chill', priority: 'balanced', methods: [base, sliver, leap] }).path;
    expect(path.filter((l, i) => i === 0 || l.method.id !== path[i - 1].method.id).map(l => l.method.id)).toEqual(['base', 'leap']);
    expect(path.find(l => l.method.id === 'leap')?.fromLevel).toBe(30);
    const fastest = adviseTraining({ skill: 'fishing', target: 40, state: stateAt('fishing', 10), mode: 'f2p', style: 'efficient', priority: 'fastest', methods: [base, sliver, leap] }).path;
    expect(fastest.map((l) => l.method.id)).toEqual(['base', 'sliver', 'leap']);
  });
});

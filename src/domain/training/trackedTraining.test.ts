import { describe, expect, it } from 'vitest';
import { cashFlow, f2pCheckpoints, membersCheckpoints, nextAfterReached, trackedTraining, trainingEarners, type SkillCheckpoint } from './trackedTraining';
import { fakePrices } from '../../../tests/funding/helpers';
import { readFileSync } from 'node:fs';
import { F2P_SKILL_ADVICE } from './f2pSkillAdvice';
import { buildPlayerState } from '../player/playerState';
import { emptyProgress } from '../persistence/progress';
import { RANGED_WATCH } from '../combat/rangedLoadout';
import { buildEnvelope, EMPTY_PARTS, envelopeKey } from '../prep/prepEnvelope';
import { toInGameTarget } from '../guide/inGameTarget';
import { parseTracked, trackedTrainingContext } from './skillTrack';
import { createReadinessEngine } from '../readiness/readinessEngine';
import { emptyPrep, rearmReadyDetours, startDetour } from '../prep/prepRoute';
import type { PriceView } from '../market/quotes';
import { retiredStep } from '../../../tests/fixtures/retiredSteps';

const state = (ranged?: number) => buildPlayerState({ mode: 'f2p', connected: true,
  stats: { ...(ranged === undefined ? {} : { ranged }), defence: 33, hitpoints: 31 }, progress: emptyProgress(), questsDone: [],
  gear: { equipment: [], inventory: [], coins: 10000, bankCoins: 0 },
  owned: { bankSeen: true, items: new Map([...RANGED_WATCH, 'Salmon', 'Tuna', 'Lobster', 'Swordfish'].map(name => [name.toLowerCase(), { name, carried: 0, noted: 0, bank: 0 }])) } });
const plan = (ranged?: number) => trackedTraining({ skill: 'ranged', mode: 'fast', freeOnly: true }, state(ranged), 'f2p');

describe('followed account scope and usable tools', () => {
  const member = () => buildPlayerState({ mode: 'members', connected: true, stats: { woodcutting: 61, attack: 1 },
    progress: emptyProgress(), questsDone: [], gear: { equipment: [], inventory: [], coins: 0, bankCoins: 0 },
    owned: { bankSeen: true, items: new Map(['Rune axe', 'Dragon axe'].map(name => [name.toLowerCase(), { name, carried: 0, noted: 0, bank: 1 }])) } });
  it('a free-only followed plan excludes Members tools even on a Members profile', () => {
    const observed = member(), before = structuredClone(observed);
    const followed = trackedTraining({ skill: 'woodcutting', mode: 'fast', freeOnly: true, target: 65 }, observed, 'members')!;
    expect(followed.step.itemsRequired).toContainEqual(expect.objectContaining({ nameEn: 'Rune axe' }));
    expect(followed.step.itemsRequired).not.toContainEqual(expect.objectContaining({ nameEn: 'Dragon axe' }));
    expect(observed).toEqual(before);
  });
  it('a Members plan names the modelled Dragon tool and carries it without Attack60', () => {
    const followed = trackedTraining({ skill: 'woodcutting', mode: 'fast', target: 65 }, member(), 'members')!;
    expect(followed.step.itemsRequired).toContainEqual(expect.objectContaining({ nameEn: 'Dragon axe' }));
    expect(followed.step.itemsRequired?.find(item => item.nameEn === 'Dragon axe')?.equip).not.toBe(true);
  });
  it('scope is local to the followed skill and cannot promote an actually free context to Members', () => {
    const observed = member();
    expect(trackedTrainingContext({ skill: 'fishing', mode: 'f2p' }, 'woodcutting', observed, 'members').state).toBe(observed);
    expect(trackedTrainingContext({ skill: 'woodcutting', mode: 'f2p' }, 'woodcutting', observed, 'members').mode).toBe('f2p');
    const free = { ...observed, mode: 'f2p' as const };
    expect(trackedTrainingContext(null, 'woodcutting', free, 'members')).toEqual({ mode: 'f2p', state: free });
  });
});

describe('followed skills use the shared staged route', () => {
  it('migrates an older followed Ranged setting to the F2P checkpoint, with a current leg instead of starter mobs to40', () => {
    const starter = plan(1)!;
    expect(starter.target).toBe(40);
    expect(starter.step.how).not.toMatch(/Train ranged to 40:/);
    expect(starter.step.how).toMatch(/Train ranged to \d+:/);
    expect(starter.step.itemsRequired!.some(i => i.nameEn.toLowerCase().endsWith('shortbow'))).toBe(true);
    const next = plan(20)!;
    expect(next.step.inGame!.npcNames).not.toContain('Seagull');
    expect(next.step.itemsRequired!.some(i => i.nameEn === 'Willow shortbow')).toBe(true);
    expect(plan(30)!.step.itemsRequired!.some(i => i.nameEn === 'Maple shortbow')).toBe(true);
    expect(plan(40)!.complete).toBe(true);
  });
  it('does not infer a starter level or a destination while the real level is unread', () => {
    const unread = plan()!;
    expect(unread.complete).toBe(false);
    expect(unread.step.mapLocation).toBeUndefined();
    expect(unread.step.how).toContain('Check your ranged level');
    expect(unread.step.requirements).toContainEqual({ type: 'skill', skill: 'ranged', min: 1 });
  });
  it('does not turn passive/prefer-members guidance into a forced99 grind; explicit targets survive reload', () => {
    expect(trackedTraining({ skill: 'runecraft', mode: 'fast' }, state(1), 'f2p')).toBeNull();
    expect(parseTracked({ skill: 'ranged', mode: 'fast', target: 50 })?.target).toBe(50);
    expect(parseTracked({ skill: 'ranged', mode: 'fast', target: NaN })).toBeNull();
    expect(parseTracked({ skill: 'ranged', mode: 'fast', target: 100 })).toBeNull();
  });
  it('overrides the wire step without overwriting the quest; unknown training can suppress the quest and stopping restores it', () => {
    const quest = toInGameTarget(retiredStep('S6-04')!)!;
    const training = toInGameTarget(plan(20)!.step)!;
    expect(training.stepId).toMatch(/^S0-\d{2}$/);
    const original = { ...EMPTY_PARTS, step: quest };
    const followed = { ...original, trainingStep: training };
    expect(buildEnvelope(followed, 1).step).toEqual({ ...training, completionTrigger: undefined });
    expect(original.step).toEqual(quest);
    expect(envelopeKey(followed)).not.toEqual(envelopeKey(original));
    expect(buildEnvelope({ ...followed, trainingStep: undefined }, 2).step).toEqual(quest);
    expect(buildEnvelope({ ...followed, trainingStep: null }, 3).step).toBeNull();
  });
  it('a new milestone cannot inherit the previous kit purchase completion', () => {
    const queue = (level: number) => {
      const st = state(level), step = plan(level)!.step;
      return createReadinessEngine({ state: st, mode: 'f2p', steps: [step], progress: emptyProgress(), qp: 200 }).queue(step);
    };
    const old = queue(1), next = queue(20);
    const before = old.tasks.find(t => t.kind === 'buy')!, after = next.tasks.find(t => t.kind === 'buy')!;
    expect(before.id).not.toBe(after.id);
    expect(startDetour({ stack: [], done: [`${old.stepId}:${before.id}`] }, { sourceStepId: next.stepId, detourId: after.id,
      reason: after.label, returnCondition: 'Ready', startedAt: 1 }).ok).toBe(true);
  });
  it('observed readiness rearms a later refill, while unread readiness preserves its loop guard', () => {
    const frame = { sourceStepId: 'S0-04', detourId: 'bank@kit', reason: 'Withdraw food', returnCondition: 'Food carried', startedAt: 1 };
    const spent = { ...emptyPrep(), done: ['S0-04:bank@kit', 'S1-01:bank'] };
    expect(rearmReadyDetours(spent, new Set())).toBe(spent);
    const ready = rearmReadyDetours(spent, new Set(['S0-04']));
    expect(ready.done).toEqual(['S1-01:bank']);
    expect(startDetour(ready, frame).ok).toBe(true);
    expect(startDetour(spent, frame).ok).toBe(false);
  });
  it('gathering reuses tool progression and promotes a worthwhile usable upgrade into preparation without an Attack requirement', () => {
    const st = buildPlayerState({ mode: 'f2p', connected: true, stats: { woodcutting: 21, attack: 1, defence: 33, hitpoints: 31 },
      progress: emptyProgress(), questsDone: [], gear: { equipment: [], inventory: [], coins: 10000, bankCoins: 0 },
      owned: { bankSeen: true, items: new Map(['Bronze axe', 'Iron axe', 'Steel axe', 'Mithril axe', 'Adamant axe', 'Rune axe'].map(name => [name.toLowerCase(), { name, carried: name === 'Bronze axe' ? 1 : 0, noted: 0, bank: 0 }])) } });
    const quote = { price: 1, basis: 'side' as const, confidence: 'HIGH' as const, ageMinutes: 0, volumePerHour: null, notes: [] };
    const prices: PriceView = { status: 'live', at: 1, idOf: () => undefined, limitOf: () => undefined, buy: () => quote, sell: () => quote };
    const upgrade = trackedTraining({ skill: 'woodcutting', mode: 'fast' }, st, 'f2p', { prices })!;
    expect(upgrade.target).toBe(36);
    expect(upgrade.step.itemsRequired!.some(i => i.nameEn === 'Mithril axe' && !i.equip)).toBe(true);
    expect(upgrade.step.how).not.toContain('to 36:');
    expect(upgrade.step.requirements).not.toContainEqual(expect.objectContaining({ skill: 'attack' }));
  });
});

describe('after the F2P quests: what to train next', () => {
  const character = (levels: Record<string, number>) => buildPlayerState({ mode: 'f2p', connected: true, progress: emptyProgress(), questsDone: [],
    stats: { attack: 40, strength: 44, defence: 44, hitpoints: 43, ranged: 40, prayer: 8, magic: 25, woodcutting: 31, firemaking: 30, fishing: 32, cooking: 30,
      mining: 18, smithing: 29, crafting: 9, runecraft: 1, ...levels },
    gear: { equipment: [], inventory: [{ id: 1353, name: 'Steel axe', count: 1 }], coins: 10000, bankCoins: 0 }, owned: { bankSeen: true, items: new Map() } });
  it('lists only unfinished good or optional checkpoints, in the phase order the owner set; reached and members skills are left out', () => {
    const rows = f2pCheckpoints(character({}));
    expect(rows.length).toBeGreaterThan(3);
    for (const row of rows) {
      expect(['good', 'optional']).toContain(F2P_SKILL_ADVICE[row.skill]!.priority);
      expect(row.level).toBeLessThan(row.target);
    }
    for (const s of ['runecraft', 'attack', 'defence']) expect(rows.map(r => r.skill)).not.toContain(s);
    // The owner's phases: earn coins, then combat and gathering, then the skills that spend coins. Strength and Ranged are already at 40.
    expect(rows.map(r => r.skill)).toEqual(['crafting', 'smithing', 'magic', 'woodcutting', 'fishing', 'mining', 'firemaking', 'prayer', 'cooking']);
    expect(rows.map(r => r.phase)).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3]);
    // Reaching a checkpoint removes it.
    expect(f2pCheckpoints(character({ fishing: 58 })).some(r => r.skill === 'fishing')).toBe(false);
  });
});

describe('the coin ledger and the Members earn-then-spend order', () => {
  const row = (skill: string, coins: [number, number] | null) => ({ skill, level: 1, target: 10, priority: 'good', phase: 0, method: null, time: null, coins }) as SkillCheckpoint;
  it('carries the coins at hand down the list by each worst case; unknown coins add nothing', () => {
    expect(cashFlow([row('mining', [5000, 9000]), row('prayer', [-20000, -15000]), row('magic', null)], 10000)).toEqual([15000, -5000, -5000]);
  });
  it('lists the quest levels that earn coins before the ones that spend them', () => {
    const prices = fakePrices(JSON.parse(readFileSync('tests/fixtures/gePrices.json', 'utf8')).prices);
    const st = buildPlayerState({ mode: 'members', connected: true, stats: { attack: 40, strength: 40, defence: 40, hitpoints: 40, prayer: 1, mining: 1 },
      progress: emptyProgress(), questsDone: [], gear: { equipment: [], inventory: [], coins: 0, bankCoins: 5_000_000 }, owned: { bankSeen: true, items: new Map() } });
    const rows = membersCheckpoints(st, new Map([['prayer', 43], ['mining', 30]]), { prices });
    expect(rows.map((r) => r.skill)).toEqual(['mining', 'prayer']);
    expect(rows[0].coins![0]).toBeGreaterThanOrEqual(0);
    expect(rows[1].coins![0]).toBeLessThan(0);
  });
});

describe('training methods that earn coins, for the Money page', () => {
  it('lists only methods open in the mode that earn, most coins an hour first', () => {
    const prices = fakePrices(JSON.parse(readFileSync('tests/fixtures/gePrices.json', 'utf8')).prices);
    const stats = { attack: 40, strength: 40, defence: 40, hitpoints: 40, ranged: 40, magic: 40, prayer: 40, crafting: 40, smithing: 40, cooking: 40, fishing: 40, mining: 40 };
    const st = buildPlayerState({ mode: 'f2p', connected: true, stats, progress: emptyProgress(), questsDone: [],
      gear: { equipment: [], inventory: [], coins: 0, bankCoins: 5_000_000 }, owned: { bankSeen: true, items: new Map() } });
    const rows = trainingEarners(st, { prices });
    expect(rows.length).toBeGreaterThan(2);
    expect(rows.every((r) => r.net > 0 && !r.method.members)).toBe(true);
    expect(rows.map((r) => r.net)).toEqual(rows.map((r) => r.net).sort((a, b) => b - a));
  });
});

describe('a reached followed goal hands over', () => {
  const rows = [{ skill: 'fishing', level: 35, target: 35, priority: 'good', phase: 2, method: null, time: null },
    { skill: 'cooking', level: 20, target: 40, priority: 'good', phase: 3, method: null, time: null }] as const;
  it('after the route a free-only checkpoint goes on to the next one; otherwise the route takes over', () => {
    const fishing = { skill: 'fishing', mode: 'fast', freeOnly: true, target: 35 } as const;
    expect(nextAfterReached(fishing, rows, false)).toEqual({ skill: 'cooking', mode: 'fast', freeOnly: true, target: 40 });
    expect(nextAfterReached(fishing, rows, true)).toBeNull();
    expect(nextAfterReached({ ...fishing, freeOnly: false }, rows, false)).toBeNull();
    expect(nextAfterReached(fishing, rows.slice(0, 1), false)).toBeNull();
  });
});

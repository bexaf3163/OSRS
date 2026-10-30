import { describe, expect, it } from 'vitest';
import { trackedTraining } from '../src/lib/trackedTraining';
import { buildPlayerState } from '../src/lib/playerState';
import { emptyProgress } from '../src/lib/progress';
import { RANGED_WATCH } from '../src/lib/rangedLoadout';
import { buildEnvelope, EMPTY_PARTS, envelopeKey } from '../src/lib/prepEnvelope';
import { toInGameTarget } from '../src/services/runeliteBridge';
import { stepById } from '../src/data';
import { parseTracked, trackedTrainingContext } from '../src/lib/skillTrack';
import { createReadinessEngine } from '../src/lib/readinessEngine';
import { emptyPrep, rearmReadyDetours, startDetour } from '../src/lib/prepRoute';
import type { PriceView } from '../src/lib/funding/quotes';

const state = (ranged?: number) => buildPlayerState({ mode: 'f2p', connected: true,
  stats: { ...(ranged === undefined ? {} : { ranged }), defence: 33, hitpoints: 31 }, progress: emptyProgress(), questsDone: [],
  gear: { equipment: [], inventory: [], coins: 10000, bankCoins: 0 },
  owned: { bankSeen: true, items: new Map([...RANGED_WATCH, 'Salmon', 'Tuna', 'Lobster', 'Swordfish'].map(name => [name.toLowerCase(), { name, carried: 0, noted: 0, bank: 0 }])) } });
const plan = (ranged?: number) => trackedTraining({ skill: 'ranged', mode: 'fast', freeOnly: true }, state(ranged), 'f2p', 'chill', 'balanced');

describe('followed account scope and usable tools', () => {
  const member = () => buildPlayerState({ mode: 'members', connected: true, stats: { woodcutting: 61, attack: 1 },
    progress: emptyProgress(), questsDone: [], gear: { equipment: [], inventory: [], coins: 0, bankCoins: 0 },
    owned: { bankSeen: true, items: new Map(['Rune axe', 'Dragon axe'].map(name => [name.toLowerCase(), { name, carried: 0, noted: 0, bank: 1 }])) } });
  it('a free-only followed plan excludes Members tools even on a Members profile', () => {
    const observed = member(), before = structuredClone(observed);
    const followed = trackedTraining({ skill: 'woodcutting', mode: 'fast', freeOnly: true, target: 65 }, observed, 'members', 'efficient', 'fastest')!;
    expect(followed.step.itemsRequired).toContainEqual(expect.objectContaining({ nameEn: 'Rune axe' }));
    expect(followed.step.itemsRequired).not.toContainEqual(expect.objectContaining({ nameEn: 'Dragon axe' }));
    expect(observed).toEqual(before);
  });
  it('a Members plan names the modelled Dragon tool and carries it without Attack60', () => {
    const followed = trackedTraining({ skill: 'woodcutting', mode: 'fast', target: 65 }, member(), 'members', 'efficient', 'fastest')!;
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
    expect(trackedTraining({ skill: 'prayer', mode: 'fast' }, state(1), 'f2p', 'chill', 'balanced')).toBeNull();
    expect(parseTracked({ skill: 'ranged', mode: 'fast', target: 50 })?.target).toBe(50);
    expect(parseTracked({ skill: 'ranged', mode: 'fast', target: NaN })).toBeNull();
    expect(parseTracked({ skill: 'ranged', mode: 'fast', target: 100 })).toBeNull();
  });
  it('overrides the wire step without overwriting the quest; unknown training can suppress the quest and stopping restores it', () => {
    const quest = toInGameTarget(stepById.get('S6-01')!)!;
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
      return createReadinessEngine({ state: st, mode: 'f2p', steps: [step], progress: emptyProgress(), qp: 200 }).queue(step, 'chill');
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
    const upgrade = trackedTraining({ skill: 'woodcutting', mode: 'fast' }, st, 'f2p', 'efficient', 'fastest', { prices })!;
    expect(upgrade.target).toBe(36);
    expect(upgrade.step.itemsRequired!.some(i => i.nameEn === 'Mithril axe' && !i.equip)).toBe(true);
    expect(upgrade.step.how).not.toContain('to 36:');
    expect(upgrade.step.requirements).not.toContainEqual(expect.objectContaining({ skill: 'attack' }));
  });
});

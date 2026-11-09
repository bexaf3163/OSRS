import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allSteps } from '../../data';
import { buildPrepPlan, type PrepPlan } from './prepPlan';
import { buildPlayerState } from '../player/playerState';
import { planOneTrip } from './oneTrip';
import { readinessOf } from '../readiness/readiness';
import { emptyProgress } from '../persistence/progress';
import type { OwnedItem, OwnedState } from '../items/checklist';
import { nameKey } from '../items/itemKey';
import type { Recovery } from '../travel/recovery';
import { buildEnvelope, envelopeKey, MAX_PLAN_LINES, nextSeq, planPayload, EMPTY_PARTS, SNAPSHOT_VERSION, type SnapshotParts } from './prepEnvelope';
import { clipText } from '../text/format';
import { postPrepPlan, snapshotAccepted, supportsSnapshot, APP_PROTOCOL, BRIDGE_PATHS, missingWithPlugin } from '../../services/runeliteBridge';
import { toInGameTarget } from '../guide/inGameTarget';
import { fundingHintPayload } from '../economy/fundingHint';
import { startPlan, tick, viewOf } from '../economy/funding/plan';
import { methodById } from '../economy/funding/methods';
import { market } from '../../../tests/funding/market';
import { scenario } from '../../../tests/funding/scenario';
import { fakeSnap } from '../../../tests/funding/helpers';
import { routeWith, stepOrRetired } from '../../../tests/fixtures/retiredSteps';

const FILE = new URL('../../../runelite-bridge/src/test/resources/prep-snapshots.json', import.meta.url);

function owned(items: Record<string, Partial<OwnedItem>>, bankSeen = true): OwnedState {
  const map = new Map<string, OwnedItem>();
  for (const [name, o] of Object.entries(items)) map.set(nameKey(name), { name, carried: 0, noted: 0, ...o });
  return { bankSeen, items: map };
}

function planOf(stepId: string, have: Record<string, Partial<OwnedItem>>, extra: { recovery?: Recovery | null; slots?: number } = {}): PrepPlan {
  const state = buildPlayerState({
    mode: 'f2p', stats: { attack: 30, strength: 30, defence: 30 }, progress: { levels: {} }, owned: owned(have),
    gear: { equipment: [], inventory: [], coins: 40, bankCoins: 100, ...(extra.slots !== undefined ? { inventorySlots: extra.slots } : {}) },
    questsDone: null, connected: true,
  });
  const step = stepOrRetired(stepId), steps = routeWith(stepId);
  const progress = emptyProgress();
  return buildPrepPlan({
    step, steps, progress, state, trip: planOneTrip(steps, progress, step.id, state),
    readiness: readinessOf(step, { steps, progress, qp: 0, mode: 'f2p', state }), recovery: extra.recovery ?? null,
  });
}

const DEATH: Recovery = { reason: 'DEATH', since: 1, landedAt: { x: 3222, y: 3218, plane: 0 }, diedAt: null, distance: 120, target: { x: 3000, y: 3145, plane: 0 } };

describe('the state snapshot for the game (protocol 6)', () => {
  it('names the committed Decision only when there is one', () => {
    expect(buildEnvelope({ ...EMPTY_PARTS, decision: { id: 'a1', objectiveId: 'q1' } }, 1).decision).toEqual({ id: 'a1', objectiveId: 'q1' });
    expect('decision' in buildEnvelope({ ...EMPTY_PARTS, decision: null }, 2)).toBe(false);
  });

  it('does not acknowledge stale or partially rejected snapshots merely because the HTTP request succeeded', async () => {
    const envelope = buildEnvelope(EMPTY_PARTS, 1);
    const send = (data: unknown, status = 200) => postPrepPlan(envelope, {
      request: async () => ({ ok: status === 200, status, data }), openEvents: () => () => {},
    });
    expect(await send({ stale: false, rejected: {} })).toMatchObject({ ok: true, stale: false });
    const stale = await send({ stale: true, rejected: {} });
    expect(snapshotAccepted(stale, ['step'])).toBe(false);
    expect(stale.stale).toBe(true);
    const step = await send({ rejected: { step: 'Step guidance is disabled' } });
    expect(snapshotAccepted(step, ['step'])).toBe(false);
    const optional = await send({ rejected: { bankTags: 'Bank highlights are disabled' } });
    expect(snapshotAccepted(optional)).toBe(false);
    expect(snapshotAccepted(optional, ['step'])).toBe(true);
    expect(snapshotAccepted(optional, ['bankTags'])).toBe(false);
    expect(snapshotAccepted(step, ['shopping'])).toBe(true);
    for (const rejected of ['invalid', [], { step: 123 }, { step: 'disabled', shopping: 123 }]) expect(await send({ rejected })).toMatchObject({ ok: false });
    for (const receipt of [null, [], 'ok', { stale: 'true' }]) expect(await send(receipt)).toMatchObject({ ok: false });
    expect(await send({}, 413)).toMatchObject({ ok: false, status: 413 });
  });

  it('the app declares protocol 6 and the /prep-plan address; an older plugin — we ask to update', () => {
    expect(APP_PROTOCOL).toBe(6);
    expect(BRIDGE_PATHS).toContain('/prep-plan');
    expect(supportsSnapshot(6)).toBe(true);
    expect(supportsSnapshot(5)).toBe(false);
    expect(supportsSnapshot(null)).toBe(false);
    expect(missingWithPlugin(5).join(' ')).toMatch(/snapshot/);
    expect(missingWithPlugin(6)).toEqual([]);
  });

  it('the plan in the game: percent, lines with importance, "do not take now", within the plugin checks', () => {
    const p = planPayload(planOf('S2-07', { 'Bronze pickaxe': { carried: 1 }, 'Iron bar': { carried: 0, bank: 2 } }));
    expect(p.stepId).toBe('S2-07');
    expect(typeof p.score.percent).toBe('number');
    expect(p.score.percent).toBeGreaterThanOrEqual(0);
    expect(p.score.percent).toBeLessThanOrEqual(100);
    expect(p.lines.length).toBeGreaterThan(0);
    expect(p.lines.length).toBeLessThanOrEqual(MAX_PLAN_LINES);
    for (const l of p.lines) {
      expect(l.name.length).toBeGreaterThan(0);
      expect(['EQUIPPED', 'INVENTORY', 'BANK', 'MISSING', 'UNKNOWN']).toContain(l.where);
      expect(['CRITICAL', 'IMPORTANT', 'OPTIMIZATION', 'OPTIONAL']).toContain(l.priority);
      expect(['NOW', 'SOON', 'IN_STEP']).toContain(l.timing);
      expect(l.action === undefined || l.action.length <= 200).toBe(true);
    }
    expect(p.later.length).toBeLessThanOrEqual(12);
  });

  it('recovery mode: the heading and the points in order, no more than five', () => {
    const p = planPayload(planOf('S2-07', {}, { recovery: DEATH }));
    expect(p.recovery?.title).toMatch(/You died/);
    expect(p.recovery?.title).toContain('S2-07');
    expect(p.recovery!.steps.length).toBeGreaterThan(0);
    expect(p.recovery!.steps.length).toBeLessThanOrEqual(5);
    expect(p.recovery!.steps[0]).toMatch(/things|grave/i);
    expect(planPayload(planOf('S2-07', {})).recovery).toBeUndefined();
  });

  it('the text is not longer than the plugin limit, cut at a word', () => {
    const c = clipText('word '.repeat(100));
    expect(c.length).toBeLessThanOrEqual(200);
    expect(c.endsWith('…')).toBe(true);
    expect(clipText('short  and   clear')).toBe('short and clear');
  });

  it('the snapshot is complete: what is absent — null; empty — as taken; another step\'s plan is not sent', () => {
    const step = toInGameTarget(allSteps.find((s) => s.id === 'S1-03')!)!;
    const plan = planPayload(planOf('S1-03', {}));
    const parts: SnapshotParts = { step, shopping: { items: [] }, bankTags: { stageId: 'stage-1', itemIds: [] }, gearHint: null, plan };
    const e = buildEnvelope(parts, 7);
    expect(e).toMatchObject({ v: SNAPSHOT_VERSION, seq: 7, shopping: null, bankTags: null, gearHint: null });
    expect(e.step?.stepId).toBe('S1-03');
    expect(e.plan?.stepId).toBe('S1-03');
    expect(buildEnvelope({ ...parts, plan: { ...plan, stepId: 'S9-99' } }, 8).plan).toBeNull();
    expect(buildEnvelope({ ...parts, step: null }, 9).step).toBeNull();
  });

  it('the same is not sent twice: the key does not depend on the snapshot number', () => {
    const parts: SnapshotParts = { ...EMPTY_PARTS, bankTags: { stageId: 'stage-1', itemIds: [1, 2] } };
    expect(envelopeKey(parts)).toBe(envelopeKey({ ...parts }));
    expect(envelopeKey(parts)).not.toBe(envelopeKey({ ...parts, bankTags: { stageId: 'stage-1', itemIds: [1, 3] } }));
  });

  it('the snapshot number grows between app launches too (by the clock), a late one will not pass', () => {
    expect(nextSeq(0, 1000)).toBe(1000);
    expect(nextSeq(1000, 1000)).toBe(1001);
    expect(nextSeq(5000, 1000)).toBe(5001);
    const a = nextSeq(0, 1_700_000_000_000);
    expect(nextSeq(a, 1_700_000_000_000 + 5)).toBeGreaterThan(a);
  });

  it('the copy of the snapshots in runelite-bridge matches what the app sends (the plugin parses it in its own tests)', () => {
    const mkParts = (id: string, plan: PrepPlan, extra: Partial<SnapshotParts> = {}): SnapshotParts => ({
      step: toInGameTarget(stepOrRetired(id)), shopping: null, bankTags: null, gearHint: null, plan: planPayload(plan), ...extra,
    });
    const cases: [string, SnapshotParts][] = [
      ['S1-03: some in the bag, some in the bank', mkParts('S1-03', planOf('S1-03', { Bucket: { carried: 1 }, Pot: { carried: 0, bank: 1 } }), {
        shopping: { items: [{ name: 'Bucket', id: 1925, count: 2 }] }, bankTags: { stageId: 'stage-1', itemIds: [1925, 1931] },
      })],
      ['S2-07: after death', mkParts('S2-07', planOf('S2-07', {}, { recovery: DEATH }))],
      ['S2-03: the bag is almost full', mkParts('S2-03', planOf('S2-03', { Onion: { carried: 1 } }, { slots: 27 }), {
        gearHint: { text: '⚡ Wear Iron scimitar — it is in the bank', watchItems: ['Iron scimitar'], highlightItems: ['Iron scimitar'] },
      })],
      ['S4-03: raising coins, the cow field reached and 12 hides taken', (() => {
        // The plan as the app runs it: started for the Hill Giants step, then ticked with what the game shows at the field.
        // Pin this cross-language cow-trip fixture, independently of the global method ranking.
        const f = scenario(market(), { bagCoins: 400, bankCoins: 0, methods: [methodById('cows-cowhide')!] });
        const started = startPlan(f.assessment, f.assessment.recommendation!, f.snap, methodById('cows-cowhide'), 1_792_000_000_000)!;
        const at = fakeSnap({ character: 'Tester', position: { x: 3253, y: 3278, plane: 0 }, bag: [{ name: 'Cowhide', count: 12 }], bagCoins: 400, bankCoins: 0 });
        const plan = tick(started, at, 1_792_000_060_000);
        return mkParts('S4-03', planOf('S4-03', {}), { funding: fundingHintPayload(plan, viewOf(plan, at), 'Tester') });
      })()],
      ['no step: everything cleared', { ...EMPTY_PARTS }],
    ];
    const rows = cases.map(([name, parts], i) => JSON.stringify({ name, envelope: buildEnvelope(parts, 1000 + i) }));
    const now = `[\n${rows.join(',\n')}\n]\n`;
    if (process.env.UPDATE_FIXTURES === '1') writeFileSync(FILE, now);
    const saved = existsSync(FILE) ? readFileSync(FILE, 'utf8') : '';
    expect(saved === now, 'runelite-bridge/src/test/resources/prep-snapshots.json is out of date — npm run fixtures').toBe(true);
  });
});

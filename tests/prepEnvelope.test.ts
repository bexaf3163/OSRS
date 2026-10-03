import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allSteps } from '../src/data';
import { buildPrepPlan, type PrepPlan } from '../src/lib/prepPlan';
import { buildPlayerState } from '../src/lib/playerState';
import { planOneTrip } from '../src/lib/oneTrip';
import { readinessOf } from '../src/lib/readiness';
import { emptyProgress } from '../src/lib/progress';
import { nameKey, type OwnedItem, type OwnedState } from '../src/lib/checklist';
import type { Recovery } from '../src/lib/recovery';
import { buildEnvelope, clipText, envelopeKey, MAX_PLAN_LINES, nextSeq, planPayload, EMPTY_PARTS, SNAPSHOT_VERSION, type SnapshotParts } from '../src/lib/prepEnvelope';
import { supportsSnapshot, toInGameTarget, APP_PROTOCOL, BRIDGE_PATHS, missingWithPlugin } from '../src/services/runeliteBridge';
import type { Step } from '../src/types';

const FILE = new URL('../runelite-bridge/src/test/resources/prep-snapshots.json', import.meta.url);

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
  const step = allSteps.find((s) => s.id === stepId)!;
  const progress = emptyProgress();
  return buildPrepPlan({
    step, steps: allSteps, progress, state, trip: planOneTrip(allSteps, progress, step.id, state),
    readiness: readinessOf(step, { steps: allSteps, progress, qp: 0, mode: 'f2p', state }), recovery: extra.recovery ?? null,
  });
}

const DEATH: Recovery = { reason: 'DEATH', since: 1, landedAt: { x: 3222, y: 3218, plane: 0 }, diedAt: null, distance: 120, target: { x: 3000, y: 3145, plane: 0 } };

describe('снимок состояния для игры (протокол 6)', () => {
  it('программа объявляет протокол 6 и адрес /prep-plan; плагин старше — просим обновить', () => {
    expect(APP_PROTOCOL).toBe(6);
    expect(BRIDGE_PATHS).toContain('/prep-plan');
    expect(supportsSnapshot(6)).toBe(true);
    expect(supportsSnapshot(5)).toBe(false);
    expect(supportsSnapshot(null)).toBe(false);
    expect(missingWithPlugin(5).join(' ')).toMatch(/снимок/);
    expect(missingWithPlugin(6)).toEqual([]);
  });

  it('план в игре: процент, строки с важностью, «не бери сейчас», в пределах проверок плагина', () => {
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

  it('режим восстановления: заголовок и пункты по порядку, не больше пяти', () => {
    const p = planPayload(planOf('S2-07', {}, { recovery: DEATH }));
    expect(p.recovery?.title).toMatch(/Ты умер/);
    expect(p.recovery?.title).toContain('S2-07');
    expect(p.recovery!.steps.length).toBeGreaterThan(0);
    expect(p.recovery!.steps.length).toBeLessThanOrEqual(5);
    expect(p.recovery!.steps[0]).toMatch(/вещи|могил/i);
    expect(planPayload(planOf('S2-07', {})).recovery).toBeUndefined();
  });

  it('текст не длиннее предела плагина, режется по слову', () => {
    const c = clipText('слово '.repeat(100));
    expect(c.length).toBeLessThanOrEqual(200);
    expect(c.endsWith('…')).toBe(true);
    expect(clipText('коротко  и   ясно')).toBe('коротко и ясно');
  });

  it('снимок полный: чего нет — null; пустое — как снято; план другого шага не уходит', () => {
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

  it('одинаковое не шлётся второй раз: ключ не зависит от номера снимка', () => {
    const parts: SnapshotParts = { ...EMPTY_PARTS, bankTags: { stageId: 'stage-1', itemIds: [1, 2] } };
    expect(envelopeKey(parts)).toBe(envelopeKey({ ...parts }));
    expect(envelopeKey(parts)).not.toBe(envelopeKey({ ...parts, bankTags: { stageId: 'stage-1', itemIds: [1, 3] } }));
  });

  it('номер снимка растёт и между запусками программы (по часам), запоздавший не пройдёт', () => {
    expect(nextSeq(0, 1000)).toBe(1000);
    expect(nextSeq(1000, 1000)).toBe(1001);
    expect(nextSeq(5000, 1000)).toBe(5001);
    const a = nextSeq(0, 1_700_000_000_000);
    expect(nextSeq(a, 1_700_000_000_000 + 5)).toBeGreaterThan(a);
  });

  it('копия снимков в runelite-bridge совпадает с тем, что шлёт программа (плагин разбирает её в своих тестах)', () => {
    const mkParts = (id: string, plan: PrepPlan, extra: Partial<SnapshotParts> = {}): SnapshotParts => ({
      step: toInGameTarget(allSteps.find((s: Step) => s.id === id)!), shopping: null, bankTags: null, gearHint: null, plan: planPayload(plan), ...extra,
    });
    const cases: [string, SnapshotParts][] = [
      ['S1-03: что-то в сумке, что-то в банке', mkParts('S1-03', planOf('S1-03', { Bucket: { carried: 1 }, Pot: { carried: 0, bank: 1 } }), {
        shopping: { items: [{ name: 'Bucket', id: 1925, count: 2 }] }, bankTags: { stageId: 'stage-1', itemIds: [1925, 1931] },
      })],
      ['S2-07: после смерти', mkParts('S2-07', planOf('S2-07', {}, { recovery: DEATH }))],
      ['S2-03: сумка почти полная', mkParts('S2-03', planOf('S2-03', { Onion: { carried: 1 } }, { slots: 27 }), {
        gearHint: { text: '⚡ Надень Iron scimitar — он в банке', watchItems: ['Iron scimitar'], highlightItems: ['Iron scimitar'] },
      })],
      ['без шага: всё снято', { ...EMPTY_PARTS }],
    ];
    const rows = cases.map(([name, parts], i) => JSON.stringify({ name, envelope: buildEnvelope(parts, 1000 + i) }));
    const now = `[\n${rows.join(',\n')}\n]\n`;
    if (process.env.UPDATE_FIXTURES === '1') writeFileSync(FILE, now);
    const saved = existsSync(FILE) ? readFileSync(FILE, 'utf8') : '';
    expect(saved === now, 'runelite-bridge/src/test/resources/prep-snapshots.json устарел — UPDATE_FIXTURES=1 npm test').toBe(true);
  });
});

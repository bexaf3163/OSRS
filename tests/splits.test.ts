import { describe, expect, it } from 'vitest';
import { BREAK_SECONDS, completions, computeSplits, durationText } from '../src/lib/splits';
import { emptyProgress, normalizeProgress, withStep } from '../src/lib/progress';
import type { Progress, Step } from '../src/types';

const step = (id: string, stage: number): Step => ({ id, stage, title: id } as unknown as Step);
const STEPS = [step('S1-01', 1), step('S1-02', 1), step('S1-03', 1), step('S2-01', 2), step('S2-02', 2)];
const T0 = Date.parse('2026-10-05T10:00:00Z');
const iso = (secondsAfter: number) => new Date(T0 + secondsAfter * 1000).toISOString();
const prog = (done: Record<string, number | null>, extra: Partial<Progress> = {}): Progress => ({
  ...emptyProgress(),
  steps: Object.fromEntries(Object.keys(done).map((id) => [id, 'done' as const])),
  doneAt: Object.fromEntries(Object.entries(done).filter(([, s]) => s !== null).map(([id, s]) => [id, iso(s!)])),
  ...extra,
});

describe('time splits', () => {
  it('each step is timed from the previous one; the first has no start, so no duration', () => {
    const r = computeSplits(STEPS, prog({ 'S1-01': 0, 'S1-02': 120, 'S1-03': 420, 'S2-01': 480 }));
    const all = r.stages.flatMap((g) => g.steps);
    expect(all.map((s) => [s.id, s.seconds, s.kind])).toEqual([['S1-01', null, 'first'], ['S1-02', 120, 'active'], ['S1-03', 300, 'active'], ['S2-01', 60, 'active']]);
    expect(r.stages.map((g) => [g.stage, g.activeSeconds])).toEqual([[1, 420], [2, 60]]);
    expect(r.activeSeconds).toBe(480);
    expect(r.slowest.map((s) => s.id)).toEqual(['S1-03', 'S1-02', 'S2-01']);
  });

  it('the order is the order things happened, not the route order', () => {
    const r = computeSplits(STEPS, prog({ 'S2-01': 0, 'S1-01': 100, 'S1-02': 160 }));
    expect(completions(STEPS, prog({ 'S2-01': 0, 'S1-01': 100, 'S1-02': 160 })).map((c) => c.id)).toEqual(['S2-01', 'S1-01', 'S1-02']);
    expect(r.stages.find((g) => g.stage === 1)!.activeSeconds).toBe(160);
  });

  it('a long gap is a break: shown, but left out of the active time', () => {
    const gap = BREAK_SECONDS + 1;
    const r = computeSplits(STEPS, prog({ 'S1-01': 0, 'S1-02': 60, 'S1-03': 60 + gap, 'S2-01': 120 + gap }));
    const s13 = r.stages[0].steps.find((s) => s.id === 'S1-03')!;
    expect(s13).toMatchObject({ kind: 'break', seconds: gap });
    expect(r.stages[0]).toMatchObject({ activeSeconds: 60, breaks: 1 });
    expect(r.activeSeconds).toBe(120);
    expect(r.slowest.map((s) => s.id), 'a break is never the slowest step').not.toContain('S1-03');
    const exactly = computeSplits(STEPS, prog({ 'S1-01': 0, 'S1-02': BREAK_SECONDS }));
    expect(exactly.stages[0].steps[1].kind, 'exactly the limit is still play time').toBe('active');
  });

  it('steps without a time are counted apart and never guessed', () => {
    const r = computeSplits(STEPS, prog({ 'S1-01': null, 'S1-02': 0, 'S1-03': 90, 'S2-01': null }));
    expect(r.untimed).toBe(2);
    expect(r.stages.flatMap((g) => g.steps).map((s) => s.id)).toEqual(['S1-02', 'S1-03']);
    expect(computeSplits(STEPS, prog({ 'S1-01': null })).stages).toEqual([]);
    expect(computeSplits(STEPS, emptyProgress())).toMatchObject({ stages: [], slowest: [], activeSeconds: 0, untimed: 0 });
  });

  it('a time for a step that is no longer done, or a broken date, is ignored', () => {
    const p = prog({ 'S1-01': 0, 'S1-02': 60 });
    delete p.steps['S1-02'];
    expect(completions(STEPS, p).map((c) => c.id)).toEqual(['S1-01']);
    expect(completions(STEPS, { ...p, doneAt: { 'S1-01': 'not a date' } })).toEqual([]);
  });

  it('durations are said in seconds, minutes, hours', () => {
    expect(durationText(0)).toBe('0 s');
    expect(durationText(89)).toBe('89 s');
    expect(durationText(90)).toBe('2 min');
    expect(durationText(59 * 60)).toBe('59 min');
    expect(durationText(3600 + 5 * 60)).toBe('1 h 05 min');
    expect(durationText(-5)).toBe('0 s');
  });
});

describe('the time of a completion in the progress', () => {
  it('marking done stamps it; skipping or unmarking drops it; a bulk mark has none', () => {
    let p = withStep(emptyProgress(), 'S1-01', 'done');
    expect(Date.parse(p.doneAt!['S1-01'])).toBeGreaterThan(Date.now() - 5000);
    p = withStep(p, 'S1-01', 'skipped');
    expect(p.doneAt).toBeUndefined();
    p = withStep(p, 'S1-02', 'done', { stamp: false });
    expect(p.steps['S1-02']).toBe('done');
    expect(p.doneAt).toBeUndefined();
    p = withStep(withStep(p, 'S1-03', 'done'), 'S1-03', null);
    expect(p.doneAt).toBeUndefined();
  });

  it('a step already stamped keeps its own time when another one is marked', () => {
    const before = prog({ 'S1-01': 0 });
    const after = withStep(before, 'S1-02', 'done');
    expect(after.doneAt!['S1-01']).toBe(iso(0));
    expect(Object.keys(after.doneAt!).sort()).toEqual(['S1-01', 'S1-02']);
  });

  it('reading a save keeps the times of known steps that are done, and drops the rest', () => {
    const known = { stepIds: new Set(['S1-01', 'S1-02', 'S1-03']), levelIds: new Set<string>() };
    const raw = { ...prog({ 'S1-01': 0, 'S1-02': 60 }), doneAt: { 'S1-01': iso(0), 'S1-02': 'garbage', 'S1-03': iso(5), 'S9-99': iso(9) } };
    const n = normalizeProgress(raw, known)!;
    expect(n.progress.doneAt).toEqual({ 'S1-01': iso(0) });
    expect(normalizeProgress({ ...prog({ 'S1-01': 0 }), doneAt: 'x' }, known)!.progress.doneAt).toBeUndefined();
    expect(normalizeProgress(prog({ 'S1-01': 0 }), known)!.progress.doneAt).toEqual({ 'S1-01': iso(0) });
  });
});

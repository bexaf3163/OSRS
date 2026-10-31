import { describe, expect, it } from 'vitest';
import { durationText } from '../src/lib/splits';
import { emptyProgress, normalizeProgress, withStep } from '../src/lib/progress';
import type { Progress } from '../src/types';

const T0 = Date.parse('2026-10-05T10:00:00Z');
const iso = (secondsAfter: number) => new Date(T0 + secondsAfter * 1000).toISOString();
const prog = (done: Record<string, number | null>, extra: Partial<Progress> = {}): Progress => ({
  ...emptyProgress(),
  steps: Object.fromEntries(Object.keys(done).map((id) => [id, 'done' as const])),
  doneAt: Object.fromEntries(Object.entries(done).filter(([, s]) => s !== null).map(([id, s]) => [id, iso(s!)])),
  ...extra,
});

describe('duration formatting', () => {
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

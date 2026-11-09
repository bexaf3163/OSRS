import { describe, expect, it } from 'vitest';
import { allSteps, known, stepById } from '../../data';
import {
  emptyProgress, exportFileName, exportProgress, gameModeOf, importProgress, loadProgress, normalizeProgress, saveProgress, STORAGE_KEY,
  RETIRED_STEPS, V2_FROM_V1, V3_FROM_V2, withGameMode, withLevel, withNote, withReviewed, withStep,
} from './progress';
import { needsReview, pendingReview } from '../readiness/review';
import { retiredStep } from '../../../tests/fixtures/retiredSteps';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

describe('progress: export and import', () => {
  const sample = () => {
    let p = emptyProgress();
    p = withStep(p, 'S1-03', 'done');
    p = withStep(p, 'S3-05', 'skipped');
    p = withLevel(p, 'fishing', 23);
    p = withNote(p, 'S2-05', 'key in the bank');
    return p;
  };

  it('export → import returns the same progress', () => {
    const p = sample();
    const result = importProgress(exportProgress(p), known);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.progress).toEqual(p);
    expect(result.stats).toEqual({ done: 1, skipped: 1, levels: 1, notes: 1, dropped: 0, migrated: false });
  });

  it('the export is marked by the app', () => {
    expect(JSON.parse(exportProgress(emptyProgress())).app).toBe('osrs-put');
    expect(exportFileName(new Date('2026-09-26T10:00:00Z'))).toBe('osrs-put-progress-2026-09-26.json');
  });

  it('not JSON — a clear error', () => {
    const r = importProgress('this is not json', known);
    expect(r).toEqual({ ok: false, error: expect.stringContaining('not JSON') });
  });

  it('a foreign file and a file without progress are rejected', () => {
    expect(importProgress(JSON.stringify({ app: 'other', steps: {} }), known).ok).toBe(false);
    expect(importProgress(JSON.stringify({ hello: 1 }), known).ok).toBe(false);
    expect(importProgress(JSON.stringify([1, 2]), known).ok).toBe(false);
    expect(importProgress('null', known).ok).toBe(false);
  });

  it('a file of a newer version is rejected', () => {
    const r = importProgress(JSON.stringify({ app: 'osrs-put', version: 4, steps: {} }), known);
    expect(r).toEqual({ ok: false, error: expect.stringContaining('newer version') });
  });

  it('valid retired history is kept while invalid records are dropped', () => {
    const r = importProgress(JSON.stringify({
      version: 3,
      steps: { 'S1-03': 'done', 'S9-99': 'done', 'S1-04': 'maybe' },
      levels: { fishing: 120, cooking: '15', sailing: 50, mining: 'a lot' },
      notes: { 'S1-03': 'ok', 'S9-99': 'no', 'S1-04': 5 },
    }), known);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.progress.steps).toEqual({ 'S1-03': 'done' });
    expect(r.progress.levels).toEqual({ fishing: 99, cooking: 15 });
    expect(r.progress.notes).toEqual({ 'S1-03': 'ok' });
    expect(r.progress.legacy).toEqual({ steps: { 'S9-99': 'done' }, notes: { 'S9-99': 'no' } });
    expect(r.stats.dropped).toBe(4);
  });
});

describe('progress: storage', () => {
  it('content retirement preserves done, skipped, notes and times through export and repeated autosaves', () => {
    const previous = {
      ...emptyProgress(), steps: { 'S1-13': 'done', 'S3-06': 'skipped', 'S6-01': 'done' },
      notes: { 'S1-13': 'Kept for the next quest', 'S3-06': 'Deliberately skipped', 'S6-01': 'My custom goal' },
      doneAt: { 'S1-13': '2026-10-30T12:00:00Z', 'S6-01': '2026-10-31T12:00:00Z' },
      legacy: { steps: { 'old-quest': 'done' }, notes: { 'old-quest': 'Earlier migration' } },
    };
    const retired = new Set(Object.keys(previous.steps));
    const reduced = { ...known, stepIds: new Set([...known.stepIds].filter(id => !retired.has(id))) };
    const first = normalizeProgress(previous, reduced)!;
    expect(first.dropped).toBe(0);
    expect(first.progress.steps).toEqual({});
    expect(first.progress.notes).toEqual({});
    expect(first.progress.legacy).toEqual({
      steps: { 'old-quest': 'done', ...previous.steps }, notes: { 'old-quest': 'Earlier migration', ...previous.notes }, doneAt: previous.doneAt,
    });
    const store = memoryStorage();
    expect(saveProgress(store, first.progress)).toBe(true);
    const restored = loadProgress(store, reduced);
    expect(restored).toEqual(first.progress);
    const imported = importProgress(exportProgress(restored), reduced);
    expect(imported.ok && imported.progress).toEqual(first.progress);
    // Reintroducing content does not silently promote historical skips/marks to actual current completion.
    expect(normalizeProgress(restored, known)!.progress.steps).toEqual({});
  });

  it('the latest retired input wins without discarding a prior unrelated history record', () => {
    const input = { ...emptyProgress(), steps: { retired: 'skipped' }, notes: { retired: 'Current note' },
      legacy: { steps: { retired: 'done', other: 'done' }, notes: { retired: 'Old note', other: 'Keep' } } };
    expect(normalizeProgress(input, known)!.progress.legacy).toEqual({
      steps: { retired: 'skipped', other: 'done' }, notes: { retired: 'Current note', other: 'Keep' },
    });
  });

  it('Hitpoints from the game is kept, though it has no level field: the combat plan is worked out from the last levels while the game is away (2.72.1)', () => {
    // Live: the saved levels had no Hitpoints, so before the game connected the step fell back to the route as written (Hill Giants).
    const n = normalizeProgress({ version: 3, steps: {}, levels: { attack: 30, defence: 1, hitpoints: 24 }, notes: {} }, known)!;
    expect(n.progress.levels).toEqual({ attack: 30, defence: 1, hitpoints: 24 });
    expect(n.dropped).toBe(0);
  });

  it('is saved and read', () => {
    const s = memoryStorage();
    const p = withStep(emptyProgress(), 'S1-03', 'done');
    expect(saveProgress(s, p)).toBe(true);
    expect(loadProgress(s, known)).toEqual(p);
  });

  it('a damaged record — clean progress', () => {
    const s = memoryStorage();
    s.setItem(STORAGE_KEY, '{broken');
    expect(loadProgress(s, known).steps).toEqual({});
  });

  it('an unavailable storage does not crash the app', () => {
    const broken = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceeded'); } };
    expect(loadProgress(broken, known).steps).toEqual({});
    expect(saveProgress(broken, emptyProgress())).toBe(false);
  });

  it('updates do not change the source object', () => {
    const p = emptyProgress();
    const q = withStep(p, 'S1-03', 'done');
    expect(p.steps).toEqual({});
    expect(withStep(q, 'S1-03', null).steps).toEqual({});
    expect(withNote(withNote(p, 'S1-03', 'x'), 'S1-03', '   ').notes).toEqual({});
  });
});

describe('progress: moving from V1 to V2', () => {
  const v1 = {
    app: 'osrs-put', version: 1, updatedAt: '2026-05-01T10:00:00.000Z',
    steps: { 'S1-03': 'done', 'S1-06': 'done', 'S2-03': 'done', 'S4-07': 'done', 'S4-08': 'done', 'S3-07': 'skipped', 'S6-04': 'done' },
    levels: { fishing: 30 },
    notes: { 'S1-06': 'ghost at the graveyard', 'S6-04': 'old note' },
  };

  it('marks move by the table, the whole old progress stays in legacy', () => {
    const n = normalizeProgress(v1, known)!;
    expect(n.migrated).toBe(true);
    expect(n.progress.version).toBe(3);
    // V1 S1-06 (The Restless Ghost) is S1-06 now too; V1 S2-03 (exchange shopping) was S2-01;
    // V2 S4-05 (shopping for the dragon) is assembled from two V1 steps and counted only when both are done. Both are retired now; the V1 marks stay in the legacy copy.
    expect(n.progress.steps).toEqual({ 'S1-03': 'done', 'S1-06': 'done', 'S3-05': 'skipped' });
    expect(n.progress.notes).toEqual({ 'S1-06': 'ghost at the graveyard' });
    // A step that does not exist in V2 is not lost: it is in the backup copy.
    expect(n.progress.legacy).toEqual({ steps: v1.steps, notes: v1.notes });
    expect(n.progress.levels).toEqual({ fishing: 30 });
    expect(n.progress.updatedAt).toBe(v1.updatedAt);
  });

  it('the transfer table leads only to existing or retired V2 steps', () => {
    for (const id of Object.keys(V2_FROM_V1)) expect(stepById.has(id) || RETIRED_STEPS.includes(id), id).toBe(true);
  });

  it('a part of a composite step does not count it as a whole', () => {
    const n = normalizeProgress({ steps: { 'S4-07': 'done' } }, known)!;
    expect(n.progress.steps['S4-05']).toBeUndefined();
  });

  it('importing a V1 file reports the transfer', () => {
    const r = importProgress(JSON.stringify(v1), known);
    expect(r.ok && r.stats.migrated).toBe(true);
  });

  it('V2 is read without a repeated transfer and keeps the mode, the reviewed steps and the points', () => {
    let p = withGameMode(withStep(emptyProgress(), 'S7-01', 'done'), 'members');
    p = withReviewed(p, ['S1-03']);
    p = { ...p, qpKept: ['S1-04'] };
    const n = normalizeProgress(JSON.parse(JSON.stringify(p)), known)!;
    expect(n.migrated).toBe(false);
    expect(n.progress).toEqual(p);
    expect(gameModeOf(n.progress)).toBe('members');
  });
});

describe('progress: moving from V2 (2.0.0) to V2.1', () => {
  const v2 = {
    app: 'osrs-put', version: 2, updatedAt: '2026-09-26T12:00:00.000Z',
    // V2: S1-06 is the Chronicle book, S1-10 is Stronghold, S8-03 is Fairytale I, S7-04 is The Grand Tree.
    steps: { 'S1-06': 'done', 'S1-10': 'done', 'S8-03': 'done', 'S7-04': 'done', 'S2-01': 'done' },
    notes: { 'S1-06': 'book in the inventory' },
    reviewedV2Steps: ['S2-01'],
    qpKept: ['S8-03'],
    gameMode: 'members',
  };

  it('steps move to the new numbers together with notes, reviews and kept points', () => {
    const n = normalizeProgress(v2, known)!;
    expect(n.migrated).toBe(false);
    expect(n.dropped).toBe(0);
    expect(n.progress.steps).toEqual({ 'S1-09': 'done', 'S9-02': 'done', 'S7-05': 'done' });
    // S1-10 and S2-01 are retired, so their renamed marks and notes stay in the legacy history.
    expect(n.progress.legacy).toEqual({ steps: { 'S1-10': 'done', 'S2-01': 'done' }, notes: { 'S1-10': 'book in the inventory' } });
    expect(n.progress.qpKept).toEqual(['S9-02']);
    // A review mark only applies to a live step, so the retired S2-01 drops it.
    expect(n.progress.reviewedV2Steps).toBeUndefined();
    expect(n.progress.gameMode).toBe('members');
    expect(retiredStep('S1-10').title).toContain('Chronicle');
    expect(stepById.get('S9-02')!.title).toContain('Fairytale I');
  });

  it('the rename table is a permutation: every new number is taken by one old step', () => {
    const targets = Object.values(V3_FROM_V2);
    expect(new Set(targets).size).toBe(targets.length);
    for (const id of targets) expect(stepById.has(id) || RETIRED_STEPS.includes(id), id).toBe(true);
  });

  it('archives retired V2 timestamps under the same renamed IDs as their marks and notes', () => {
    const reduced = { ...known, stepIds: new Set([...known.stepIds].filter(id => id !== 'S1-10')) };
    const input = { ...v2, doneAt: { 'S1-06': '2026-09-26T11:00:00Z', 'S1-10': '2026-09-26T11:30:00Z' } };
    const result = normalizeProgress(input, reduced)!.progress;
    expect(result.legacy).toEqual({ steps: { 'S1-10': 'done', 'S2-01': 'done' }, notes: { 'S1-10': 'book in the inventory' },
      doneAt: { 'S1-10': '2026-09-26T11:00:00Z' } });
    expect(result.doneAt).toEqual({ 'S1-09': '2026-09-26T11:30:00Z' });
    expect(normalizeProgress(JSON.parse(exportProgress(result)), reduced)!.progress).toEqual(result);
  });
});

describe('V2 Review', () => {
  it('the warning — only for done steps updated in V2, and before the review', () => {
    const s = stepById.get('S1-03')!;
    expect(s.updatedInV2).toBe(true);
    expect(needsReview(s, emptyProgress())).toBe(false);
    const done = withStep(emptyProgress(), 'S1-03', 'done');
    expect(needsReview(s, done)).toBe(true);
    expect(needsReview(s, withReviewed(done, ['S1-03']))).toBe(false);
    expect(needsReview(stepById.get('S1-05')!, withStep(emptyProgress(), 'S1-05', 'done'))).toBe(false);
  });

  it('every updated step has a description of the changes', () => {
    const updated = allSteps.filter((s) => s.updatedInV2);
    expect(updated.map((s) => s.id)).toEqual(['S1-03', 'S1-04']);
    for (const s of updated) expect(s.v2ChangesSummary?.length).toBeGreaterThan(20);
  });

  it('the review list after the V1 transfer', () => {
    const p = normalizeProgress({ steps: { 'S1-03': 'done', 'S1-04': 'done', 'S2-03': 'done' } }, known)!.progress;
    // V1 S2-03 became the retired S2-01, so the mark stays in the legacy copy only.
    expect(p.steps['S2-01']).toBeUndefined();
    expect(p.legacy?.steps['S2-03']).toBe('done');
    expect(pendingReview(allSteps, p).map((s) => s.id)).toEqual(['S1-03', 'S1-04']);
  });
});

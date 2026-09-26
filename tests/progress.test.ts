import { describe, expect, it } from 'vitest';
import { allSteps, known, stepById } from '../src/data';
import {
  emptyProgress, exportFileName, exportProgress, gameModeOf, importProgress, loadProgress, normalizeProgress, saveProgress, STORAGE_KEY,
  V2_FROM_V1, V3_FROM_V2, withGameMode, withLevel, withNote, withReviewed, withStep,
} from '../src/lib/progress';
import { needsReview, pendingReview } from '../src/lib/review';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

describe('прогресс: экспорт и импорт', () => {
  const sample = () => {
    let p = emptyProgress();
    p = withStep(p, 'S1-01', 'done');
    p = withStep(p, 'S3-05', 'skipped');
    p = withLevel(p, 'fishing', 23);
    p = withNote(p, 'S2-05', 'ключ в банке');
    return p;
  };

  it('экспорт → импорт возвращает тот же прогресс', () => {
    const p = sample();
    const result = importProgress(exportProgress(p), known);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.progress).toEqual(p);
    expect(result.stats).toEqual({ done: 1, skipped: 1, levels: 1, notes: 1, dropped: 0, migrated: false });
  });

  it('экспорт помечен приложением', () => {
    expect(JSON.parse(exportProgress(emptyProgress())).app).toBe('osrs-put');
    expect(exportFileName(new Date('2026-09-26T10:00:00Z'))).toBe('osrs-put-progress-2026-09-26.json');
  });

  it('не JSON — понятная ошибка', () => {
    const r = importProgress('это не json', known);
    expect(r).toEqual({ ok: false, error: expect.stringContaining('не JSON') });
  });

  it('чужой файл и файл без прогресса отклоняются', () => {
    expect(importProgress(JSON.stringify({ app: 'другое', steps: {} }), known).ok).toBe(false);
    expect(importProgress(JSON.stringify({ hello: 1 }), known).ok).toBe(false);
    expect(importProgress(JSON.stringify([1, 2]), known).ok).toBe(false);
    expect(importProgress('null', known).ok).toBe(false);
  });

  it('файл новой версии отклоняется', () => {
    const r = importProgress(JSON.stringify({ app: 'osrs-put', version: 4, steps: {} }), known);
    expect(r).toEqual({ ok: false, error: expect.stringContaining('новой версией') });
  });

  it('неизвестные шаги, навыки и неверные значения отбрасываются', () => {
    const r = importProgress(JSON.stringify({
      version: 3,
      steps: { 'S1-01': 'done', 'S9-99': 'done', 'S1-02': 'maybe' },
      levels: { fishing: 120, cooking: '15', sailing: 50, mining: 'много' },
      notes: { 'S1-01': 'ок', 'S9-99': 'нет', 'S1-02': 5 },
    }), known);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.progress.steps).toEqual({ 'S1-01': 'done' });
    expect(r.progress.levels).toEqual({ fishing: 99, cooking: 15 });
    expect(r.progress.notes).toEqual({ 'S1-01': 'ок' });
    expect(r.stats.dropped).toBe(6);
  });
});

describe('прогресс: хранение', () => {
  it('сохраняется и читается', () => {
    const s = memoryStorage();
    const p = withStep(emptyProgress(), 'S1-03', 'done');
    expect(saveProgress(s, p)).toBe(true);
    expect(loadProgress(s, known)).toEqual(p);
  });

  it('повреждённая запись — чистый прогресс', () => {
    const s = memoryStorage();
    s.setItem(STORAGE_KEY, '{битый');
    expect(loadProgress(s, known).steps).toEqual({});
  });

  it('недоступное хранилище не роняет приложение', () => {
    const broken = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceeded'); } };
    expect(loadProgress(broken, known).steps).toEqual({});
    expect(saveProgress(broken, emptyProgress())).toBe(false);
  });

  it('обновления не меняют исходный объект', () => {
    const p = emptyProgress();
    const q = withStep(p, 'S1-01', 'done');
    expect(p.steps).toEqual({});
    expect(withStep(q, 'S1-01', null).steps).toEqual({});
    expect(withNote(withNote(p, 'S1-01', 'x'), 'S1-01', '   ').notes).toEqual({});
  });
});

describe('прогресс: переход с V1 на V2', () => {
  const v1 = {
    app: 'osrs-put', version: 1, updatedAt: '2026-05-01T10:00:00.000Z',
    steps: { 'S1-03': 'done', 'S1-06': 'done', 'S2-03': 'done', 'S4-07': 'done', 'S4-08': 'done', 'S3-07': 'skipped', 'S6-01': 'done' },
    levels: { fishing: 30 },
    notes: { 'S1-06': 'дух у кладбища', 'S6-01': 'старая заметка' },
  };

  it('отметки переезжают по таблице, старый прогресс целиком остаётся в legacy', () => {
    const n = normalizeProgress(v1, known)!;
    expect(n.migrated).toBe(true);
    expect(n.progress.version).toBe(3);
    // V1 S1-06 (The Restless Ghost) — это S1-06 и сейчас; V1 S2-03 (закупки на бирже) — S2-01;
    // V2 S4-05 (закупки к дракону) собран из двух шагов V1 и засчитан, только когда сделаны оба.
    expect(n.progress.steps).toEqual({ 'S1-03': 'done', 'S1-06': 'done', 'S2-01': 'done', 'S4-05': 'done', 'S3-05': 'skipped' });
    expect(n.progress.notes).toEqual({ 'S1-06': 'дух у кладбища' });
    // Шаг, которого в V2 нет, не теряется: он в резервной копии.
    expect(n.progress.legacy).toEqual({ steps: v1.steps, notes: v1.notes });
    expect(n.progress.levels).toEqual({ fishing: 30 });
    expect(n.progress.updatedAt).toBe(v1.updatedAt);
  });

  it('таблица переноса ведёт только в существующие шаги V2', () => {
    for (const id of Object.keys(V2_FROM_V1)) expect(stepById.has(id), id).toBe(true);
  });

  it('часть составного шага не засчитывает его целиком', () => {
    const n = normalizeProgress({ steps: { 'S4-07': 'done' } }, known)!;
    expect(n.progress.steps['S4-05']).toBeUndefined();
  });

  it('импорт файла V1 сообщает о переносе', () => {
    const r = importProgress(JSON.stringify(v1), known);
    expect(r.ok && r.stats.migrated).toBe(true);
  });

  it('V2 читается без повторного переноса и сохраняет режим, проверенные шаги и очки', () => {
    let p = withGameMode(withStep(emptyProgress(), 'S7-01', 'done'), 'members');
    p = withReviewed(p, ['S1-03']);
    p = { ...p, qpKept: ['S1-04'] };
    const n = normalizeProgress(JSON.parse(JSON.stringify(p)), known)!;
    expect(n.migrated).toBe(false);
    expect(n.progress).toEqual(p);
    expect(gameModeOf(n.progress)).toBe('members');
  });
});

describe('прогресс: переход с V2 (2.0.0) на V2.1', () => {
  const v2 = {
    app: 'osrs-put', version: 2, updatedAt: '2026-09-26T12:00:00.000Z',
    // V2: S1-06 — книга Chronicle, S1-10 — Stronghold, S8-03 — Fairytale I, S7-04 — The Grand Tree.
    steps: { 'S1-06': 'done', 'S1-10': 'done', 'S8-03': 'done', 'S7-04': 'done', 'S2-01': 'done' },
    notes: { 'S1-06': 'книга в инвентаре' },
    reviewedV2Steps: ['S2-01'],
    qpKept: ['S8-03'],
    gameMode: 'members',
  };

  it('шаги переезжают на новые номера вместе с заметками, проверками и сохранёнными очками', () => {
    const n = normalizeProgress(v2, known)!;
    expect(n.migrated).toBe(false);
    expect(n.dropped).toBe(0);
    expect(n.progress.steps).toEqual({ 'S1-10': 'done', 'S1-09': 'done', 'S9-02': 'done', 'S7-05': 'done', 'S2-01': 'done' });
    expect(n.progress.notes).toEqual({ 'S1-10': 'книга в инвентаре' });
    expect(n.progress.qpKept).toEqual(['S9-02']);
    expect(n.progress.reviewedV2Steps).toEqual(['S2-01']);
    expect(n.progress.gameMode).toBe('members');
    expect(stepById.get('S1-10')!.title).toContain('Chronicle');
    expect(stepById.get('S9-02')!.title).toContain('Fairytale I');
  });

  it('таблица переименований — перестановка: каждый новый номер занят одним старым шагом', () => {
    const targets = Object.values(V3_FROM_V2);
    expect(new Set(targets).size).toBe(targets.length);
    for (const id of targets) expect(stepById.has(id), id).toBe(true);
  });
});

describe('V2 Review', () => {
  it('предупреждение — только у выполненных шагов, обновлённых в V2, и до проверки', () => {
    const s = stepById.get('S1-03')!;
    expect(s.updatedInV2).toBe(true);
    expect(needsReview(s, emptyProgress())).toBe(false);
    const done = withStep(emptyProgress(), 'S1-03', 'done');
    expect(needsReview(s, done)).toBe(true);
    expect(needsReview(s, withReviewed(done, ['S1-03']))).toBe(false);
    expect(needsReview(stepById.get('S1-05')!, withStep(emptyProgress(), 'S1-05', 'done'))).toBe(false);
  });

  it('у каждого обновлённого шага есть описание изменений', () => {
    const updated = allSteps.filter((s) => s.updatedInV2);
    expect(updated.map((s) => s.id)).toEqual(['S1-03', 'S1-04', 'S2-01']);
    for (const s of updated) expect(s.v2ChangesSummary?.length).toBeGreaterThan(20);
  });

  it('список на проверку после переноса V1', () => {
    const p = normalizeProgress({ steps: { 'S1-03': 'done', 'S1-04': 'done', 'S2-03': 'done' } }, known)!.progress;
    expect(p.steps['S2-01']).toBe('done');
    expect(pendingReview(allSteps, p).map((s) => s.id)).toEqual(['S1-03', 'S1-04', 'S2-01']);
  });
});

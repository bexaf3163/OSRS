import { describe, expect, it } from 'vitest';
import { known } from '../src/data';
import {
  emptyProgress, exportFileName, exportProgress, importProgress, loadProgress, saveProgress, STORAGE_KEY,
  withLevel, withNote, withStep,
} from '../src/lib/progress';

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
    p = withStep(p, 'S3-07', 'skipped');
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
    expect(result.stats).toEqual({ done: 1, skipped: 1, levels: 1, notes: 1, dropped: 0 });
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
    const r = importProgress(JSON.stringify({ app: 'osrs-put', version: 2, steps: {} }), known);
    expect(r).toEqual({ ok: false, error: expect.stringContaining('новой версией') });
  });

  it('неизвестные шаги, навыки и неверные значения отбрасываются', () => {
    const r = importProgress(JSON.stringify({
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

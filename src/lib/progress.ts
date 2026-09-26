// Прогресс: хранение в localStorage, экспорт и импорт JSON, чистые обновления.

import type { Progress, StepStatus } from '../types';
import { clampLevel } from './xp';

export const STORAGE_KEY = 'osrs-put:progress';
export const EXPORT_APP = 'osrs-put';
const MAX_NOTE = 5000;

export interface Known {
  stepIds: Set<string>;
  levelIds: Set<string>;
}

export function emptyProgress(): Progress {
  return { version: 1, steps: {}, levels: {}, notes: {}, updatedAt: new Date().toISOString() };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export interface Normalized {
  progress: Progress;
  /** Сколько записей отброшено: неизвестные шаги, навыки или неверные значения. */
  dropped: number;
}

/** Приводит похожее на прогресс к правильной форме, отбрасывая лишнее. null — если это не прогресс вовсе. */
export function normalizeProgress(raw: unknown, known: Known): Normalized | null {
  if (!isObject(raw)) return null;
  if (!isObject(raw.steps) && !isObject(raw.levels) && !isObject(raw.notes)) return null;
  const p = emptyProgress();
  let dropped = 0;

  for (const [id, status] of Object.entries(isObject(raw.steps) ? raw.steps : {})) {
    if (known.stepIds.has(id) && (status === 'done' || status === 'skipped')) p.steps[id] = status;
    else dropped++;
  }
  for (const [id, level] of Object.entries(isObject(raw.levels) ? raw.levels : {})) {
    const n = typeof level === 'number' ? level : typeof level === 'string' && level.trim() ? Number(level) : NaN;
    if (known.levelIds.has(id) && Number.isFinite(n)) p.levels[id] = clampLevel(n);
    else dropped++;
  }
  for (const [id, note] of Object.entries(isObject(raw.notes) ? raw.notes : {})) {
    if (known.stepIds.has(id) && typeof note === 'string') {
      if (note.trim()) p.notes[id] = note.slice(0, MAX_NOTE);
    } else dropped++;
  }
  if (typeof raw.updatedAt === 'string' && !Number.isNaN(Date.parse(raw.updatedAt))) p.updatedAt = raw.updatedAt;
  return { progress: p, dropped };
}

export function loadProgress(storage: Pick<Storage, 'getItem'> | undefined, known: Known): Progress {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    if (text) return normalizeProgress(JSON.parse(text), known)?.progress ?? emptyProgress();
  } catch {
    // Повреждённая запись или недоступное хранилище — начинаем с чистого листа.
  }
  return emptyProgress();
}

export function saveProgress(storage: Pick<Storage, 'setItem'> | undefined, p: Progress): boolean {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

export function exportProgress(p: Progress): string {
  return JSON.stringify({ app: EXPORT_APP, ...p }, null, 2) + '\n';
}

export function exportFileName(date = new Date()): string {
  return `osrs-put-progress-${date.toISOString().slice(0, 10)}.json`;
}

export interface ImportStats {
  done: number;
  skipped: number;
  levels: number;
  notes: number;
  dropped: number;
}

export type ImportResult =
  | { ok: true; progress: Progress; stats: ImportStats }
  | { ok: false; error: string };

export function importProgress(text: string, known: Known): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Это не JSON. Выбери файл, сохранённый кнопкой «Экспорт прогресса».' };
  }
  if (isObject(raw) && 'app' in raw && raw.app !== EXPORT_APP) {
    return { ok: false, error: 'Файл сохранён другим приложением.' };
  }
  if (isObject(raw) && typeof raw.version === 'number' && raw.version > 1) {
    return { ok: false, error: 'Файл сохранён более новой версией приложения. Обнови приложение и попробуй снова.' };
  }
  const n = normalizeProgress(raw, known);
  if (!n) return { ok: false, error: 'В файле нет прогресса: не найдены шаги, уровни или заметки.' };
  const statuses = Object.values(n.progress.steps);
  return {
    ok: true,
    progress: n.progress,
    stats: {
      done: statuses.filter((s) => s === 'done').length,
      skipped: statuses.filter((s) => s === 'skipped').length,
      levels: Object.keys(n.progress.levels).length,
      notes: Object.keys(n.progress.notes).length,
      dropped: n.dropped,
    },
  };
}

const touch = (p: Progress): Progress => ({ ...p, updatedAt: new Date().toISOString() });

export function withStep(p: Progress, id: string, status: StepStatus | null): Progress {
  const steps = { ...p.steps };
  if (status) steps[id] = status;
  else delete steps[id];
  return touch({ ...p, steps });
}

export function withLevel(p: Progress, id: string, level: number): Progress {
  return touch({ ...p, levels: { ...p.levels, [id]: clampLevel(level) } });
}

export function withNote(p: Progress, id: string, note: string): Progress {
  const notes = { ...p.notes };
  if (note.trim()) notes[id] = note.slice(0, MAX_NOTE);
  else delete notes[id];
  return touch({ ...p, notes });
}

export function levelOf(p: Progress, id: string): number {
  return p.levels[id] ?? 1;
}

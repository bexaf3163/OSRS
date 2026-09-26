// Прогресс: хранение, экспорт и импорт JSON, миграция старых сохранений, чистые обновления.
// Без относительных импортов значений: модуль используют и тесты, и приложение.

import type { GameMode, Progress, StepStatus } from '../types/index.ts';

export const STORAGE_KEY = 'osrs-put:progress';
export const EXPORT_APP = 'osrs-put';
export const PROGRESS_VERSION = 3;
const MAX_NOTE = 5000;

export interface Known {
  stepIds: Set<string>;
  levelIds: Set<string>;
}

/**
 * Старый маршрут (V1, по osrs-guide.md) → текущий. Шаг считается сделанным, если сделаны все перечисленные шаги V1.
 * Переносится только то, где условие «Готово, когда» по сути совпадает. Остальное лежит в progress.legacy.
 */
export const V2_FROM_V1: Record<string, string[]> = {
  'S1-01': ['S1-01'], 'S1-02': ['S1-02'], 'S1-03': ['S1-03'], 'S1-04': ['S1-04'], 'S1-05': ['S1-05'],
  'S1-06': ['S1-06'], 'S1-07': ['S1-07'], 'S1-08': ['S1-10'], 'S1-09': ['S2-02'], 'S1-11': ['S1-09'], 'S1-12': ['S1-11'],
  'S2-01': ['S2-03'], 'S2-02': ['S2-07'], 'S2-03': ['S2-09'], 'S2-05': ['S2-04'], 'S2-06': ['S2-01'],
  'S2-07': ['S3-03'], 'S2-08': ['S3-05'], 'S2-09': ['S2-05'], 'S2-10': ['S2-06'], 'S2-11': ['S2-08'],
  'S2-12': ['S2-10'], 'S2-13': ['S2-12'],
  'S3-01': ['S3-01'], 'S3-02': ['S3-06'], 'S3-03': ['S3-08'], 'S3-04': ['S3-09'], 'S3-05': ['S3-07'],
  'S3-08': ['S3-10'], 'S3-09': ['S4-05'],
  'S4-01': ['S4-01'], 'S4-02': ['S4-02'], 'S4-03': ['S4-03'], 'S4-04': ['S4-06'], 'S4-05': ['S4-07', 'S4-08'],
  'S5-01': ['S5-01'], 'S5-02': ['S5-03'], 'S5-03': ['S5-04'], 'S5-04': ['S5-05'], 'S5-05': ['S5-06'],
  'S5-06': ['S5-07'], 'S5-07': ['S5-08'], 'S5-08': ['S5-10'], 'S5-09': ['S5-11'],
  'S6-04': ['S6-06'],
};

/**
 * Маршрут V2 (2.0.0) → V2.1: шаги с тем же содержанием получили новые номера — деньги до покупок,
 * требования квестов подписки по порядку. Сохранения версии 2 переименовываются этой таблицей.
 */
export const V3_FROM_V2: Record<string, string> = {
  'S1-06': 'S1-10', 'S1-07': 'S1-06', 'S1-08': 'S1-07', 'S1-09': 'S1-08', 'S1-10': 'S1-09',
  'S3-06': 'S3-07', 'S3-07': 'S3-08', 'S3-08': 'S3-09',
  'S7-04': 'S7-05', 'S8-01': 'S8-03', 'S8-02': 'S8-01', 'S8-03': 'S9-02', 'S8-04': 'S9-03',
  'S9-02': 'S9-04', 'S9-03': 'S9-05',
};

function renamed<T>(map: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(map).map(([id, v]) => [V3_FROM_V2[id] ?? id, v]));
}

export function emptyProgress(): Progress {
  return { version: 3, steps: {}, levels: {}, notes: {}, updatedAt: new Date().toISOString() };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStatus = (v: unknown): v is StepStatus => v === 'done' || v === 'skipped';

function clampLevel(n: number): number {
  return Math.min(99, Math.max(1, Math.floor(n)));
}

function stringMap(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (isObject(v)) for (const [k, s] of Object.entries(v)) if (typeof s === 'string' && s.trim()) out[k] = s.slice(0, MAX_NOTE);
  return out;
}

function statusMap(v: unknown): Record<string, StepStatus> {
  const out: Record<string, StepStatus> = {};
  if (isObject(v)) for (const [k, s] of Object.entries(v)) if (isStatus(s)) out[k] = s;
  return out;
}

/** V1 → V2: переносит отметки и заметки по таблице, а полную копию старого прогресса кладёт в legacy. */
export function migrateV1(steps: Record<string, StepStatus>, notes: Record<string, string>) {
  const out: { steps: Record<string, StepStatus>; notes: Record<string, string> } = { steps: {}, notes: {} };
  for (const [v2, from] of Object.entries(V2_FROM_V1)) {
    const statuses = from.map((id) => steps[id]);
    if (statuses.every(isStatus)) out.steps[v2] = statuses.every((s) => s === 'skipped') ? 'skipped' : 'done';
    const text = from.map((id) => notes[id]).filter(Boolean).join('\n');
    if (text) out.notes[v2] = text.slice(0, MAX_NOTE);
  }
  return out;
}

export interface Normalized {
  progress: Progress;
  /** Сколько записей отброшено: неизвестные шаги, навыки или неверные значения. */
  dropped: number;
  /** Сохранение первой версии маршрута (V1) — отметки перенесены по таблице. */
  migrated: boolean;
}

/** Приводит похожее на прогресс к текущей форме. null — если это не прогресс вовсе. */
export function normalizeProgress(raw: unknown, known: Known): Normalized | null {
  if (!isObject(raw)) return null;
  if (!isObject(raw.steps) && !isObject(raw.levels) && !isObject(raw.notes)) return null;
  const p = emptyProgress();
  let dropped = 0;

  let steps = statusMap(raw.steps);
  let notes = stringMap(raw.notes);
  const fromV2 = raw.version === 2;
  const migrated = raw.version !== PROGRESS_VERSION && !fromV2;
  if (migrated) {
    p.legacy = { steps, notes };
    ({ steps, notes } = migrateV1(steps, notes));
  } else if (fromV2) {
    steps = renamed(steps);
    notes = renamed(notes);
  }

  const rawStepCount = isObject(raw.steps) ? Object.keys(raw.steps).length : 0;
  for (const [id, status] of Object.entries(steps)) {
    if (known.stepIds.has(id)) p.steps[id] = status;
    else dropped++;
  }
  if (!migrated) dropped += rawStepCount - Object.keys(steps).length;

  for (const [id, level] of Object.entries(isObject(raw.levels) ? raw.levels : {})) {
    const n = typeof level === 'number' ? level : typeof level === 'string' && level.trim() ? Number(level) : NaN;
    if (known.levelIds.has(id) && Number.isFinite(n)) p.levels[id] = clampLevel(n);
    else dropped++;
  }
  for (const [id, note] of Object.entries(notes)) {
    if (known.stepIds.has(id)) p.notes[id] = note;
    else if (!migrated) dropped++;
  }
  // Заметки не строкой (или пустые) отброшены ещё при чтении — их тоже считаем.
  if (!migrated && isObject(raw.notes)) dropped += Object.keys(raw.notes).length - Object.keys(notes).length;
  if (typeof raw.updatedAt === 'string' && !Number.isNaN(Date.parse(raw.updatedAt))) p.updatedAt = raw.updatedAt;

  if (!migrated) {
    if (raw.gameMode === 'f2p' || raw.gameMode === 'members') p.gameMode = raw.gameMode;
    const ids = (v: unknown) => (Array.isArray(v)
      ? [...new Set(v.filter((x): x is string => typeof x === 'string').map((x) => (fromV2 ? V3_FROM_V2[x] ?? x : x)).filter((x) => known.stepIds.has(x)))]
      : []);
    const reviewed = ids(raw.reviewedV2Steps);
    if (reviewed.length) p.reviewedV2Steps = reviewed;
    const kept = ids(raw.qpKept);
    if (kept.length) p.qpKept = kept;
    if (isObject(raw.legacy)) p.legacy = { steps: statusMap(raw.legacy.steps), notes: stringMap(raw.legacy.notes) };
  }
  return { progress: p, dropped, migrated };
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
  migrated: boolean;
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
  if (isObject(raw) && typeof raw.version === 'number' && raw.version > PROGRESS_VERSION) {
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
      migrated: n.migrated,
    },
  };
}

const touch = (p: Progress): Progress => ({ ...p, updatedAt: new Date().toISOString() });
const without = (list: string[] | undefined, id: string) => (list ?? []).filter((x) => x !== id);

/** Отметка шага. Выполненный заново шаг снимает «очки сохранены» — они снова считаются по отметке. */
export function withStep(p: Progress, id: string, status: StepStatus | null): Progress {
  const steps = { ...p.steps };
  if (status) steps[id] = status;
  else delete steps[id];
  const next: Progress = { ...p, steps };
  if (status === 'done' && p.qpKept?.includes(id)) next.qpKept = without(p.qpKept, id);
  return touch(next);
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

export function withGameMode(p: Progress, mode: GameMode): Progress {
  return touch({ ...p, gameMode: mode });
}

/** V2 Review: шаг проверен, предупреждение скрывается, отметка остаётся. */
export function withReviewed(p: Progress, ids: string[]): Progress {
  const reviewed = [...new Set([...(p.reviewedV2Steps ?? []), ...ids])];
  return touch({ ...p, reviewedV2Steps: reviewed });
}

/**
 * V2 Review: вернуть шаги в активные. Отметка снимается, но полученные в игре очки квестов не откатываются —
 * шаг попадает в qpKept, пока его не отметят снова.
 */
export function withReactivated(p: Progress, ids: string[], qpOf: (id: string) => number): Progress {
  const steps = { ...p.steps };
  const kept = new Set(p.qpKept ?? []);
  for (const id of ids) {
    if (steps[id] === 'done' && qpOf(id) > 0) kept.add(id);
    delete steps[id];
  }
  const next: Progress = { ...p, steps, reviewedV2Steps: [...new Set([...(p.reviewedV2Steps ?? []), ...ids])] };
  if (kept.size) next.qpKept = [...kept];
  return touch(next);
}

export function levelOf(p: Progress, id: string): number {
  return p.levels[id] ?? 1;
}

export function gameModeOf(p: Progress): GameMode {
  return p.gameMode ?? 'f2p';
}

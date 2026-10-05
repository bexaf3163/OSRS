// Progress: storage, JSON export and import, migration of old saves, pure updates.
// No relative value imports: the module is used by both the tests and the app.

import type { GameMode, ManualOwned, Progress, StepStatus } from '../types/index.ts';

export const STORAGE_KEY = 'osrs-put:progress';
export const EXPORT_APP = 'osrs-put';
export const PROGRESS_VERSION = 3;
const MAX_NOTE = 5000;

export interface Known {
  stepIds: Set<string>;
  levelIds: Set<string>;
}

/**
 * The old route (V1, from the old guide) to the current one. A step counts as done if all the listed V1 steps are done.
 * Only what is the same in substance by the "Done when" condition is carried over. The rest lies in progress.legacy.
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
 * The V2 route (2.0.0) to V2.1: steps with the same content got new numbers: money before purchases,
 * the members quest requirements in order. Version 2 saves are renamed by this table.
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

/** V1 to V2: carries over the marks and notes by the table, and puts a full copy of the old progress into legacy. */
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
  /** How many records were dropped: unknown steps, skills or invalid values. */
  dropped: number;
  /** A save of the route's first version (V1): the marks were carried over by the table. */
  migrated: boolean;
}

/** Brings something that looks like progress to the current shape. null if it is not progress at all. */
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
  // Notes that are not a string (or are empty) were dropped on reading: we count them too.
  if (!migrated && isObject(raw.notes)) dropped += Object.keys(raw.notes).length - Object.keys(notes).length;
  if (typeof raw.updatedAt === 'string' && !Number.isNaN(Date.parse(raw.updatedAt))) p.updatedAt = raw.updatedAt;
  // The times of completions: only for known steps that are done, and only real dates.
  if (isObject(raw.doneAt)) {
    const doneAt: Record<string, string> = {};
    for (const [id, at] of Object.entries(raw.doneAt)) {
      const sid = fromV2 ? V3_FROM_V2[id] ?? id : id;
      if (!migrated && known.stepIds.has(sid) && p.steps[sid] === 'done' && typeof at === 'string' && !Number.isNaN(Date.parse(at))) doneAt[sid] = at;
    }
    if (Object.keys(doneAt).length) p.doneAt = doneAt;
  }

  if (!migrated) {
    if (raw.gameMode === 'f2p' || raw.gameMode === 'members') p.gameMode = raw.gameMode;
    const ids = (v: unknown) => (Array.isArray(v)
      ? [...new Set(v.filter((x): x is string => typeof x === 'string').map((x) => (fromV2 ? V3_FROM_V2[x] ?? x : x)).filter((x) => known.stepIds.has(x)))]
      : []);
    const reviewed = ids(raw.reviewedV2Steps);
    if (reviewed.length) p.reviewedV2Steps = reviewed;
    const kept = ids(raw.qpKept);
    if (kept.length) p.qpKept = kept;
    const dismissed = ids(raw.upgradeDismissedForSteps);
    if (dismissed.length) p.upgradeDismissedForSteps = dismissed;
    const manual = ownedManualOf(raw.ownedManual);
    if (Object.keys(manual).length) p.ownedManual = manual;
    if (isObject(raw.legacy)) p.legacy = { steps: statusMap(raw.legacy.steps), notes: stringMap(raw.legacy.notes) };
  }
  return { progress: p, dropped, migrated };
}

export function loadProgress(storage: Pick<Storage, 'getItem'> | undefined, known: Known, key: string = STORAGE_KEY): Progress {
  try {
    const text = storage?.getItem(key);
    if (text) return normalizeProgress(JSON.parse(text), known)?.progress ?? emptyProgress();
  } catch {
    // A damaged record or unavailable storage: we start from a clean slate.
  }
  return emptyProgress();
}

export function saveProgress(storage: Pick<Storage, 'setItem'> | undefined, p: Progress, key: string = STORAGE_KEY): boolean {
  try {
    storage?.setItem(key, JSON.stringify(p));
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
    return { ok: false, error: 'This is not JSON. Choose a file saved with the "Export progress" button.' };
  }
  if (isObject(raw) && 'app' in raw && raw.app !== EXPORT_APP) {
    return { ok: false, error: 'The file was saved by another app.' };
  }
  if (isObject(raw) && typeof raw.version === 'number' && raw.version > PROGRESS_VERSION) {
    return { ok: false, error: 'The file was saved by a newer version of the app. Update the app and try again.' };
  }
  const n = normalizeProgress(raw, known);
  if (!n) return { ok: false, error: 'There is no progress in the file: no steps, levels or notes were found.' };
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

/** Marking a step. A step done again clears "points kept": they are counted from the mark again. */
export function withStep(p: Progress, id: string, status: StepStatus | null, opts: { stamp?: boolean } = {}): Progress {
  const steps = { ...p.steps };
  if (status) steps[id] = status;
  else delete steps[id];
  const next: Progress = { ...p, steps };
  // The time of a real completion, for the splits. Skipping or unmarking drops it; a bulk mark (stamp: false) has no time of its own.
  const doneAt = { ...p.doneAt };
  if (status === 'done' && opts.stamp !== false) doneAt[id] = new Date().toISOString();
  else if (status !== 'done') delete doneAt[id];
  if (Object.keys(doneAt).length) next.doneAt = doneAt;
  else delete next.doneAt;
  if (status === 'done' && p.qpKept?.includes(id)) next.qpKept = without(p.qpKept, id);
  return touch(next);
}

export function withLevel(p: Progress, id: string, level: number): Progress {
  return touch({ ...p, levels: { ...p.levels, [id]: clampLevel(level) } });
}

/** Several levels at once (levels from the game). With no changes it returns the same object: no file write is needed. */
export function withLevels(p: Progress, levels: Readonly<Record<string, number>>): Progress {
  const next = { ...p.levels };
  let changed = false;
  for (const [id, level] of Object.entries(levels)) {
    const v = clampLevel(level);
    if (next[id] !== v) { next[id] = v; changed = true; }
  }
  return changed ? touch({ ...p, levels: next }) : p;
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

/** "✕ Skip" on a gear upgrade hint: on this step it is no longer shown. The step's progress is not touched. */
export function withUpgradeDismissed(p: Progress, stepId: string, dismissed = true): Progress {
  const set = new Set(p.upgradeDismissedForSteps ?? []);
  if (dismissed) set.add(stepId);
  else set.delete(stepId);
  const next: Progress = { ...p };
  if (set.size) next.upgradeDismissedForSteps = [...set];
  else delete next.upgradeDismissedForSteps;
  return touch(next);
}

/** How much of an item the player can enter manually: there is no more in the game (a stack is up to 2,147,483,647). */
export const MAX_OWNED = 2_147_483_647;
const OWNED_KEY = /^(id:\d{1,9}|name:.{1,200})$/;

/** The manual "already have" values from a save: only valid keys and whole quantities from 0; the rest is dropped. */
export function ownedManualOf(v: unknown): Record<string, ManualOwned> {
  const out: Record<string, ManualOwned> = {};
  if (!isObject(v)) return out;
  for (const [key, raw] of Object.entries(v)) {
    if (!OWNED_KEY.test(key) || !isObject(raw)) continue;
    const count = raw.count;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0 || count > MAX_OWNED) continue;
    const at = typeof raw.updatedAt === 'string' && !Number.isNaN(Date.parse(raw.updatedAt)) ? raw.updatedAt : new Date(0).toISOString();
    out[key] = { count, updatedAt: at };
  }
  return out;
}

/**
 * "I already have it": how much of an item the player has, by their word. null removes the mark (count by the game again).
 * Junk (NaN, a fraction, a minus, infinity) is not saved: the progress does not change.
 */
export function withOwnedManual(p: Progress, key: string, count: number | null): Progress {
  const next: Record<string, ManualOwned> = { ...(p.ownedManual ?? {}) };
  if (count === null) {
    if (!(key in next)) return p;
    delete next[key];
  } else {
    if (!OWNED_KEY.test(key) || !Number.isFinite(count) || count < 0) return p;
    const n = Math.min(MAX_OWNED, Math.floor(count));
    if (next[key]?.count === n) return p;
    next[key] = { count: n, updatedAt: new Date().toISOString() };
  }
  const out: Progress = { ...p };
  if (Object.keys(next).length) out.ownedManual = next;
  else delete out.ownedManual;
  return touch(out);
}

/** V2 Review: the step is checked, the warning is hidden, the mark stays. */
export function withReviewed(p: Progress, ids: string[]): Progress {
  const reviewed = [...new Set([...(p.reviewedV2Steps ?? []), ...ids])];
  return touch({ ...p, reviewedV2Steps: reviewed });
}

/**
 * V2 Review: return steps to active. The mark is removed, but quest points received in the game are not rolled back:
 * the step goes to qpKept until it is marked again.
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

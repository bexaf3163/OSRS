// Choose valid saved sources before constructing an empty fallback. Invalid data has no timestamp and must never win by being read last.
import type { Progress } from '../types';
import { emptyProgress, normalizeProgress, type Known } from './progress';
import { inspectProgress } from '../../electron/saved-data.mjs';

export type ProgressSource =
  | { kind: 'missing' | 'invalid' | 'unsupported' }
  | { kind: 'valid'; progress: Progress; savedAt: number };

export function readProgressText(text: string | null, known: Known): ProgressSource {
  if (text === null) return { kind: 'missing' };
  try {
    const raw: unknown = JSON.parse(text);
    const kind = inspectProgress(raw);
    if (kind !== 'valid') return { kind };
    const data = raw as Record<string, unknown>;
    const n = normalizeProgress(data, known);
    if (!n) return { kind: 'invalid' };
    const at = typeof data.updatedAt === 'string' ? Date.parse(data.updatedAt) : NaN;
    return { kind: 'valid', progress: n.progress, savedAt: Number.isFinite(at) ? at : 0 };
  } catch {
    return { kind: 'invalid' };
  }
}

export interface RestoredProgress {
  progress: Progress;
  writable: boolean;
  /** Explicit import/reset can replace protected sources only after their original text was preserved. */
  preserved: boolean;
  warning: string | null;
}

type SavedStorage = Pick<Storage, 'getItem' | 'setItem'>;

function preserve(storage: SavedStorage | undefined, key: string, raw: string): boolean {
  try {
    if (!storage) return false;
    const saved = storage.getItem(key);
    if (saved === raw) return true;
    if (saved !== null) return false;
    storage.setItem(key, raw);
    return storage.getItem(key) === raw;
  } catch { return false; }
}

/** Recovery copies are scoped to the profile key. No progress file is written by this reader. */
export function restoreProgress(storage: SavedStorage | undefined, known: Known, key: string, loadFile?: () => string | null): RestoredProgress {
  let localText: string | null = null;
  let fileText: string | null = null;
  let unreadable = false;
  try { localText = storage?.getItem(key) ?? null; } catch { unreadable = true; }
  try { fileText = loadFile?.() ?? null; } catch { unreadable = true; }
  const local = readProgressText(localText, known);
  const file = readProgressText(fileText, known);
  let preserved = !unreadable;
  for (const [source, raw, suffix] of [[local, localText, 'local'], [file, fileText, 'file']] as const) {
    if (raw !== null && (source.kind === 'invalid' || source.kind === 'unsupported')) {
      preserved = preserve(storage, `${key}:recovery:${suffix}`, raw) && preserved;
    }
  }
  const chosen = file.kind === 'valid' && (local.kind !== 'valid' || file.savedAt > local.savedAt) ? file
    : local.kind === 'valid' ? local : null;
  const unsupported = local.kind === 'unsupported' || file.kind === 'unsupported';
  const damaged = !chosen && (local.kind === 'invalid' || file.kind === 'invalid');
  const writable = preserved && !unsupported && !damaged;
  const warning = writable ? null : unsupported
    ? 'Automatic saving is paused: a saved progress format is not supported. Update the app, or explicitly import a compatible backup in Settings.'
    : 'Automatic saving is paused to protect your saved progress. Export any temporary changes, then restore a backup in Settings.';
  return { progress: chosen?.progress ?? emptyProgress(), writable, preserved, warning };
}

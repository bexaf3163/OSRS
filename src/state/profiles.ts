// The profile store: window storage and the desktop file, conflict resolution, saving and switching.
import { useSyncExternalStore } from 'react';
import { desktop } from '../services/desktop';
import { validProfileText } from '../../electron/saved-data.mjs';
import { MAX_PROFILES, same, type Profile, type ProfilesState, PROFILES_KEY, parseProfiles, type ProfileGate, profileGate } from '../domain/persistence/profiles';

/** Storage protection is separate from the pure character-matching rule above. */
export const guardedProfileGate = (s: ProfilesState, player: string | null): ProfileGate => sourceProtected
  ? { kind: 'protected', ...(sourceConflict ? { reason: 'conflict' as const } : {}) }
  : profileGate(s, player);

// ---- Window storage ----

let cache: ProfilesState | null = null;
let sourceProtected = false;
let sourceConflict = false;
/** Other reasons than a conflict between two supported lists: damage, a newer format, an unpreserved original. A choice cannot release these. */
let otherProtection = false;
let conflictTexts: { local: string; file: string } | null = null;
let saveError: string | null = null;
let pendingSave: ProfilesState | null = null;
const listeners = new Set<() => void>();
const notify = () => { for (const l of listeners) l(); };

function saveNativeProfiles(raw: string): boolean {
  try {
    const api = desktop();
    if (api?.saveProfilesFileChecked) {
      if (api.saveProfilesFileChecked(raw)?.ok !== true) throw Error('Native write failed');
    } else api?.saveProfilesFile?.(raw);
    return true;
  } catch {
    saveError = 'The profile file could not be saved. The current profile stays open; retry before switching or restarting.';
    return false;
  }
}

function preserveProfiles(key: string, raw: string): boolean {
  try {
    const previous = localStorage.getItem(key);
    if (previous === null) localStorage.setItem(key, raw);
    return localStorage.getItem(key) === raw;
  } catch { return false; }
}

function versionedProfiles(raw: string | null): boolean {
  try { const data: unknown = JSON.parse(raw ?? 'null'); return Boolean(data && typeof data === 'object' && Object.hasOwn(data, 'version')); }
  catch { return false; }
}

/** Compare supported lists by identity/content, not object formatting or display order. */
function profileContents(raw: string | null): string {
  const s = parseProfiles(raw);
  return JSON.stringify({ active: s.active, list: [...s.list].sort((a, b) => a.id.localeCompare(b.id)) });
}

export function readProfiles(): ProfilesState {
  if (!cache) {
    let raw: string | null = null, file: string | null = null;
    try { raw = localStorage.getItem(PROFILES_KEY); } catch { sourceProtected = true; }
    // Inspect both sources before a valid browser list is allowed to mirror over the native file.
    try { file = desktop()?.loadProfilesFile?.() ?? null; } catch { sourceProtected = true; }
    const localValid = validProfileText(raw), fileValid = validProfileText(file);
    const damagedLocal = raw !== null && !localValid;
    const damagedFile = file !== null && !fileValid;
    sourceConflict = localValid && fileValid && profileContents(raw) !== profileContents(file);
    const preserved = !damagedLocal || preserveProfiles(`${PROFILES_KEY}:recovery`, raw!);
    if (damagedFile || sourceConflict) preserveProfiles(`${PROFILES_KEY}:recovery:file`, file!);
    otherProtection = sourceProtected || damagedFile || versionedProfiles(raw) || !preserved || (!localValid && !fileValid && damagedLocal);
    sourceProtected ||= sourceConflict || otherProtection;
    conflictTexts = sourceConflict ? { local: raw!, file: file! } : null;
    cache = parseProfiles(localValid ? raw : fileValid ? file : null);
    if (localValid && !sourceProtected) {
      // Profiles saved before the file existed: it is written once, so the copies carry the list too.
      if (!saveNativeProfiles(JSON.stringify(cache))) pendingSave = cache;
    }
  }
  return cache;
}

/** The two supported lists that disagree, while that is the only reason profile saving is paused; null otherwise. */
export function profileConflict(): { local: ProfilesState; file: ProfilesState; merged: ProfilesState | null } | null {
  readProfiles();
  if (!sourceConflict || otherProtection || !conflictTexts) return null;
  const local = parseProfiles(conflictTexts.local), file = parseProfiles(conflictTexts.file);
  return { local, file, merged: mergeProfiles(local, file) };
}

/**
 * Both lists in one: every profile of either, this window's active one. Null when one profile id is bound to two different characters:
 * then only the player can say which binding is right.
 */
export function mergeProfiles(local: ProfilesState, file: ProfilesState): ProfilesState | null {
  const list: Profile[] = local.list.map((p) => ({ ...p }));
  for (const f of file.list) {
    const l = list.find((p) => p.id === f.id);
    if (!l) { list.push({ ...f }); continue; }
    if (l.player && f.player && !same(l.player, f.player)) return null;
    if (!l.player && f.player) l.player = f.player;
  }
  if (list.length > MAX_PROFILES) return null;
  return { active: local.active, list };
}

/**
 * The player's answer to a profile-list conflict. Both originals are kept as recovery copies first; the chosen list is then written to both
 * sources and the window reloads with it. Refused (false) when anything but the conflict protects the sources, or a copy cannot be kept.
 */
export function resolveProfileConflict(choice: 'merge' | 'local' | 'file'): boolean {
  const c = profileConflict();
  if (!c || !conflictTexts) return false;
  const next = choice === 'merge' ? c.merged : choice === 'local' ? c.local : c.file;
  if (!next) return false;
  if (!preserveProfiles(`${PROFILES_KEY}:recovery:local`, conflictTexts.local) || !preserveProfiles(`${PROFILES_KEY}:recovery:file`, conflictTexts.file)) return false;
  const raw = JSON.stringify(next);
  if (!saveNativeProfiles(raw)) { notify(); return false; }
  try { localStorage.setItem(PROFILES_KEY, raw); }
  catch {
    saveError = 'The browser profile copy could not be saved. The file already has the chosen list; retry before switching or restarting.';
    notify();
    return false;
  }
  cache = next;
  sourceConflict = false;
  sourceProtected = false;
  conflictTexts = null;
  saveError = null;
  notify();
  try { location.reload(); } catch { /* there is no reload in tests */ }
  return true;
}

/** Publish after persistent sources accept the edit; an accepted active-profile change then reloads its progress. */
export function writeProfiles(s: ProfilesState): boolean {
  readProfiles();
  if (sourceProtected) return false;
  const changedActive = cache!.active !== s.active;
  pendingSave = s;
  const raw = JSON.stringify(s);
  if (!saveNativeProfiles(raw)) { notify(); return false; }
  try { localStorage.setItem(PROFILES_KEY, raw); }
  catch {
    saveError = 'The browser profile copy could not be saved. The current profile stays open; retry before switching or restarting.';
    notify();
    return false;
  }
  cache = s;
  pendingSave = null;
  saveError = null;
  notify();
  if (changedActive) {
    try { location.reload(); } catch { /* there is no reload in tests */ }
  }
  return true;
}

export function subscribeProfiles(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useProfiles(): ProfilesState {
  return useSyncExternalStore(subscribeProfiles, readProfiles, readProfiles);
}

export const profileSaveError = (): string | null => saveError;
export const useProfileSaveError = (): string | null => useSyncExternalStore(subscribeProfiles, profileSaveError, profileSaveError);

export function retryProfileSave(): void {
  const next = pendingSave ?? readProfiles();
  writeProfiles(next);
}

/** Switch the profile: the window reloads, and progress is read again from the key and file of the new profile. */
export function switchProfile(id: string): void {
  const s = readProfiles();
  if (!s.list.some((p) => p.id === id) || s.active === id) return;
  writeProfiles({ ...s, active: id });
}

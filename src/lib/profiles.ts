// Profiles: several characters, each with its own progress. The first profile ("Main") is stored where it was
// before (the key and the file did not change), so nothing is lost. The others are under the key progress:p:<id> and the file
// progress-<id>.json. The app recognises the character by the name from the game (the plugin, protocol 5): the first character seen
// is bound to a profile without a name, and another one does not write levels and marks into it until the player chooses.

import { useSyncExternalStore } from 'react';

export interface Profile {
  id: string;
  name: string;
  /** The character's name in the game: the profile is chosen by it automatically. */
  player?: string;
}

export interface ProfilesState {
  active: string;
  list: Profile[];
}

export const PROFILES_KEY = 'osrs-put:profiles';
export const MAIN_ID = 'main';
const MAX_PROFILES = 8;
const ID = /^[a-z0-9]{1,12}$/;

export const defaultProfiles = (): ProfilesState => ({ active: MAIN_ID, list: [{ id: MAIN_ID, name: 'Main' }] });

/** The window storage key for a profile's progress: the main one keeps the old one. */
export function profileStorageKey(base: string, id: string): string {
  return id === MAIN_ID ? base : `${base}:p:${id}`;
}

/** The progress file name of a profile next to the app's data. */
export function profileFileName(id: string): string {
  return id === MAIN_ID ? 'progress.json' : `progress-${id}.json`;
}

const clean = (s: unknown, max: number): string => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max) : '');
const same = (a?: string, b?: string): boolean => Boolean(a && b && a.toLowerCase() === b.toLowerCase());
/** The default names that versions before 2.28 saved in Russian (written as escapes so that no Cyrillic stays in the source): they become the English defaults. */
const LEGACY_NAMES: Record<string, string> = { '\u041e\u0441\u043d\u043e\u0432\u043d\u043e\u0439': 'Main', '\u041f\u0440\u043e\u0444\u0438\u043b\u044c': 'Profile' };

/** What is saved; a broken or extra one falls back to the default; "Main" is always there, the active one is always from the list. */
export function parseProfiles(raw: string | null): ProfilesState {
  const out = defaultProfiles();
  try {
    const data = raw ? (JSON.parse(raw) as { active?: unknown; list?: unknown }) : null;
    if (!data || !Array.isArray(data.list)) return out;
    const seen = new Set<string>();
    const list: Profile[] = [];
    for (const r of data.list.slice(0, MAX_PROFILES)) {
      const o = r as { id?: unknown; name?: unknown; player?: unknown } | null;
      const id = typeof o?.id === 'string' && ID.test(o.id) ? o.id : '';
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const player = clean(o?.player, 12);
      const saved = clean(o?.name, 30);
      list.push({ id, name: LEGACY_NAMES[saved] ?? (saved || (id === MAIN_ID ? 'Main' : 'Profile')), ...(player ? { player } : {}) });
    }
    if (!seen.has(MAIN_ID)) list.unshift({ id: MAIN_ID, name: 'Main' });
    const active = typeof data.active === 'string' && list.some((p) => p.id === data.active) ? data.active : MAIN_ID;
    return { active, list: list.slice(0, MAX_PROFILES) };
  } catch {
    return out;
  }
}

export const activeOf = (s: ProfilesState): Profile => s.list.find((p) => p.id === s.active) ?? s.list[0];

export function addProfile(s: ProfilesState, name: string, player?: string): { state: ProfilesState; id: string } | null {
  if (s.list.length >= MAX_PROFILES) return null;
  let id = '';
  do id = Math.random().toString(36).slice(2, 8); while (!id || s.list.some((p) => p.id === id));
  const nm = clean(name, 30) || 'Profile';
  const pl = clean(player, 12);
  return { state: { ...s, list: [...s.list, { id, name: nm, ...(pl ? { player: pl } : {}) }] }, id };
}

export function renameProfile(s: ProfilesState, id: string, name: string): ProfilesState {
  const nm = clean(name, 30);
  return nm ? { ...s, list: s.list.map((p) => (p.id === id ? { ...p, name: nm } : p)) } : s;
}

/** Delete a profile (the main one cannot be deleted). If it was active, the main one becomes active. */
export function removeProfile(s: ProfilesState, id: string): ProfilesState {
  if (id === MAIN_ID) return s;
  return { active: s.active === id ? MAIN_ID : s.active, list: s.list.filter((p) => p.id !== id) };
}

export function linkPlayer(s: ProfilesState, id: string, player: string | null): ProfilesState {
  const pl = clean(player, 12);
  return { ...s, list: s.list.map((p) => (p.id === id ? { id: p.id, name: p.name, ...(pl ? { player: pl } : {}) } : p)) };
}

/** What to do when the game reported a character's name. */
export type ProfileGate =
  /** The name is unknown (not in the game, an old plugin): nothing hinders. */
  | { kind: 'unknown' }
  /** The active profile belongs to this character. */
  | { kind: 'ok'; player: string }
  /** The active profile has no name: bind the first character seen. */
  | { kind: 'link'; player: string }
  /** This character is in another profile: offer to switch. */
  | { kind: 'switch'; player: string; profile: Profile }
  /** A new character: offer to create a profile. */
  | { kind: 'new'; player: string };

export function profileGate(s: ProfilesState, player: string | null): ProfileGate {
  if (!player) return { kind: 'unknown' };
  const active = activeOf(s);
  if (same(active.player, player)) return { kind: 'ok', player };
  const other = s.list.find((p) => p.id !== active.id && same(p.player, player));
  if (other) return { kind: 'switch', player, profile: other };
  return active.player ? { kind: 'new', player } : { kind: 'link', player };
}

/** Can levels and marks from the game be written to the active profile? */
export const gateAllows = (g: ProfileGate): boolean => g.kind === 'unknown' || g.kind === 'ok' || g.kind === 'link';

// ---- Window storage ----

let cache: ProfilesState | null = null;
const listeners = new Set<() => void>();

export function readProfiles(): ProfilesState {
  if (!cache) {
    let raw: string | null = null;
    try { raw = localStorage.getItem(PROFILES_KEY); } catch { /* no storage */ }
    cache = parseProfiles(raw);
  }
  return cache;
}

export function writeProfiles(s: ProfilesState): void {
  cache = s;
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(s)); } catch { /* it is remembered until restart */ }
  for (const l of listeners) l();
}

export function subscribeProfiles(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useProfiles(): ProfilesState {
  return useSyncExternalStore(subscribeProfiles, readProfiles, readProfiles);
}

/** Switch the profile: the window reloads, and progress is read again from the key and file of the new profile. */
export function switchProfile(id: string): void {
  const s = readProfiles();
  if (!s.list.some((p) => p.id === id) || s.active === id) return;
  writeProfiles({ ...s, active: id });
  try { location.reload(); } catch { /* there is no reload in tests */ }
}

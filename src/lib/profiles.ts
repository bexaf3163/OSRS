// Профили: несколько персонажей — у каждого свой прогресс. Первый профиль («Основной») хранится там же, где и
// раньше (ключ и файл не менялись), поэтому ничего не теряется. Остальные — в ключе progress:p:<id> и файле
// progress-<id>.json. Программа узнаёт персонажа по имени из игры (плагин, протокол 5): первый увиденный
// персонаж привязывается к профилю без имени, чужой — не пишет в него уровни и отметки, пока игрок не выберет.

import { useSyncExternalStore } from 'react';

export interface Profile {
  id: string;
  name: string;
  /** Имя персонажа в игре — по нему профиль выбирается сам. */
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

export const defaultProfiles = (): ProfilesState => ({ active: MAIN_ID, list: [{ id: MAIN_ID, name: 'Основной' }] });

/** Ключ хранилища окна для прогресса профиля: у основного прежний. */
export function profileStorageKey(base: string, id: string): string {
  return id === MAIN_ID ? base : `${base}:p:${id}`;
}

/** Имя файла прогресса профиля рядом с данными программы. */
export function profileFileName(id: string): string {
  return id === MAIN_ID ? 'progress.json' : `progress-${id}.json`;
}

const clean = (s: unknown, max: number): string => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max) : '');
const same = (a?: string, b?: string): boolean => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

/** Сохранённое, а битое или лишнее — по умолчанию; «Основной» есть всегда, активный — всегда из списка. */
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
      list.push({ id, name: clean(o?.name, 30) || (id === MAIN_ID ? 'Основной' : 'Профиль'), ...(player ? { player } : {}) });
    }
    if (!seen.has(MAIN_ID)) list.unshift({ id: MAIN_ID, name: 'Основной' });
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
  const nm = clean(name, 30) || 'Профиль';
  const pl = clean(player, 12);
  return { state: { ...s, list: [...s.list, { id, name: nm, ...(pl ? { player: pl } : {}) }] }, id };
}

export function renameProfile(s: ProfilesState, id: string, name: string): ProfilesState {
  const nm = clean(name, 30);
  return nm ? { ...s, list: s.list.map((p) => (p.id === id ? { ...p, name: nm } : p)) } : s;
}

/** Удалить профиль (основной нельзя). Если он был активным — активным станет основной. */
export function removeProfile(s: ProfilesState, id: string): ProfilesState {
  if (id === MAIN_ID) return s;
  return { active: s.active === id ? MAIN_ID : s.active, list: s.list.filter((p) => p.id !== id) };
}

export function linkPlayer(s: ProfilesState, id: string, player: string | null): ProfilesState {
  const pl = clean(player, 12);
  return { ...s, list: s.list.map((p) => (p.id === id ? { id: p.id, name: p.name, ...(pl ? { player: pl } : {}) } : p)) };
}

/** Что делать, когда игра сообщила имя персонажа. */
export type ProfileGate =
  /** Имя неизвестно (не в игре, старый плагин) — ничего не мешает. */
  | { kind: 'unknown' }
  /** Активный профиль — этого персонажа. */
  | { kind: 'ok'; player: string }
  /** Активный профиль без имени: привяжем первого увиденного персонажа. */
  | { kind: 'link'; player: string }
  /** Этот персонаж — в другом профиле: предложить переключиться. */
  | { kind: 'switch'; player: string; profile: Profile }
  /** Новый персонаж: предложить создать профиль. */
  | { kind: 'new'; player: string };

export function profileGate(s: ProfilesState, player: string | null): ProfileGate {
  if (!player) return { kind: 'unknown' };
  const active = activeOf(s);
  if (same(active.player, player)) return { kind: 'ok', player };
  const other = s.list.find((p) => p.id !== active.id && same(p.player, player));
  if (other) return { kind: 'switch', player, profile: other };
  return active.player ? { kind: 'new', player } : { kind: 'link', player };
}

/** Уровни и отметки из игры можно писать в активный профиль? */
export const gateAllows = (g: ProfileGate): boolean => g.kind === 'unknown' || g.kind === 'ok' || g.kind === 'link';

// ---- Хранилище окна ----

let cache: ProfilesState | null = null;
const listeners = new Set<() => void>();

export function readProfiles(): ProfilesState {
  if (!cache) {
    let raw: string | null = null;
    try { raw = localStorage.getItem(PROFILES_KEY); } catch { /* нет хранилища */ }
    cache = parseProfiles(raw);
  }
  return cache;
}

export function writeProfiles(s: ProfilesState): void {
  cache = s;
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(s)); } catch { /* запомнится до перезапуска */ }
  for (const l of listeners) l();
}

export function subscribeProfiles(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useProfiles(): ProfilesState {
  return useSyncExternalStore(subscribeProfiles, readProfiles, readProfiles);
}

/** Переключить профиль: окно перезагружается, прогресс читается заново из ключа и файла нового профиля. */
export function switchProfile(id: string): void {
  const s = readProfiles();
  if (!s.list.some((p) => p.id === id) || s.active === id) return;
  writeProfiles({ ...s, active: id });
  try { location.reload(); } catch { /* в тестах перезагрузки нет */ }
}

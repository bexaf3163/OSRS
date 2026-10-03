// Единое состояние игрока: уровни, предметы, монеты, квесты, положение, режим — один снимок на всю программу.
// Готовность, закупки, подготовка, цель навигации и сводка изменений читают его, а не каждый свои куски bridge/store.
//
// Главное правило: «неизвестно» — не «нет». У каждого значения есть три исхода: известно (откуда), неизвестно.
// Предмет — PRESENT (есть), MISSING (точно нет: известны и сумка, и банк), UNKNOWN (банк не открывали, а в сумке нет).

import type { GameMode, PlayerStats, Progress } from '../types';
import type { GearState } from '../services/runeliteBridge';
import { nameKey, type OwnedState } from './checklist';

export type StateSource = 'game' | 'profile' | 'manual';

export type Known<T> = { known: true; value: T; source: StateSource } | { known: false };

export const unknown = { known: false } as const;
const known = <T>(value: T, source: StateSource): Known<T> => ({ known: true, value, source });

export interface WorldPoint { x: number; y: number; plane: number }

export interface PlayerState {
  mode: GameMode;
  /** Есть живая связь с игрой: без неё всё из игры — «неизвестно», а не «ноль». */
  connected: boolean;
  player: string | null;
  levels: Record<string, Known<number>>;
  coins: { bag: Known<number>; bank: Known<number> };
  /** Названия квестов, засчитанных в игре. */
  quests: Known<string[]>;
  position: Known<WorldPoint>;
  /** Банк в этой сессии открывали: только тогда «нет в сумке» значит «нет совсем». */
  bankSeen: boolean;
  /** Что надето: слот → название. */
  equipment: Record<string, string>;
  /** Ручные отметки «уже есть» из закупок (ключ строки списка → количество). */
  manual: Record<string, number>;
  owned: OwnedState | null;
  /** Короткий отпечаток для мемоизации: меняется, только когда изменилось то, что влияет на расчёты. */
  fingerprint: string;
}

export interface PlayerStateInput {
  mode: GameMode;
  stats: PlayerStats | null;
  progress: Pick<Progress, 'levels'> & { ownedManual?: Record<string, { count: number }> };
  owned: OwnedState | null;
  gear: GearState | null;
  questsDone: string[] | null;
  position?: WorldPoint | null;
  connected?: boolean;
  player?: string | null;
}

/** Уровни из игры главнее введённых вручную; нет ни тех ни других — неизвестно. */
export function levelsOf(stats: PlayerStats | null, profile: Record<string, number>): Record<string, Known<number>> {
  const out: Record<string, Known<number>> = {};
  for (const [k, v] of Object.entries(profile)) if (typeof v === 'number' && Number.isFinite(v)) out[k] = known(v, 'profile');
  if (stats) for (const [k, v] of Object.entries(stats)) if (typeof v === 'number' && Number.isFinite(v)) out[k] = known(v, 'game');
  return out;
}

export function buildPlayerState(i: PlayerStateInput): PlayerState {
  const live = i.connected ?? (i.stats !== null || i.owned !== null || i.gear !== null);
  const equipment: Record<string, string> = {};
  for (const g of i.gear?.equipment ?? []) if (g.slot) equipment[g.slot] = g.name;
  const manual: Record<string, number> = {};
  for (const [k, v] of Object.entries(i.progress.ownedManual ?? {})) if (typeof v?.count === 'number') manual[k] = v.count;
  const coins = {
    bag: i.gear && i.gear.coins !== null ? known(i.gear.coins, 'game') : unknown,
    bank: i.gear && i.gear.bankCoins !== null ? known(i.gear.bankCoins, 'game') : unknown,
  };
  const state: PlayerState = {
    mode: i.mode,
    connected: live,
    player: i.player ?? null,
    levels: levelsOf(i.stats, i.progress.levels ?? {}),
    coins,
    quests: i.questsDone ? known(i.questsDone, 'game') : unknown,
    position: i.position ? known(i.position, 'game') : unknown,
    bankSeen: i.owned?.bankSeen === true,
    equipment,
    manual,
    owned: i.owned,
    fingerprint: '',
  };
  state.fingerprint = fingerprintOf(state);
  return state;
}

function fingerprintOf(s: PlayerState): string {
  const lv = Object.entries(s.levels).map(([k, v]) => `${k}${v.known ? v.value : '?'}`).sort().join(',');
  const items = s.owned ? [...s.owned.items.entries()].map(([k, o]) => `${k}:${o.carried}/${o.noted}/${o.bank ?? '?'}`).sort().join(';') : '-';
  const c = (k: Known<number>) => (k.known ? k.value : '?');
  const q = s.quests.known ? s.quests.value.length : '?';
  const eq = Object.entries(s.equipment).map(([k, v]) => `${k}=${v}`).sort().join(',');
  const man = Object.entries(s.manual).map(([k, v]) => `${k}=${v}`).sort().join(',');
  return [s.mode, s.connected ? 1 : 0, s.bankSeen ? 1 : 0, lv, c(s.coins.bag), c(s.coins.bank), q, eq, man, items].join('|');
}

/** Уровень навыка; undefined — неизвестен. */
export function levelOf(s: PlayerState, skill: string): number | undefined {
  const l = s.levels[skill];
  return l?.known ? l.value : undefined;
}

export type Presence = 'PRESENT' | 'MISSING' | 'UNKNOWN';

export interface Held {
  presence: Presence;
  /** В сумке и на себе (банкноты отдельно). */
  bag: number | null;
  noted: number;
  /** null — банк в этой сессии не открывали. */
  bank: number | null;
  /** Из них надето (только для показа: в bag оно уже входит). */
  equipped: number;
  /** Сумма всего известного; null — известно не всё и в сумке нет ничего. */
  total: number | null;
  source: StateSource | 'none';
}

/**
 * Сколько предмета у игрока. Игра знает и сумку, и банк — это главное. Банк неизвестен: слова игрока («у меня уже есть N»)
 * считаются, сумка их не опровергает; иначе в сумке есть — известно «есть», а нет — UNKNOWN, не MISSING.
 */
export function heldOf(s: Pick<PlayerState, 'owned' | 'equipment' | 'manual' | 'bankSeen'>, nameEn: string, manualKey?: string): Held {
  const o = s.owned?.items.get(nameKey(nameEn));
  const equipped = Object.values(s.equipment).filter((n) => nameKey(n) === nameKey(nameEn)).length;
  const manual = manualKey ? s.manual[manualKey] : undefined;
  // Игра знает всё — и сумку, и банк: отметки игрока не нужны.
  if (o && s.bankSeen) {
    const bag = o.carried;
    const bank = o.bank ?? 0;
    const total = bag + o.noted + bank;
    return { presence: total > 0 ? 'PRESENT' : 'MISSING', bag, noted: o.noted, bank, equipped, total, source: 'game' };
  }
  // Отметка игрока: сумка из игры её не опровергает (остальное может лежать в банке), но и не уменьшает.
  // «У меня 0» — тоже слово игрока: нет, а не «не знаю».
  if (manual !== undefined) {
    const total = Math.max(manual, (o?.carried ?? 0) + (o?.noted ?? 0));
    return { presence: total > 0 ? 'PRESENT' : 'MISSING', bag: o ? o.carried : null, noted: o?.noted ?? 0, bank: null, equipped, total, source: 'manual' };
  }
  // Банк неизвестен: что лежит в сумке — известно, а нет в сумке — «не проверено», не «нет».
  if (o && o.carried + o.noted > 0) return { presence: 'PRESENT', bag: o.carried, noted: o.noted, bank: null, equipped, total: o.carried + o.noted, source: 'game' };
  // Плагин присылает только предметы, за которыми следит (шаг, закупки): нет записи — не «нет предмета», а «не следили».
  return { presence: 'UNKNOWN', bag: o ? o.carried : null, noted: o?.noted ?? 0, bank: null, equipped, total: null, source: 'none' };
}

export type QuestPresence = 'DONE' | 'NOT_DONE' | 'UNKNOWN';

/** Квест засчитан в игре; список неизвестен — UNKNOWN. */
export function questOf(s: PlayerState, quest: string): QuestPresence {
  if (!s.quests.known) return 'UNKNOWN';
  return s.quests.value.some((q) => nameKey(q) === nameKey(quest)) ? 'DONE' : 'NOT_DONE';
}

export function coinsOf(s: PlayerState): { bag: number | null; bank: number | null; total: number | null } {
  const bag = s.coins.bag.known ? s.coins.bag.value : null;
  const bank = s.coins.bank.known ? s.coins.bank.value : null;
  return { bag, bank, total: bag === null || bank === null ? null : bag + bank };
}

// ---------------------------------------------------------------------------
// Что изменилось между двумя снимками — для пересчёта подготовки и сводки «27 → 30 Defence».

export type StateChange =
  | { kind: 'LEVEL'; skill: string; from: number; to: number }
  | { kind: 'ITEM'; name: string; from: number; to: number }
  | { kind: 'COINS'; where: 'bag' | 'bank'; from: number; to: number }
  | { kind: 'QUEST'; name: string }
  | { kind: 'MODE'; from: GameMode; to: GameMode }
  | { kind: 'CONNECTION'; connected: boolean };

const ITEM_CHANGE_LIMIT = 40;

export function diffPlayerState(prev: PlayerState | null, next: PlayerState): StateChange[] {
  if (!prev || prev.fingerprint === next.fingerprint) return [];
  const out: StateChange[] = [];
  if (prev.mode !== next.mode) out.push({ kind: 'MODE', from: prev.mode, to: next.mode });
  if (prev.connected !== next.connected) out.push({ kind: 'CONNECTION', connected: next.connected });
  // Только когда известно и раньше, и теперь: «неизвестно → известно» не прибавка, а появление данных.
  for (const [skill, now] of Object.entries(next.levels)) {
    const before = prev.levels[skill];
    if (before?.known && now.known && before.value !== now.value) out.push({ kind: 'LEVEL', skill, from: before.value, to: now.value });
  }
  for (const where of ['bag', 'bank'] as const) {
    const a = prev.coins[where];
    const b = next.coins[where];
    if (a.known && b.known && a.value !== b.value) out.push({ kind: 'COINS', where, from: a.value, to: b.value });
  }
  if (prev.quests.known && next.quests.known) {
    const had = new Set(prev.quests.value.map(nameKey));
    for (const q of next.quests.value) if (!had.has(nameKey(q))) out.push({ kind: 'QUEST', name: q });
  }
  if (prev.owned && next.owned) {
    const total = (o: { carried: number; noted: number; bank?: number }, seen: boolean) => o.carried + o.noted + (seen ? o.bank ?? 0 : 0);
    // Банк открыли или закрыли — суммы несравнимы, считаем только сумку.
    const withBank = prev.bankSeen && next.bankSeen;
    const names = new Set([...prev.owned.items.keys(), ...next.owned.items.keys()]);
    let n = 0;
    for (const k of names) {
      const a = prev.owned.items.get(k);
      const b = next.owned.items.get(k);
      const from = a ? (withBank ? total(a, true) : a.carried + a.noted) : 0;
      const to = b ? (withBank ? total(b, true) : b.carried + b.noted) : 0;
      if (from !== to && n++ < ITEM_CHANGE_LIMIT) out.push({ kind: 'ITEM', name: b?.name ?? a?.name ?? k, from, to });
    }
  }
  return out;
}

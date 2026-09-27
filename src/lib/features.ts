// Помощники этапа 3 в приложении: их можно выключить в настройках, и тогда они не только прячутся,
// но и ничего не делают — не ищут координаты, не шлют предметы этапа в RuneLite, не предлагают апгрейды.
// То, что происходит в самой игре, выключается ещё и в настройках плагина OSRS Path Bridge.

import { useSyncExternalStore } from 'react';

export interface Features {
  /** 📍 у мест в досье вики: карта и стрелка в игре. */
  autoLocation: boolean;
  /** Подсветка предметов этапа в банке (плагин OSRS Path Bridge). Ключ прежний — сохранённый выбор не теряется. */
  bankTags: boolean;
  /** Темп прокачки из игры в карточке шага. */
  pacing: boolean;
  /** Подсказка быстрого апгрейда инструмента или оружия. */
  upgradeRouter: boolean;
}

export const FEATURES_KEY = 'osrs-put:features';
export const DEFAULT_FEATURES: Features = { autoLocation: true, bankTags: true, pacing: true, upgradeRouter: true };

/** Сохранённое, а незнакомое и битое — по умолчанию (новая функция включена). */
export function parseFeatures(raw: string | null): Features {
  const out = { ...DEFAULT_FEATURES };
  try {
    const data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    for (const key of Object.keys(out) as (keyof Features)[]) {
      if (typeof data?.[key] === 'boolean') out[key] = data[key];
    }
  } catch {
    // Мусор в хранилище — по умолчанию.
  }
  return out;
}

let current: Features | null = null;
const listeners = new Set<() => void>();

function read(): Features {
  if (!current) {
    let raw: string | null = null;
    try { raw = localStorage.getItem(FEATURES_KEY); } catch { /* нет хранилища */ }
    current = parseFeatures(raw);
  }
  return current;
}

export function setFeatures(patch: Partial<Features>): void {
  current = { ...read(), ...patch };
  try { localStorage.setItem(FEATURES_KEY, JSON.stringify(current)); } catch { /* запомнится до перезапуска */ }
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useFeatures(): Features {
  return useSyncExternalStore(subscribe, read, read);
}

// Хранение журнала ресурсов между сеансами. Журнал — отдельно для каждого профиля и персонажа: прибавки одного
// аккаунта не попадают в итоги другого. Лежит в хранилище окна (localStorage): журнал — справка, не прогресс, поэтому
// отдельного файла рядом с программой у него нет, а любое повреждение просто начинает его заново.
// Старше 30 дней и сверх лимита записи отбрасываются; битые записи не загружаются.

import type { LedgerEntry, LedgerReason } from './ledger';

export const LEDGER_KEY = 'osrs-put:ledger';
export const LEDGER_LIMIT = 2000;
export const LEDGER_MAX_AGE_MS = 30 * 24 * 3600_000;

const REASONS: ReadonlySet<string> = new Set<LedgerReason>(['LOOT', 'PICKUP', 'PURCHASE', 'SALE', 'QUEST_REWARD', 'BANK_TRANSFER', 'CONSUMED', 'UNKNOWN']);

/** Ключ журнала: профиль и имя персонажа (нет имени — общий «неизвестный»). */
export function ledgerKey(profileId: string, player: string | null | undefined): string {
  const who = (player ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${LEDGER_KEY}:${profileId}:${who || '-'}`;
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function valid(e: unknown): e is LedgerEntry {
  if (!e || typeof e !== 'object') return false;
  const o = e as Record<string, unknown>;
  return typeof o.name === 'string' && o.name.length > 0 && o.name.length < 80
    && typeof o.quantityDelta === 'number' && Number.isFinite(o.quantityDelta)
    && typeof o.reason === 'string' && REASONS.has(o.reason)
    && typeof o.timestamp === 'number' && Number.isFinite(o.timestamp)
    && (o.estimatedGpValue === undefined || (typeof o.estimatedGpValue === 'number' && Number.isFinite(o.estimatedGpValue)));
}

/** Свежие записи по времени и лимиту; порядок сохраняется. */
export function trim(entries: LedgerEntry[], now: number): LedgerEntry[] {
  return entries.filter((e) => now - e.timestamp <= LEDGER_MAX_AGE_MS && e.timestamp <= now + 60_000).slice(-LEDGER_LIMIT);
}

export function loadLedger(store: Store | undefined, key: string, now: number): LedgerEntry[] {
  try {
    const text = store?.getItem(key);
    if (!text) return [];
    const data: unknown = JSON.parse(text);
    if (!Array.isArray(data)) return [];
    return trim(data.filter(valid), now);
  } catch {
    return [];
  }
}

export function saveLedger(store: Store | undefined, key: string, entries: LedgerEntry[]): void {
  try {
    if (!entries.length) store?.removeItem(key);
    else store?.setItem(key, JSON.stringify(entries));
  } catch {
    // Хранилище полно или закрыто: журнал останется в памяти до конца сеанса.
  }
}

/** Записи, сделанные начиная с момента since (текущий сеанс). */
export function since(entries: LedgerEntry[], from: number): LedgerEntry[] {
  return entries.filter((e) => e.timestamp >= from);
}

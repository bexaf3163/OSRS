// Связь с плагином RuneLite «OSRS Path Bridge» на этом компьютере: http://127.0.0.1:38282.
// В программе для ПК запросы идут через главный процесс Electron (preload → ipc): без CORS и без красных
// строк в консоли, когда RuneLite выключен. В браузере — fetch и EventSource напрямую.
// Удалённого сервера нет: мост слушает только loopback.

import type { InGameTarget, Progress, Step } from '../types';
import { desktop } from '../lib/desktop';
import { isClosed, openAfter } from '../lib/next-step';

export const BRIDGE_ORIGIN = 'http://127.0.0.1:38282';
/** Заголовок, без которого плагин не принимает POST: чужой сайт не сможет отправить его без разрешения CORS. */
export const BRIDGE_HEADER = 'X-OSRS-Path';

export interface BridgeStatus {
  online: boolean;
  inGame: boolean;
}

export type BridgeEvent =
  | { type: 'STEP_AUTO_COMPLETED'; stepId: string }
  | { type: 'STATUS'; inGame: boolean }
  | { type: string; [key: string]: unknown };

export interface BridgeResponse {
  ok: boolean;
  status: number;
  data?: unknown;
}

/** Способ достучаться до моста: через Electron или напрямую из браузера. */
export interface BridgeTransport {
  request(method: 'GET' | 'POST', path: '/status' | '/active-step' | '/clear', body?: unknown): Promise<BridgeResponse>;
  /** Поток событий. Возвращает функцию закрытия. onError — поток оборвался или не открылся. */
  openEvents(onEvent: (e: BridgeEvent) => void, onOpen: () => void, onError: () => void): () => void;
}

/** Что уходит в плагин: цель шага плюс код и название для подписи в игре. */
export type ActiveStepPayload = InGameTarget & { stepId: string; title: string };

export function parseEvent(text: string): BridgeEvent | null {
  try {
    const e = JSON.parse(text) as unknown;
    if (e && typeof e === 'object' && typeof (e as { type?: unknown }).type === 'string') return e as BridgeEvent;
  } catch {
    // Не JSON — пропускаем.
  }
  return null;
}

/**
 * Цель шага для игры. Явный inGame из маршрута главнее; без него — точка старта и места сбора с карты шага,
 * чтобы стрелка и клетки работали и у шагов, для которых подсветку ещё не расписали.
 */
export function toInGameTarget(step: Step): ActiveStepPayload | null {
  const g = step.inGame ?? {};
  const start = step.mapLocation;
  const worldPoint = g.worldPoint ?? (start ? { x: start.x, y: start.y, plane: start.plane, label: start.label } : undefined);
  const groundTiles = g.groundTiles ?? step.resourceSpots?.map((p) => ({ x: p.x, y: p.y, plane: p.plane, label: p.label }));
  const payload: ActiveStepPayload = { ...g, stepId: step.id, title: step.title };
  if (worldPoint) payload.worldPoint = worldPoint;
  if (groundTiles?.length) payload.groundTiles = groundTiles;
  const empty = !worldPoint && !groundTiles?.length && !g.npcNames?.length && !g.objectNames?.length
    && !g.dialogChoices?.length && !g.highlightItems?.length && !g.completionTrigger;
  return empty ? null : payload;
}

// ---------- Транспорты ----------

interface DesktopBridgeApi {
  request(method: string, path: string, body?: unknown): Promise<BridgeResponse>;
  openEvents(onEvent: (data: string) => void, onState: (state: 'open' | 'closed') => void): () => void;
}

function desktopTransport(api: DesktopBridgeApi): BridgeTransport {
  return {
    request: (method, path, body) => api.request(method, path, body).catch(() => ({ ok: false, status: 0 })),
    openEvents(onEvent, onOpen, onError) {
      let done = false;
      const close = api.openEvents(
        (data) => { const e = parseEvent(data); if (e) onEvent(e); },
        (state) => {
          if (done) return;
          if (state === 'open') onOpen();
          else { done = true; onError(); }
        },
      );
      return () => { done = true; close(); };
    },
  };
}

const TIMEOUT_MS = 1500;

function browserTransport(): BridgeTransport {
  return {
    async request(method, path, body) {
      try {
        const res = await fetch(BRIDGE_ORIGIN + path, {
          method,
          headers: { [BRIDGE_HEADER]: '1', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
          cache: 'no-store',
        });
        let data: unknown;
        try { data = await res.json(); } catch { data = undefined; }
        return { ok: res.ok, status: res.status, data };
      } catch {
        return { ok: false, status: 0 };
      }
    },
    openEvents(onEvent, onOpen, onError) {
      if (typeof EventSource === 'undefined') {
        onError();
        return () => {};
      }
      const es = new EventSource(`${BRIDGE_ORIGIN}/events`);
      let done = false;
      es.onopen = () => onOpen();
      es.onmessage = (m) => { const e = parseEvent(String(m.data)); if (e) onEvent(e); };
      // Переподключение ведём сами (с паузами), а не встроенным EventSource — он долбит без остановки.
      es.onerror = () => {
        if (done) return;
        done = true;
        es.close();
        onError();
      };
      return () => { done = true; es.close(); };
    },
  };
}

export function defaultTransport(): BridgeTransport {
  const api = (desktop() as unknown as { bridge?: DesktopBridgeApi } | undefined)?.bridge;
  return api ? desktopTransport(api) : browserTransport();
}

// ---------- Запросы ----------

export async function checkStatus(t: BridgeTransport = defaultTransport()): Promise<BridgeStatus> {
  const res = await t.request('GET', '/status');
  const d = res.data as { status?: string; inGame?: boolean } | undefined;
  return { online: res.ok && d?.status === 'ok', inGame: Boolean(res.ok && d?.inGame) };
}

/** Отправить шаг в игру. false — моста нет или у шага нечего показывать. */
export async function syncActiveStep(step: Step, t: BridgeTransport = defaultTransport()): Promise<boolean> {
  const payload = toInGameTarget(step);
  if (!payload) return false;
  return (await t.request('POST', '/active-step', payload)).ok;
}

export async function clearActiveStep(t: BridgeTransport = defaultTransport()): Promise<boolean> {
  return (await t.request('POST', '/clear')).ok;
}

// ---------- Поток событий с переподключением ----------

/** Паузы между попытками: 1, 2, 4, 8, 16, 30, 30… секунд. */
export function backoffMs(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, attempt));
}

export interface EventsHandle {
  close(): void;
}

/**
 * Держит поток /events открытым: оборвался — пауза и новая попытка, пауза растёт до 30 секунд.
 * onState сообщает, есть ли связь; close() останавливает всё, в том числе запланированные попытки.
 */
export function connectEvents(
  onEvent: (e: BridgeEvent) => void,
  onState: (online: boolean) => void,
  t: BridgeTransport = defaultTransport(),
  schedule: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms),
  cancel: (id: unknown) => void = (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
): EventsHandle {
  let attempt = 0;
  let closed = false;
  let timer: unknown;
  let closeStream: (() => void) | null = null;

  // Номер текущего потока: сигналы от прежних (уже брошенных) потоков не считаются.
  let generation = 0;
  const open = () => {
    if (closed) return;
    const mine = ++generation;
    const current = () => !closed && mine === generation;
    closeStream = t.openEvents(
      (e) => { if (current()) onEvent(e); },
      () => { if (!current()) return; attempt = 0; onState(true); },
      () => {
        if (!current()) return;
        generation++;
        closeStream = null;
        onState(false);
        timer = schedule(open, backoffMs(attempt++));
      },
    );
  };
  open();
  return {
    close() {
      closed = true;
      cancel(timer);
      closeStream?.();
      closeStream = null;
    },
  };
}

// ---------- Автоотметка ----------

export interface AutoCompletePlan {
  /** Отметить шаг выполненным. */
  mark: boolean;
  /** Следующий незакрытый шаг — его открывают страницы. */
  next?: Step;
  /** Что отправить в игру после отметки: следующий шаг, очистить или ничего не трогать. */
  inGame: 'sync-next' | 'clear' | 'keep';
}

/**
 * Что делать с событием STEP_AUTO_COMPLETED. handled — уже обработанные события: повтор ничего не меняет.
 * В игру уходит следующий шаг, только если в игре был показан именно выполненный — чужой не перебиваем.
 */
export function planAutoComplete(steps: Step[], p: Progress, stepId: string, activeStepId: string | null, handled: ReadonlySet<string>): AutoCompletePlan {
  const idle: AutoCompletePlan = { mark: false, inGame: 'keep' };
  if (handled.has(stepId)) return idle;
  const step = steps.find((s) => s.id === stepId);
  if (!step || isClosed(p, stepId)) return idle;
  const next = openAfter(steps, p, stepId);
  if (activeStepId !== stepId) return { mark: true, next, inGame: 'keep' };
  return { mark: true, next, inGame: next && toInGameTarget(next) ? 'sync-next' : 'clear' };
}

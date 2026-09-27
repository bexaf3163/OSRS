import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { allSteps, stepsFor } from '../src/data';
import { emptyProgress, withStep } from '../src/lib/progress';
import {
  backoffMs, BRIDGE_PATHS, clearActiveStep, connectEvents, parseEvent, planAutoComplete, syncActiveStep, toInGameTarget,
  type BridgeEvent, type BridgeTransport,
} from '../src/services/runeliteBridge';

const step = (id: string) => allSteps.find((s) => s.id === id)!;
const f2p = stepsFor('f2p');

/** Транспорт-заглушка: запоминает запросы, поток событий открывается и рвётся по команде. */
function fakeTransport(online = true) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const streams: { onEvent: (e: BridgeEvent) => void; onOpen: () => void; onError: () => void; closed: boolean }[] = [];
  const t: BridgeTransport = {
    async request(method, path, body) {
      calls.push({ method, path, body });
      return online ? { ok: true, status: 200, data: { status: 'ok', inGame: true } } : { ok: false, status: 0 };
    },
    openEvents(onEvent, onOpen, onError) {
      const s = { onEvent, onOpen, onError, closed: false };
      streams.push(s);
      return () => { s.closed = true; };
    },
  };
  return { t, calls, streams };
}

describe('цель шага для игры', () => {
  it('явный inGame главнее: квест, диалог и автоотметка уходят как есть', () => {
    const p = toInGameTarget(step('S1-03'))!;
    expect(p.stepId).toBe('S1-03');
    expect(p.title).toBe("Cook's Assistant");
    expect(p.npcNames).toContain('Cook');
    expect(p.dialogChoices).toEqual(["What's wrong?", 'Can I help?']);
    expect(p.completionTrigger).toEqual({ type: 'QUEST_COMPLETED', questName: "Cook's Assistant" });
  });

  it('без inGame — стрелка к старту и клетки мест сбора из карты шага', () => {
    const p = toInGameTarget(step('S2-13'))!;
    expect(p.worldPoint).toMatchObject({ x: 3104, y: 3424, plane: 0 });
    expect(p.groundTiles).toHaveLength(2);
    expect(p.completionTrigger).toBeUndefined();
  });

  it('у шага без карты и подсветки показывать в игре нечего', () => {
    expect(toInGameTarget(step('S1-01'))).toBeNull();
  });

  it('S1-11: клетки обеих точек ловли и предупреждение про болото', () => {
    const s = step('S1-11');
    expect(s.warning).toMatch(/зелёных лужах/);
    expect(toInGameTarget(s)!.groundTiles!.map((t) => [t.x, t.y])).toEqual([[3244, 3150], [3086, 3227]]);
  });
});

describe('триггеры автоотметки в маршруте', () => {
  const triggers = allSteps.filter((s) => s.inGame?.completionTrigger).map((s) => ({ s, t: s.inGame!.completionTrigger! }));

  it('квест засчитывается по его названию из игры', () => {
    const quests = triggers.filter(({ t }) => t.type === 'QUEST_COMPLETED');
    expect(quests.length).toBeGreaterThanOrEqual(5);
    for (const { s, t } of quests) expect(t.questName).toBe(s.title);
  });

  it('VARBIT_CHANGED без проверенных varbit не используется', () => {
    expect(triggers.filter(({ t }) => t.type === 'VARBIT_CHANGED')).toEqual([]);
  });

  it('сообщение о новом уровне: срабатывает на цели и выше, но не ниже', () => {
    const re = (id: string) => new RegExp(step(id).inGame!.completionTrigger!.chatPattern!);
    const msg = (skill: string, n: number) => `Congratulations, you've just advanced your ${skill} level. You are now level ${n}.`;
    expect(re('S2-04').test(msg('Magic', 25))).toBe(true);
    expect(re('S2-04').test(msg('Magic', 31))).toBe(true);
    expect(re('S2-04').test(msg('Magic', 98))).toBe(true);
    expect(re('S2-04').test(msg('Magic', 24))).toBe(false);
    expect(re('S2-04').test(msg('Magic', 2))).toBe(false);
    expect(re('S2-04').test(msg('Agility', 25))).toBe(false);
    expect(re('S3-09').test(msg('Magic', 33))).toBe(true);
    expect(re('S3-09').test(msg('Magic', 32))).toBe(false);
    expect(re('S6-04').test(msg('Magic', 55))).toBe(true);
    expect(re('S6-04').test(msg('Magic', 5))).toBe(false);
    expect(re('S7-04').test(msg('Agility', 25))).toBe(true);
    expect(re('S7-04').test(msg('Agility', 20))).toBe(false);
  });
});

describe('запросы к мосту', () => {
  it('«Указать в игре» — POST /active-step с целью шага', async () => {
    const { t, calls } = fakeTransport();
    expect(await syncActiveStep(step('S1-06'), t)).toBe(true);
    expect(calls).toEqual([{ method: 'POST', path: '/active-step', body: toInGameTarget(step('S1-06')) }]);
    expect(await clearActiveStep(t)).toBe(true);
    expect(calls[1]).toMatchObject({ method: 'POST', path: '/clear' });
  });

  it('мост выключен — false, без исключений', async () => {
    const { t } = fakeTransport(false);
    await expect(syncActiveStep(step('S1-03'), t)).resolves.toBe(false);
  });

  it('шаг без цели в мост не уходит', async () => {
    const { t, calls } = fakeTransport();
    expect(await syncActiveStep(step('S1-01'), t)).toBe(false);
    expect(calls).toEqual([]);
  });

  it('события — только JSON с полем type', () => {
    expect(parseEvent('{"type":"STEP_AUTO_COMPLETED","stepId":"S1-03"}')).toEqual({ type: 'STEP_AUTO_COMPLETED', stepId: 'S1-03' });
    expect(parseEvent('ping')).toBeNull();
    expect(parseEvent('{"stepId":"S1-03"}')).toBeNull();
  });
});

describe('поток событий', () => {
  it('паузы растут до 30 секунд', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 10].map(backoffMs)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  });

  it('обрыв — пауза и новая попытка, связь — сброс пауз, close останавливает всё', () => {
    const { t, streams } = fakeTransport();
    const timers: { fn: () => void; ms: number; cancelled?: boolean }[] = [];
    const states: boolean[] = [];
    const events: BridgeEvent[] = [];
    const h = connectEvents((e) => events.push(e), (s) => states.push(s), t,
      (fn, ms) => { const x = { fn, ms }; timers.push(x); return x; },
      (x) => { if (x) (x as { cancelled?: boolean }).cancelled = true; });

    expect(streams).toHaveLength(1);
    streams[0].onError();
    streams[0].onError(); // повторная ошибка того же потока — не вторая попытка
    expect(states).toEqual([false]);
    expect(timers.map((x) => x.ms)).toEqual([1000]);

    timers[0].fn();
    expect(streams).toHaveLength(2);
    streams[1].onOpen();
    streams[1].onEvent({ type: 'STEP_AUTO_COMPLETED', stepId: 'S1-03' });
    expect(states.at(-1)).toBe(true);
    expect(events).toEqual([{ type: 'STEP_AUTO_COMPLETED', stepId: 'S1-03' }]);

    streams[1].onError();
    expect(timers.at(-1)!.ms).toBe(1000); // после удачного соединения паузы снова с секунды

    h.close();
    expect(timers.at(-1)!.cancelled).toBe(true);
    streams[1].onEvent({ type: 'STEP_AUTO_COMPLETED', stepId: 'S1-04' });
    expect(events).toHaveLength(1);
  });
});

describe('автоотметка из игры', () => {
  it('отмечает шаг и отправляет в игру следующий, если в игре был этот', () => {
    const plan = planAutoComplete(f2p, emptyProgress(), 'S1-03', 'S1-03', new Set());
    expect(plan.mark).toBe(true);
    expect(plan.next?.id).toBe('S1-04');
    expect(plan.inGame).toBe('sync-next');
  });

  it('следующему шагу нечего показать в игре — подсказки очищаются', () => {
    // После последнего шага F2P следующий — S1-01 (настройка клиента): ни места, ни подсветки.
    const plan = planAutoComplete(f2p, emptyProgress(), 'S6-05', 'S6-05', new Set());
    expect(plan.next?.id).toBe('S1-01');
    expect(plan.inGame).toBe('clear');
  });

  it('повтор того же события ничего не делает', () => {
    const plan = planAutoComplete(f2p, emptyProgress(), 'S1-03', 'S1-03', new Set(['S1-03']));
    expect(plan).toEqual({ mark: false, inGame: 'keep' });
  });

  it('уже отмеченный шаг не трогаем', () => {
    const p = withStep(emptyProgress(), 'S1-03', 'done');
    expect(planAutoComplete(f2p, p, 'S1-03', 'S1-03', new Set()).mark).toBe(false);
  });

  it('в игре показан другой шаг — отмечаем, но подсказки в игре не перебиваем', () => {
    const plan = planAutoComplete(f2p, emptyProgress(), 'S1-04', 'S1-06', new Set());
    expect(plan).toMatchObject({ mark: true, inGame: 'keep' });
  });

  it('шаг Members в режиме F2P и незнакомый код игнорируются', () => {
    expect(planAutoComplete(f2p, emptyProgress(), 'S7-04', 'S7-04', new Set()).mark).toBe(false);
    expect(planAutoComplete(f2p, emptyProgress(), 'S0-00', null, new Set()).mark).toBe(false);
  });
});

describe('разбор потока событий в программе для ПК', () => {
  const require = createRequire(import.meta.url);
  const { sseParser } = require('../electron/runelite-bridge.cjs') as { sseParser: (on: (d: string) => void) => (chunk: string) => void };

  it('главный процесс пропускает к плагину все адреса приложения, и только их', () => {
    const { PATHS } = require('../electron/runelite-bridge.cjs') as { PATHS: Set<string> };
    expect([...PATHS].sort()).toEqual([...BRIDGE_PATHS].sort());
  });

  it('события по кускам, CRLF, пинги-комментарии и многострочные данные', () => {
    const out: string[] = [];
    const feed = sseParser((d) => out.push(d));
    feed(': ping\n\ndata: {"type":"STATUS",');
    feed('"inGame":true}\r\n\r\ndata: a\ndata: b\n\n');
    expect(out).toEqual(['{"type":"STATUS","inGame":true}', 'a\nb']);
  });
});

describe('запуск RuneLite из программы для ПК', () => {
  const require = createRequire(import.meta.url);
  const { findClient, versionOf } = require('../electron/runelite-launcher.cjs') as {
    findClient: (dir: string) => { version: string; jars: string[] } | null;
    versionOf: (name: string) => number[];
  };
  const { mkdtempSync, writeFileSync } = require('node:fs') as typeof import('node:fs');
  const { tmpdir } = require('node:os') as typeof import('node:os');
  const { join, basename } = require('node:path') as typeof import('node:path');

  const repo = (names: string[]) => {
    const dir = mkdtempSync(join(tmpdir(), 'rl-repo-'));
    for (const n of names) writeFileSync(join(dir, n), '');
    return dir;
  };

  it('версия из имени файла', () => {
    expect(versionOf('client-1.12.39.jar')).toEqual([1, 12, 39]);
    expect(versionOf('runelite-api-1.12.39-runtime.jar')).toEqual([1, 12, 39]);
    expect(versionOf('lwjgl-opengl-3.3.2-natives-windows.jar')).toEqual([3, 3, 2]);
  });

  it('берёт все библиотеки, а из двух версий одной — новую', () => {
    const dir = repo(['client-1.12.39.jar', 'client-1.12.40.jar', 'injected-client-1.12.40.jar', 'injected-client-1.12.39.jar',
      'runelite-api-1.12.40-runtime.jar', 'gson-2.8.5.jar', 'lwjgl-3.3.2.jar', 'lwjgl-3.3.2-natives-windows.jar']);
    const c = findClient(dir)!;
    expect(c.version).toBe('1.12.40');
    expect(c.jars.map((j) => basename(j)).sort()).toEqual(['client-1.12.40.jar', 'gson-2.8.5.jar', 'injected-client-1.12.40.jar',
      'lwjgl-3.3.2-natives-windows.jar', 'lwjgl-3.3.2.jar', 'runelite-api-1.12.40-runtime.jar']);
  });

  it('без клиента или с клиентом другой версии — не запускаем', () => {
    expect(findClient(repo(['gson-2.8.5.jar']))).toBeNull();
    expect(findClient(repo(['client-1.12.40.jar', 'injected-client-1.12.39.jar']))).toBeNull();
    expect(findClient(join(tmpdir(), 'нет-такой-папки'))).toBeNull();
  });
});

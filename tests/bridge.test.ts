import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { allSteps, stepsFor } from '../src/data';
import { emptyProgress, withStep } from '../src/lib/progress';
import { ownedText, triggerText } from '../src/lib/triggers';
import {
  APP_PROTOCOL, backoffMs, BRIDGE_PATHS, checkStatus, clearActiveStep, connectEvents, missingWithPlugin, parseEvent, parseNavTarget, planAutoComplete,
  pluginCompat, syncActiveStep, toInGameTarget, type BridgeEvent, type BridgeTransport,
} from '../src/services/runeliteBridge';
import { mapPlaces, stepPlaces } from '../src/lib/stepPlaces';

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
    const p = toInGameTarget({ ...step('S2-13'), inGame: undefined })!;
    expect(p.worldPoint).toMatchObject({ x: 3104, y: 3424, plane: 0 });
    expect(p.groundTiles).toHaveLength(2);
    expect(p.completionTrigger).toBeUndefined();
  });

  it('inGame без точки — точка и клетки всё равно с карты шага, подсветка и автоотметка из inGame', () => {
    const p = toInGameTarget(step('S2-13'))!;
    expect(p.worldPoint).toMatchObject({ x: 3104, y: 3424, plane: 0 });
    expect(p.groundTiles).toHaveLength(2);
    expect(p.npcNames).toEqual(['Rod Fishing spot']);
    expect(p.completionTrigger).toEqual({ type: 'SKILL_LEVEL', levels: [{ skill: 'fishing', level: 30 }, { skill: 'cooking', level: 30 }] });
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

describe('объяснение автоотметки', () => {
  it('одна фраза на любое условие', () => {
    expect(triggerText({ type: 'QUEST_COMPLETED', questName: "Cook's Assistant" })).toBe('квест засчитается в игре');
    expect(triggerText({ type: 'SKILL_LEVEL', levels: [{ skill: 'fishing', level: 30 }, { skill: 'cooking', level: 30 }] }))
      .toBe('в игре будет Fishing 30 и Cooking 30');
    expect(triggerText({ type: 'SKILL_LEVEL', levels: [{ skill: 'fishing', level: 20 }, { skill: 'cooking', level: 15 }], items: [{ names: ['Shrimps', 'Anchovies'], count: 50 }] }))
      .toBe('в игре будет Fishing 20 и Cooking 15, и у тебя будет 50 × Shrimps или Anchovies (сумка, надетое и банк вместе)');
    expect(triggerText({ type: 'ITEM_OWNED', items: [{ names: ['Coins'], count: 20000 }] })).toBe('у тебя будет 20\u00a0000 × Coins (сумка, надетое и банк вместе)');
    expect(triggerText({ type: 'QUEST_COMPLETED', questName: 'Monkey Madness I', items: [{ names: ['Dragon scimitar'], count: 1 }] }))
      .toBe('квест засчитается в игре, и у тебя будет Dragon scimitar (сумка, надетое и банк вместе)');
    expect(ownedText({ names: ['Map part'], id: 1535, count: 1 })).toBe('Map part');
  });
});

describe('триггеры автоотметки в маршруте', () => {
  const triggers = allSteps.filter((s) => s.inGame?.completionTrigger).map((s) => ({ s, t: s.inGame!.completionTrigger! }));

  it('квест засчитывается по его названию из игры', () => {
    const quests = triggers.filter(({ t }) => t.type === 'QUEST_COMPLETED');
    expect(quests.length).toBeGreaterThanOrEqual(30);
    for (const { s, t } of quests) {
      // Как у шага (тире — дефис, как у RuneLite) или как у статьи вики шага: «Триумф у Oziach» — это Dragon Slayer I.
      const article = decodeURIComponent((s.wikiUrl ?? '').replace(/^.*\/w\//, '')).replace(/_/g, ' ');
      expect([s.title.replace(/ — /g, ' - '), article]).toContain(t.questName);
    }
    const names = quests.map(({ t }) => t.questName);
    expect(new Set(names).size).toBe(names.length);
    expect(step('S5-09').inGame!.completionTrigger).toEqual({ type: 'QUEST_COMPLETED', questName: 'Dragon Slayer I', items: [{ names: ['Rune platebody'], count: 1 }] });
    expect(step('S9-05').inGame!.completionTrigger!.questName).toBe("Recipe for Disaster - Another Cook's Quest");
  });

  it('этапы Dragon Slayer I — по своим предметам, куски карты по ID', () => {
    expect(step('S5-01').inGame!.completionTrigger).toEqual({ type: 'ITEM_OWNED', items: [{ names: ['Maze key'], count: 1 }] });
    expect(step('S5-03').inGame!.completionTrigger!.items).toEqual([{ names: ['Map part'], id: 1535, count: 1 }]);
    expect(step('S5-04').inGame!.completionTrigger!.items).toEqual([{ names: ['Map part'], id: 1537, count: 1 }]);
    expect(step('S5-05').inGame!.completionTrigger!.items).toEqual([{ names: ['Crandor map'], count: 1 }]);
    expect(step('S5-08').inGame!.completionTrigger!.items).toEqual([{ names: ["Elvarg's head"], count: 1 }]);
    // Оплату Wormbrain в 10 000 монет шаг не советует — и в игре её не подсвечиваем.
    expect(step('S5-05').inGame!.dialogChoices ?? []).toEqual([]);
  });

  it('VARBIT_CHANGED без проверенных varbit не используется', () => {
    expect(triggers.filter(({ t }) => t.type === 'VARBIT_CHANGED')).toEqual([]);
  });

  it('уровни засчитываются по настоящим уровням, ровно целям из названия шага', () => {
    const levels = triggers.filter(({ t }) => t.type === 'SKILL_LEVEL');
    expect(levels.length).toBeGreaterThanOrEqual(15);
    for (const { s, t } of levels) expect(t.levels).toEqual(s.targets);
    // Сообщение о новом уровне не приходит, если уровень взят до показа шага, — уровни проверяются напрямую.
    expect(triggers.filter(({ t }) => t.type === 'CHAT_MESSAGE')).toEqual([]);
    expect(step('S2-04').inGame!.completionTrigger).toEqual({ type: 'SKILL_LEVEL', levels: [{ skill: 'magic', level: 25 }] });
  });

  it('«Готово, когда» с предметами — предметы тоже в условии', () => {
    expect(step('S1-11').inGame!.completionTrigger!.items).toEqual([{ names: ['Shrimps', 'Anchovies'], count: 50 }]);
    expect(step('S1-12').inGame!.completionTrigger!.items).toEqual([
      { names: ['Copper ore'], count: 5 }, { names: ['Tin ore'], count: 1 }, { names: ['Iron ore'], count: 2 },
    ]);
    expect(step('S4-04').inGame!.completionTrigger!.items).toEqual([{ names: ['Lobster'], count: 30 }]);
    expect(step('S1-13').inGame!.completionTrigger).toEqual({ type: 'ITEM_OWNED', items: [{ names: ['Coins'], count: 20000 }] });
  });

  it('шаги закупок засчитываются, когда куплено всё из списка шага', () => {
    for (const id of ['S2-01', 'S3-07', 'S4-05']) {
      const s = step(id);
      const t = s.inGame!.completionTrigger!;
      expect(t.type).toBe('ITEM_OWNED');
      expect(t.items!.map((i) => i.names[0])).toEqual(s.itemsRequired!.map((i) => i.nameEn));
    }
  });
});

describe('запросы к мосту', () => {
  it('«Показать в игре» — POST /active-step с целью шага', async () => {
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

describe('рукопожатие версий программы и плагина', () => {
  it('плагин едет с той же версией и протоколом, что ждёт программа', async () => {
    const { readFileSync } = await import('node:fs');
    const java = readFileSync(new URL('../runelite-bridge/src/main/java/com/osrspath/bridge/BridgeServer.java', import.meta.url), 'utf8');
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
    expect(java.match(/PLUGIN_VERSION = "([^"]+)"/)?.[1]).toBe(pkg.version);
    expect(Number(java.match(/int PROTOCOL = (\d+);/)?.[1])).toBe(APP_PROTOCOL);
  });

  it('совместимость: без поля — старый плагин, меньше — устарел, больше — новее программы', () => {
    expect(pluginCompat(null)).toBe('legacy');
    expect(pluginCompat(APP_PROTOCOL - 1)).toBe('older');
    expect(pluginCompat(APP_PROTOCOL)).toBe('ok');
    expect(pluginCompat(APP_PROTOCOL + 1)).toBe('newer');
  });
});

describe('цель стрелки, выбранная в игре (протокол 4)', () => {
  it('NAV_SET и /status: цель принимается только целиком и проверенной', () => {
    expect(parseNavTarget({ label: 'Ned — дом в Draynor Village', x: 3099, y: 3259, plane: 0, npcNames: ['Ned'], stepId: 'S2-10' }))
      .toEqual({ label: 'Ned — дом в Draynor Village', x: 3099, y: 3259, plane: 0, npcNames: ['Ned'], stepId: 'S2-10' });
    expect(parseNavTarget(null)).toBeNull();
    expect(parseNavTarget({ label: '', x: 1, y: 2, plane: 0 })).toBeNull();
    expect(parseNavTarget({ label: 'X', x: 1.5, y: 2, plane: 0 })).toBeNull();
    expect(parseNavTarget({ label: 'X', x: 1, y: 2, plane: 0, npcNames: [5] })).toEqual({ label: 'X', x: 1, y: 2, plane: 0 });
  });

  it('/status: цель в игре — в состоянии программы; у старого плагина поля нет', async () => {
    const t = (data: unknown): BridgeTransport => ({ request: async () => ({ ok: true, status: 200, data }), openEvents: () => () => {} });
    const now = await checkStatus(t({ status: 'ok', protocol: 4, pluginVersion: '2.11.0', navTarget: { label: 'Joe', x: 3124, y: 3244, plane: 0 } }));
    expect(now.navTarget).toEqual({ label: 'Joe', x: 3124, y: 3244, plane: 0 });
    expect((await checkStatus(t({ status: 'ok', protocol: 3 }))).navTarget).toBeNull();
  });

  it('старый плагин: программа говорит, чего с ним нет', () => {
    expect(missingWithPlugin(3)).toEqual([
      'опыт, квесты и имя персонажа из игры (синхронизация с аккаунтом, профили, время до цели)',
      'список «Что нужно» на экране игры (клик по строке — стрелка и путь туда)',
    ]);
    expect(missingWithPlugin(4)).toHaveLength(1);
    expect(missingWithPlugin(null)).toHaveLength(4);
    expect(missingWithPlugin(APP_PROTOCOL)).toEqual([]);
  });
});

describe('места шага: откуда предметы и NPC квеста — одни и те же в программе и в игре', () => {
  it('Prince Ali Rescue: NPC квеста и Ned за верёвкой, точка шага первой', () => {
    const p = stepPlaces(step('S2-10'));
    expect(p[0]).toMatchObject({ npc: 'Chancellor Hassan', x: 3298, y: 3163 });
    expect(p.find((q) => q.npc === 'Ned')).toMatchObject({ x: 3099, y: 3259, items: ['Rope'] });
    expect(p.map((q) => q.npc)).toEqual(['Chancellor Hassan', 'Ned', 'Osman', 'Aggie', 'Lady Keli', 'Leela', 'Joe', 'Prince Ali']);
    expect(mapPlaces(step('S2-10')).map((q) => q.label)).toEqual(p.map((q) => q.label));
  });

  it('предмет от NPC самого шага — в его точке, а не второй точкой рядом; одно имя — разные NPC по шагам', () => {
    const horacio = stepPlaces(step('S2-06'));
    expect(horacio[0]).toMatchObject({ npc: 'Duke Horacio', items: ['Air talisman'] });
    expect(horacio.filter((q) => q.npc === 'Duke Horacio')).toHaveLength(1);
    // Cook в Below Ice Mountain — повар паба Blue Moon Inn в Varrock, а не повар замка Lumbridge.
    expect(stepPlaces(step('S3-04')).find((q) => q.npc === 'Cook')).toMatchObject({ x: 3230, y: 3400 });
    // Drezel в Priest in Peril — в камере наверху храма, в Nature Spirit — под храмом.
    expect(stepPlaces(step('S8-01')).find((q) => q.npc === 'Drezel')).toMatchObject({ x: 3416, y: 3487, plane: 2 });
  });

  it('предметы «добыть в мире» из 2.11.2 имеют место: Goblin mail, кости, pebble Глариала; NPC квестов — по карте вики', () => {
    const at = (id: string, name: string) => stepPlaces(step(id)).find((q) => q.items?.includes(name));
    expect(at('S2-12', 'Goblin mail')).toMatchObject({ label: 'Goblin Village', plane: 0 });
    expect(at('S3-03', 'Bones')).toMatchObject({ x: 3257, y: 3272, npc: 'Cow' });
    expect(at('S7-01', "Glarial's pebble")).toMatchObject({ npc: 'Golrie', x: 2515, y: 9581 });
    expect(stepPlaces(step('S8-05')).find((q) => q.npc === 'Malcolm')).toMatchObject({ x: 3629, y: 3528 });
  });

  it('у магазина из словаря продавец — Shop keeper; карта шага сохраняет прежний порядок точек', () => {
    expect(stepPlaces(step('S1-02')).find((q) => q.items?.includes('Tinderbox'))).toMatchObject({ label: 'Lumbridge General Store', npc: 'Shop keeper' });
    expect(mapPlaces(step('S4-04')).slice(0, 2).map((q) => q.label)).toEqual(['До 40: нахлыст у Barbarian Village', 'С 40: омары у Musa Point']);
  });
});

describe('панель «OSRS Путь» в RuneLite: что нужно и точки шага (протокол 3)', () => {
  it('S2-03: предметы с «где взять», точки с NPC и предметами, точка шага не дублируется', () => {
    const g = toInGameTarget(step('S2-03'))!.guide!;
    expect(g.items.map((i) => i.name)).toEqual(['Onion', 'Eye of newt', "Rat's tail", 'Burnt meat']);
    expect(g.items.find((i) => i.name === 'Eye of newt')).toMatchObject({ nameRu: 'Глаз тритона', id: 221, count: 1, inStep: true });
    expect(g.items.every((i) => i.where)).toBe(true);
    expect(g.places.map((p) => p.label)).toEqual([
      'Hetty — дом в Rimmington', "Крыса — Brian's Archery Supplies", 'Лук — грядка к северу от Rimmington',
      'Eye of newt — Betty, Port Sarim', 'Giant rat — у часовни Port Sarim',
    ]);
    expect(g.places[0]).toMatchObject({ npc: 'Hetty', x: 2968, y: 3204 });
    expect(g.places[3]).toMatchObject({ npc: 'Betty', items: ['Eye of newt'] });
  });

  it('у каждого шага с предметами или несколькими точками панель есть; ограничения плагина соблюдены', () => {
    for (const s of allSteps) {
      const g = toInGameTarget(s)?.guide;
      if ((s.itemsRequired?.length ?? 0) > 0) expect(g, s.id).toBeTruthy();
      if (!g) continue;
      expect(g.items.length).toBeLessThanOrEqual(64);
      for (const i of g.items) expect((i.where ?? '').length, `${s.id} ${i.name}`).toBeLessThanOrEqual(500);
      for (const p of g.places) expect(p.label.length).toBeLessThanOrEqual(200);
    }
  });

  it('быстрый вариант меняет главную точку и не приписывает ей NPC шага', () => {
    const s = step('S2-05');
    const branch = s.branches!.find((b) => b.id === 'varrock-teleport')!;
    const g = toInGameTarget(s, branch)!.guide!;
    expect(g.places[0]).toMatchObject({ x: branch.replacementTarget!.x, y: branch.replacementTarget!.y });
    expect(g.places[0].npc).toBeUndefined();
  });
});

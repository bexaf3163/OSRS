// npm run test:ui — прогон интерфейса в настоящем браузере (Chromium через Playwright), как у игрока в exe:
// собранная страница, подменная программа для ПК (window.osrsDesktop) и подменный мост RuneLite. Сеть к вики
// закрыта — проверяется, что всё работает и без неё. Нужна сборка (npm run build) и Chromium
// (npx playwright install chromium). Раньше эти сценарии жили вне репозитория.

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';

const PORT = 4179;
const BASE = `http://127.0.0.1:${PORT}/`;
const steps = JSON.parse(readFileSync(new URL('../src/data/steps.json', import.meta.url), 'utf8')) as { id: string }[];

interface Mock {
  progress?: unknown;
  status?: Record<string, unknown>;
  events?: unknown[];
  localStorage?: Record<string, string>;
  /** Режим «Дзен» (по умолчанию в тестах включён «Инспектор»: все блоки шага развёрнуты, как проверялось раньше). */
  zen?: boolean;
  /** Цены биржи по ID предмета: подменяют ответ prices.runescape.wiki (без них сеть к вики закрыта). */
  prices?: Record<number, number>;
}

/** Прогресс: всё до шага закрыто. */
function progressBefore(id: string, extra: Record<string, unknown> = {}) {
  const ids = steps.map((s) => s.id);
  const done = Object.fromEntries(ids.slice(0, ids.indexOf(id)).map((s) => [s, 'done']));
  return { version: 3, steps: done, levels: {}, notes: {}, updatedAt: '2026-09-27T10:00:00.000Z', gameMode: 'members', ...extra };
}

async function open(browser: Browser, width: number, mock: Mock, hash: string): Promise<{ page: Page; errors: string[] }> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: width < 600 ? 'light' : 'dark' });
  await ctx.addInitScript((m: Mock) => {
    for (const [k, v] of Object.entries(m.localStorage ?? {})) localStorage.setItem(k, v);
    try {
      const f = JSON.parse(localStorage.getItem('osrs-put:features') ?? '{}') as Record<string, unknown>;
      if (f.inspector === undefined) f.inspector = !m.zen;
      localStorage.setItem('osrs-put:features', JSON.stringify(f));
    } catch { /* нет хранилища */ }
    const w = window as unknown as Record<string, unknown>;
    const posts: unknown[] = [];
    w.__posts = posts;
    let progress = m.progress ? JSON.stringify(m.progress) : null;
    w.osrsDesktop = {
      getZoom: async () => ({ zoom: 1, autoZoom: false, effective: 1, alwaysOnTop: false }),
      setZoom() {}, setAlwaysOnTop() {}, onZoom: () => () => {},
      loadProgressFile: () => progress,
      saveProgressFile: (j: string) => { progress = j; w.__saved = j; },
      dataDir: () => 'C:/OSRS', isPortable: () => true,
      runelite: { check: async () => ({ ok: true, problems: [], clientVersion: '1.12.39', credentials: true }), launch: async () => ({ ok: true, state: 'running' }) },
      bridge: {
        request: async (method: string, path: string, body: unknown) => {
          posts.push({ method, path, body });
          if (path === '/status') return { ok: true, status: 200, data: { status: 'ok', inGame: true, activeStepId: null, shortestPath: true, ...(m.status ?? {}) } };
          return { ok: true, status: 200, data: { ok: true } };
        },
        openEvents: (onEvent: (d: string) => void, onState: (s: string) => void) => {
          setTimeout(() => { onState('open'); for (const e of m.events ?? []) onEvent(JSON.stringify(e)); }, 50);
          return () => {};
        },
      },
    };
  }, mock);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error' && !/Failed to load resource|net::/.test(msg.text())) errors.push(msg.text()); });
  await page.route(/runescape\.wiki/, (r) => r.abort());
  if (mock.prices) {
    const data = Object.fromEntries(Object.entries(mock.prices).map(([id, p]) => [id, { high: p, highTime: 1, low: p, lowTime: 1 }]));
    await page.route(/prices\.runescape\.wiki\/api\/v1\/osrs\/latest/, (r) => r.fulfill({ json: { data } }));
  }
  await page.goto(BASE + hash);
  await page.waitForTimeout(1200);
  return { page, errors };
}

const failures: string[] = [];
function expect(cond: boolean, what: string) {
  if (cond) console.log(`  ✓ ${what}`);
  else { console.log(`  ✗ ${what}`); failures.push(what); }
}
async function noOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 0);
}
const text = (page: Page, sel: string) => page.locator(sel).allInnerTexts().then((t) => t.join('\n'));

async function run(browser: Browser) {
  for (const width of [390, 1100]) {
    console.log(`Ширина ${width}`);

    // Готовность к шагу: не хватает уровня — действие «добрать»; предмет в банке — «к банку». Автоподготовка выключена —
    // заход начинается кнопкой (автоочередь проверяется ниже).
    {
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S9-01'),
        status: { stats: { crafting: 28, woodcutting: 40 } },
        events: [{ type: 'STATS', stats: { crafting: 28, woodcutting: 40 } }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Knife', carried: 0, noted: 0, bank: 1 }] }],
        localStorage: { 'osrs-put:features': JSON.stringify({ autoPrep: false }) },
      }, '#/step/S9-01');
      const t = await text(page, '.readiness');
      expect(t.includes('Нужна короткая подготовка') && t.includes('Добрать Crafting'), 'готовность: не хватает Crafting 31 — «⚡ Добрать Crafting»');
      expect(t.includes('К банку'), 'готовность: Knife в банке — «🧭 К банку»');
      // Маршрут подготовки: одно главное, кнопка начала, возврат к шагу; заход переживает перезагрузку страницы.
      const prep = await text(page, '.prep-route');
      expect(prep.includes('Подготовка к S9-01') && prep.includes('Начать подготовку') && prep.includes('вернёмся к S9-01'), 'подготовка: главное, кнопка и возврат к шагу');
      await page.getByRole('button', { name: /Начать подготовку/ }).click();
      await page.waitForTimeout(300);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:prep') ?? '{}') as { stack?: { sourceStepId: string }[] });
      expect(saved.stack?.length === 1 && saved.stack[0].sourceStepId === 'S9-01', 'подготовка: заход запомнился в хранилище');
      await page.reload();
      await page.waitForTimeout(1200);
      expect((await text(page, '.prep-route')).includes('Подготовка идёт'), 'подготовка: после перезагрузки заход всё ещё идёт');
      expect(await noOverflow(page), 'шаг: без горизонтальной прокрутки');
      expect(!errors.length, `шаг: ошибок в консоли нет ${errors.join('; ')}`);
      await page.context().close();
    }

    // Автоочередь подготовки: сама ставит стрелку к банку за Knife, запоминает заход, переживает перезагрузку;
    // игрок снял стрелку — очередь на паузе, «Продолжить» возвращает.
    {
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S9-01'),
        status: { stats: { crafting: 40, woodcutting: 40 } },
        events: [{ type: 'STATS', stats: { crafting: 40, woodcutting: 40 } }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Knife', carried: 0, noted: 0, bank: 1 }] }],
      }, '#/step/S9-01');
      type Post = { path: string; body: Record<string, unknown> };
      const posts = () => page.evaluate(() => (window as unknown as { __posts: Post[] }).__posts);
      // Связь с игрой и банк приходят не мгновенно — ждём, пока очередь начнёт заход.
      await page.waitForFunction(() => (window as unknown as { __posts: Post[] }).__posts.some((p) => p.path === '/nav-target'), null, { timeout: 10000 }).catch(() => undefined);
      await page.waitForTimeout(300);
      const nav = (await posts()).filter((p) => p.path === '/nav-target').pop()?.body;
      expect(nav?.itemName === 'Knife' && nav?.stepId === 'S9-01', 'автоочередь: стрелка сама ведёт к банку за Knife');
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:prep') ?? '{}') as { stack?: { sourceStepId: string; detourId: string }[] });
      expect(saved.stack?.length === 1 && saved.stack[0].detourId === 'bank', 'автоочередь: заход начат сам и запомнился');
      expect((await text(page, '.prep-route')).includes('Подготовка идёт'), 'автоочередь: в блоке подготовки — «Подготовка идёт»');
      const navCount = (await posts()).filter((p) => p.path === '/nav-target').length;
      await page.waitForTimeout(800);
      expect((await posts()).filter((p) => p.path === '/nav-target').length === navCount, 'автоочередь: стрелку не дёргает по кругу');
      await page.reload();
      await page.waitForTimeout(1200);
      expect((await text(page, '.prep-route')).includes('Подготовка идёт'), 'автоочередь: после перезагрузки заход всё ещё идёт');
      expect(!errors.length, `автоочередь: ошибок в консоли нет ${errors.join('; ')}`);
      await page.context().close();
    }

    // Игрок сам снял стрелку — очередь на паузе и больше её не ставит.
    {
      const target = { label: 'Банк: взять Knife', x: 3185, y: 3436, plane: 0, itemName: 'Knife', stepId: 'S9-01' };
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S9-01'),
        status: { protocol: 5, stats: { crafting: 40, woodcutting: 40 }, navTarget: target },
        events: [{ type: 'STATS', stats: { crafting: 40, woodcutting: 40 } }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Knife', carried: 0, noted: 0, bank: 1 }] }],
        localStorage: { 'osrs-put:prep': JSON.stringify({ stack: [{ sourceStepId: 'S9-01', detourId: 'bank', reason: 'Забери из банка', startedAt: 1, returnCondition: 'готово' }], done: [] }) },
      }, '#/step/S9-01');
      await page.getByRole('button', { name: /Вернуться к шагу сейчас/ }).click();
      await page.waitForTimeout(700);
      expect((await text(page, '.prep-route')).includes('Продолжить подготовку'), 'пауза: после снятия стрелки — «Продолжить подготовку»');
      type Post = { path: string };
      const navs = (await page.evaluate(() => (window as unknown as { __posts: Post[] }).__posts)).filter((p) => p.path === '/nav-target').length;
      await page.waitForTimeout(800);
      const after = (await page.evaluate(() => (window as unknown as { __posts: Post[] }).__posts)).filter((p) => p.path === '/nav-target').length;
      expect(navs === after, 'пауза: стрелку больше не ставит');
      expect(!errors.length, `пауза: ошибок в консоли нет ${errors.join('; ')}`);
      await page.context().close();
    }

    // Стиль игры и «чем качать»: спокойный по умолчанию; переключение в настройках; карточка способа на странице навыка.
    {
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S1-08', { levels: { woodcutting: 32 } }),
        status: { stats: { woodcutting: 32 } },
        events: [{ type: 'STATS', stats: { woodcutting: 32 } }],
      }, '#/skills/WC');
      await page.waitForSelector('.training', { timeout: 5000 });
      const calm = await text(page, '.training');
      expect(calm.includes('Чем качать') && calm.includes('Ивы') && !calm.includes('по вики — ориентир') && calm.includes('Стиль: 🌿 Спокойно'), 'чем качать: на 32 уровне — ивы, спокойный стиль без оценки времени');
      expect(await noOverflow(page), 'чем качать: без горизонтальной прокрутки');
      await page.goto(`${BASE}#/settings`);
      await page.waitForTimeout(400);
      await page.getByRole('button', { name: /Эффективно/ }).click();
      await page.waitForTimeout(200);
      const feat = await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:features') ?? '{}') as { efficient?: boolean });
      expect(feat.efficient === true, 'стиль: «Эффективно» запомнилось в настройках');
      await page.goto(`${BASE}#/skills/WC`);
      await page.waitForSelector('.training', { timeout: 5000 });
      const fast = await text(page, '.training');
      expect(fast.includes('Стиль: ⚡ Эффективно') && /из вики/.test(fast), 'чем качать: эффективный стиль показывает время и скорость «по вики»');
      expect(!errors.length, `чем качать: ошибок в консоли нет ${errors.join('; ')}`);
      await page.context().close();
    }

    // «Дзен»: вместо стопки плашек — одна строка статуса; подробности — по кнопке, вкладками; готов — «Начать шаг».
    {
      const { page, errors } = await open(browser, width, {
        zen: true,
        progress: progressBefore('S9-01'),
        status: { stats: { crafting: 28, woodcutting: 40 } },
        events: [{ type: 'STATS', stats: { crafting: 28, woodcutting: 40 } }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Knife', carried: 0, noted: 0, bank: 1 }] }],
        localStorage: { 'osrs-put:features': JSON.stringify({ autoPrep: false }) },
      }, '#/step/S9-01');
      await page.waitForSelector('.step-status', { timeout: 8000 });
      const line = await text(page, '.status-line');
      expect(/Требуется подготовка \(\d/.test(line) && line.includes('Исправить') && line.includes('Подробнее'), `дзен: одна строка статуса с подготовкой и кнопками (${line.replace(/\s+/g, ' ').slice(0, 90)})`);
      expect(!(await page.locator('.readiness').first().isVisible()), 'дзен: панель готовности свёрнута, на экране её нет');
      expect((await text(page, '.step-details')).includes('Сделано'), 'дзен: кнопка «Сделано» на месте');
      expect(await page.locator('.zen-more').count() === 1, 'дзен: прочее — в «Подробнее о шаге»');
      await page.getByRole('button', { name: /Подробнее ▾/ }).click();
      await page.waitForTimeout(300);
      const open1 = await text(page, '.readiness');
      expect(open1.includes('Добрать Crafting') && open1.includes('К банку'), 'дзен: по «Подробнее» раскрывается вся прежняя панель подготовки');
      expect(await page.locator('.status-tab').count() >= 2, 'дзен: вкладки подробностей (подготовка, путь и игра…)');
      expect(await noOverflow(page), 'дзен: без горизонтальной прокрутки');
      expect(!errors.length, `дзен: ошибок в консоли нет ${errors.join('; ')}`);
      await page.context().close();
    }

    {
      const { page, errors } = await open(browser, width, {
        zen: true,
        progress: progressBefore('S1-04'),
        status: { stats: {} },
      }, '#/step/S1-04');
      await page.waitForSelector('.step-status', { timeout: 8000 });
      const line = await text(page, '.status-line');
      expect(line.includes('Готов к выходу') && line.includes('Начать шаг') && !line.includes('Исправить'), `дзен: готов — «Готов к выходу · Начать шаг» (${line.replace(/\s+/g, ' ').slice(0, 80)})`);
      expect(await noOverflow(page), 'дзен (готов): без горизонтальной прокрутки');
      // Переключатель в шапке: «Инспектор» возвращает все блоки.
      // На узком окне значок в шапке скрыт (как ⚔️ и 🛒) — переключатель всегда есть в Настройках.
      if (width > 480) await page.getByRole('button', { name: /переключить на «Инспектор»/ }).click();
      else {
        await page.goto(`${BASE}#/settings`);
        await page.getByRole('button', { name: /^Инспектор$/ }).click();
      }
      await page.waitForTimeout(300);
      const feat = await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:features') ?? '{}') as { inspector?: boolean });
      expect(feat.inspector === true && await page.locator('.step-status').count() === 0, 'инспектор: переключатель в шапке разворачивает блоки и прячет строку статуса');
      expect(!errors.length, `дзен (готов): ошибок в консоли нет ${errors.join('; ')}`);
      await page.context().close();
    }

    // Оптовая закупка: «уже есть» меняет «купить», сохраняется и уходит в подсказку на бирже.
    {
      const { page, errors } = await open(browser, width, {
        events: [{ type: 'OWNED', bankSeen: true, items: [{ name: 'Feather', carried: 120, noted: 0, bank: 200 }] }],
      }, '#/shopping');
      const input = page.getByLabel('Energy potion(4): сколько уже есть').first();
      await input.fill('3');
      await input.press('Enter');
      await page.waitForTimeout(900);
      const tally = await text(page, '.shop-tally');
      expect(/частично \d/.test(tally), 'закупка: отмеченные 3 из 5 — «частично»');
      const saved = await page.evaluate(() => JSON.parse(String((window as unknown as Record<string, unknown>).__saved ?? '{}')));
      expect(saved.ownedManual?.['id:3008']?.count === 3, 'закупка: отметка «уже есть 3» сохранена в прогрессе');
      const plan = await page.evaluate(() => ((window as unknown as { __posts: { path: string; body: { items: { name: string; count: number }[] } }[] }).__posts)
        .filter((p) => p.path === '/shopping-plan').pop()?.body.items ?? []);
      expect(plan.find((i) => i.name === 'Energy potion(4)')?.count === 2, 'закупка: в игру уходит «купить 2», а не 5');
      expect(plan.find((i) => i.name === 'Feather')?.count === 500, 'закупка: перья — по данным игры, плагин сам вычтет 320');
      expect(await noOverflow(page), 'закупка: без горизонтальной прокрутки');
      expect(!errors.length, `закупка: ошибок в консоли нет ${errors.join('; ')}`);
      await page.context().close();
    }

    // Снаряжение: Coif в банке при 17 Ranged — «есть, но надеть нельзя», а не совет надеть.
    {
      const gear = { equipment: [{ id: 1325, name: 'Steel scimitar', slot: 'weapon' }], inventory: [], coins: 500, bankCoins: 3000 };
      const stats = { attack: 20, strength: 20, defence: 1, ranged: 17 };
      const { page, errors } = await open(browser, width, {
        status: { ...gear, stats },
        events: [{ type: 'STATS', stats }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Coif', carried: 0, noted: 0, bank: 1 }] }],
      }, '#/gear');
      const t = await text(page, '.gear-locked');
      expect(t.includes('нужно 20 Ranged') && t.includes('Coif') && t.includes('надеть его пока нельзя'), 'снаряжение: 🔒 Coif — нужно 20 Ranged, лежит в банке');
      expect(!(await text(page, '.gear-list')).includes('Надень Coif'), 'снаряжение: Coif не советуется надеть');
      expect(await noOverflow(page), 'снаряжение: без горизонтальной прокрутки');
      expect(!errors.length, `снаряжение: ошибок в консоли нет ${errors.join('; ')}`);
      await page.context().close();
    }

    // Большая карта: цель стрелки (быстрый вариант) видна отдельной меткой.
    {
      const { page, errors } = await open(browser, width, {
        localStorage: { 'osrs-put:branch-choice': '{"S2-05":"varrock-teleport"}', 'osrs-put:active-step': 'S2-05' },
        progress: progressBefore('S2-05'),
        status: { activeStepId: 'S2-05' },
      }, '#/step/S2-05');
      await page.getByRole('button', { name: '🗺️ Карта мира' }).first().click();
      await page.waitForTimeout(800);
      const t = await text(page, '.map-source');
      expect(t.includes('Стрелка в игре ведёт') && t.includes('Varrock Teleport'), 'карта: метка «Стрелка в игре ведёт к Varrock Teleport»');
      expect(await page.locator('.map-arrow-pin').count() === 1, 'карта: метка 🧭 на карте');
      expect(!errors.length, `карта: ошибок в консоли нет ${errors.join('; ')}`);
      await page.context().close();
    }

    // Точка шага → игра: «Вести сюда в игре» ставит цель с NPC точки; «Показать в игре» отдаёт панели RuneLite
    // «что нужно / где взять / точки шага».
    {
      const { page, errors } = await open(browser, width, { progress: progressBefore('S2-03') }, '#/step/S2-03');
      await page.getByRole('radio', { name: /Eye of newt — Betty/ }).click();
      await page.getByRole('button', { name: '🧭 Вести сюда в игре' }).click();
      await page.waitForTimeout(500);
      type Post = { path: string; body: Record<string, unknown> };
      const posts = () => page.evaluate(() => (window as unknown as { __posts: Post[] }).__posts);
      const nav = (await posts()).filter((p) => p.path === '/nav-target').pop()?.body;
      expect(nav?.x === 3014 && JSON.stringify(nav?.npcNames) === '["Betty"]' && nav?.stepId === 'S2-03',
        'карта шага: «Вести сюда в игре» — цель у Betty с подсветкой NPC');
      await page.getByRole('button', { name: '🧭 Показать в игре' }).first().click();
      await page.waitForTimeout(500);
      const guide = (await posts()).filter((p) => p.path === '/active-step').pop()?.body.guide as
        { items: { name: string; where?: string }[]; places: { label: string; items?: string[] }[] } | undefined;
      expect(guide?.items.length === 4 && guide.items.every((i) => i.where) && guide.places.length === 5,
        'показать в игре: панели RuneLite уходят 4 предмета с «где взять» и 5 точек');
      expect(await noOverflow(page), 'карта шага: без горизонтальной прокрутки');
      expect(!errors.length, `карта шага: ошибок в консоли нет ${errors.join('; ')}`);
      await page.context().close();
    }

    // Шаг-заработок: монеты против цели.
    {
      const gear = { equipment: [], inventory: [], coins: 300, bankCoins: 12000, carriedValue: 4200, bankValue: 5000 };
      const { page } = await open(browser, width, { progress: progressBefore('S1-13'), status: gear, events: [{ type: 'GEAR', gear }] }, '#/step/S1-13');
      const t = await text(page, '.money-goal');
      expect(t.includes('12 300 / 20 000') && t.includes('не хватает 7 700'), 'заработок: «Монеты: 12 300 / 20 000 gp — не хватает 7 700»');
      expect(t.includes('~9 200'), 'заработок: предметы — отдельно, с «~»');
      await page.context().close();
    }

    // Старый плагин без поля protocol — просьба перезапустить RuneLite.
    {
      const { page } = await open(browser, width, {}, '#/settings');
      const t = await text(page, '.plaque-warning');
      expect(t.includes('старый плагин') && t.includes('перезапусти RuneLite'), 'настройки: плагин без рукопожатия — «старый плагин, перезапусти RuneLite»');
      await page.context().close();
    }

    // Плагин 2.10 (протокол 3) при программе 2.11: на карточке шага — что его нет и что сделать; с новым — подсказка о списке.
    {
      const { page } = await open(browser, width, {
        localStorage: { 'osrs-put:active-step': 'S2-03' }, progress: progressBefore('S2-03'),
        status: { activeStepId: 'S2-03', protocol: 3, pluginVersion: '2.10.0' },
      }, '#/step/S2-03');
      const t = await text(page, '.ingame');
      expect(t.includes('старый плагин 2.10.0') && t.includes('список «Что нужно» на экране игры'), 'шаг: плагин 2.10 — «перезапусти RuneLite», без списка в игре');
      await page.context().close();
      const fresh = await open(browser, width, {
        localStorage: { 'osrs-put:active-step': 'S2-03' }, progress: progressBefore('S2-03'),
        status: { activeStepId: 'S2-03', protocol: 5, pluginVersion: '2.12.0' },
      }, '#/step/S2-03');
      const f = await text(fresh.page, '.ingame');
      expect(f.includes('список «Что нужно»') && !f.includes('старый плагин'), 'шаг: плагин 2.12 — подсказка, где в игре список «Что нужно»');
      expect(!fresh.errors.length, `шаг: ошибок в консоли нет ${fresh.errors.join('; ')}`);
      await fresh.page.context().close();
    }

    // 2.12: чужой персонаж не пишет в активный профиль и получает предложение; опыт из игры виден на странице навыка.
    {
      const profiles = JSON.stringify({ active: 'main', list: [{ id: 'main', name: 'Основной', player: 'Alpha One' }] });
      const { page, errors } = await open(browser, width, {
        localStorage: { 'osrs-put:profiles': profiles },
        status: { protocol: 5, pluginVersion: '2.12.0', player: 'Beta Two', xp: { woodcutting: 10, strength: 0 } },
      }, '#/skills/WC');
      await page.waitForSelector('.plaque-warning', { timeout: 5000 });
      const t = await text(page, '.plaque-warning');
      expect(t.includes('новый персонаж') && t.includes('Beta Two'), 'профиль: чужой персонаж — предложение создать профиль');
      expect(!errors.length, `профиль: ошибок в консоли нет ${errors.join('; ')}`);
      await page.context().close();

      const ok = await open(browser, width, {
        localStorage: { 'osrs-put:profiles': profiles },
        status: { protocol: 5, pluginVersion: '2.12.0', player: 'Alpha One', xp: { woodcutting: 10 } },
      }, '#/skills/WC');
      await ok.page.waitForSelector('.live-xp', { timeout: 5000 });
      const x = await text(ok.page, '.live-xp');
      expect(x.includes('до ') && x.includes('опыта'), 'навык: опыт из игры — «до уровня ещё N опыта»');
      expect((await ok.page.locator('.plaque-warning').count()) === 0, 'профиль: свой персонаж — без предупреждения');
      await ok.page.context().close();
    }

    // 2.19.2: журнал ресурсов живёт между сеансами — записи прежнего запуска на месте, чужого персонажа не видно, очистка работает.
    {
      const profiles = JSON.stringify({ active: 'main', list: [{ id: 'main', name: 'Основной', player: 'Alpha One' }] });
      const now = Date.now();
      const rows = [
        { name: 'Coins', quantityDelta: 5000, reason: 'LOOT', timestamp: now - 3 * 24 * 3600_000, estimatedGpValue: 5000 },
        { name: 'Cowhide', quantityDelta: 10, reason: 'LOOT', timestamp: now - 3 * 24 * 3600_000, estimatedGpValue: 1000 },
      ];
      const key = (who: string) => `osrs-put:ledger:main:${who}`;
      const { page, errors } = await open(browser, width, {
        localStorage: { 'osrs-put:profiles': profiles, [key('alpha one')]: JSON.stringify(rows), [key('beta two')]: JSON.stringify(rows.slice(0, 1)) },
        status: { protocol: 5, pluginVersion: '2.19.2', player: 'Alpha One' },
      }, '#/settings');
      await page.waitForSelector('.ledger-block', { timeout: 5000 });
      const t = await text(page, '.ledger-block');
      expect(t.includes('записей 2') && t.includes('Монеты +'), 'журнал: записи прежнего запуска на месте');
      await page.getByRole('button', { name: 'Очистить журнал' }).click();
      await page.getByRole('button', { name: 'Да, очистить журнал' }).click();
      await page.waitForFunction(() => document.body.innerText.includes('Журнал ресурсов пуст'), null, { timeout: 5000 });
      const left = await page.evaluate((k) => ({ a: localStorage.getItem(k.a), b: localStorage.getItem(k.b) }), { a: key('alpha one'), b: key('beta two') });
      expect(left.a === null && left.b !== null, 'журнал: очистка стирает журнал этого персонажа и не трогает чужой');
      expect(!errors.length, `журнал: ошибок в консоли нет ${errors.join('; ')}`);
      await page.context().close();
    }

    // 2.12.1: Magic 25 есть, а рун нет — быстрый Varrock Teleport не выдаётся за готовый, а говорит, чего не хватает.
    {
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S2-05'),
        events: [{ type: 'STATS', stats: { magic: 25 } }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Law rune', carried: 0, noted: 0, bank: 0 }, { name: 'Air rune', carried: 0, noted: 0, bank: 0 }] }],
      }, '#/step/S2-05');
      await page.waitForSelector('.branch-missing', { timeout: 5000 });
      const t = await text(page, '.branch-missing');
      expect(t.includes('Не хватает') && t.includes('Law rune'), 'быстрый вариант: нет рун — «не хватает Law rune»');
      expect((await page.locator('.branch button:has-text("Вести в игре")').count()) === 0, 'быстрый вариант: без рун не ведёт в игре телепортом');
      expect(!errors.length, `быстрый вариант: ошибок в консоли нет ${errors.join('; ')}`);
      await page.context().close();
    }

    // 2.13: S2-04 — расчёт магии по ценам биржи и «как добрать деньги» под уровни игрока.
    {
      const prices = { 556: 6, 558: 3, 555: 6, 557: 6, 554: 6, 563: 120, 1381: 1542, 1383: 1500, 1385: 1500, 1387: 940, 1739: 125 };
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S2-04'), prices,
        events: [{ type: 'STATS', stats: { magic: 10, mining: 1, attack: 5, strength: 5, defence: 5 } }, { type: 'XP', xp: { magic: 1200 } }],
      }, '#/step/S2-04');
      await page.waitForSelector('.magic-plan table', { timeout: 6000 });
      const t = await text(page, '.magic-plan');
      expect(t.includes('Только Wind Strike') && t.includes('посох огня') && t.includes('Magic 25'), 'S2-04: расчёт магии — варианты и посох огня');
      expect(t.includes('шкур'), 'S2-04: сколько шкур окупает руны');
      await page.locator('.money-plan summary').click();
      const m = await text(page, '.money-plan');
      expect(m.includes('Как добрать деньги') && m.includes('gp/ч'), 'S2-04: «Как добрать деньги» — способы с выручкой в час');
      expect((await page.locator('.money-method').count()) > 0, 'S2-04: у блока денег есть способы');
      await page.locator('.style-gear summary').click();
      await page.waitForSelector('.style-row', { timeout: 6000 });
      const sg = await text(page, '.style-gear');
      expect(sg.includes('Что носить для магии') && sg.includes('Оружие:') && sg.includes('Рекомендации OSRS Wiki'), 'S2-04: «Что носить для магии» — слоты и источник');
      expect(await noOverflow(page), 'S2-04: экипировка без горизонтальной прокрутки');
      expect(!errors.length, `S2-04: ошибок в консоли нет ${errors.join('; ')}`);
      await page.context().close();
    }

    // 2.15: бой с драконом (S5-08) — «Еда на бой»: удары Elvarg по вики и совет по еде.
    {
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S5-08'),
        events: [{ type: 'STATS', stats: { hitpoints: 40 } }],
      }, '#/step/S5-08');
      const f = await text(page, '.food-advice');
      expect(f.includes('Еда на бой') && f.includes('Elvarg') && f.includes('Ешь, когда HP ниже'), 'S5-08: «Еда на бой» — удары Elvarg и порог еды');
      expect(await noOverflow(page), 'S5-08: без горизонтальной прокрутки');
      expect(!errors.length, `S5-08: ошибок в консоли нет ${errors.join('; ')}`);
      await page.context().close();
    }

    // 2.14: «Где я? Как добраться» — положение из игры, варианты до Varrock (S2-05) и их доступность.
    {
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S2-05'),
        status: {
          protocol: 5, pluginVersion: '2.13.0', pos: { x: 3222, y: 3218, plane: 0 }, stats: { magic: 25, woodcutting: 20 },
          coins: 500, equipment: [], inventory: [{ id: 563, name: 'Law rune', count: 1 }, { id: 556, name: 'Air rune', count: 3 }, { id: 554, name: 'Fire rune', count: 1 }],
        },
      }, '#/step/S2-05');
      await page.getByRole('button', { name: /Где я/ }).click();
      await page.waitForSelector('.travel-option', { timeout: 5000 });
      const t = await text(page, '.travel-plan');
      expect(t.includes('Телепорт в Varrock') && t.includes('можно сейчас'), 'как добраться: Varrock Teleport с рунами — «можно сейчас»');
      expect(t.includes('3222, 3218'), 'как добраться: показано положение из игры');
      // Текст не налезает на плашку статуса: у каждого варианта название и плашка не пересекаются.
      const overlaps = await page.evaluate(() => {
        const bad: string[] = [];
        document.querySelectorAll('.travel-option').forEach((o) => {
          const a = o.querySelector('.travel-title')?.getBoundingClientRect();
          const b = o.querySelector('.travel-badge')?.getBoundingClientRect();
          if (a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) bad.push(o.textContent?.slice(0, 40) ?? '');
        });
        return bad;
      });
      expect(overlaps.length === 0, `как добраться: название не налезает на плашку (${overlaps.join(' | ')})`);
      // Выпадающий список в стиле приложения, а не системный белый.
      const sel = await page.evaluate(() => {
        const el = document.querySelector('.travel-plan select') as HTMLSelectElement | null;
        if (!el) return null;
        const cs = getComputedStyle(el);
        const probe = document.createElement('div');
        probe.style.backgroundColor = 'var(--surface)';
        document.body.appendChild(probe);
        const surface = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return { appearance: cs.appearance, bg: cs.backgroundColor, surface };
      });
      expect(sel !== null && sel.appearance === 'none' && sel.bg === sel.surface, `как добраться: select в стиле приложения (${JSON.stringify(sel)})`);
      expect(!errors.length, `как добраться: ошибок в консоли нет ${errors.join('; ')}`);
      await page.context().close();
    }

    // «Одна ходка»: банк открыт, предметов шага и ближайших нет — что взять сейчас, заодно и потом; неизвестное — отдельно.
    {
      const route = JSON.parse(readFileSync(new URL('../src/data/steps.json', import.meta.url), 'utf8')) as { id: string; itemsRequired?: { nameEn: string; amount: string | number; inStep?: boolean }[] }[];
      const at = route.findIndex((x) => x.id === 'S2-10');
      const names = route.slice(at, at + 4).flatMap((x) => (x.itemsRequired ?? []).filter((i) => !i.inStep).map((i) => i.nameEn));
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S2-10'),
        status: { protocol: 5, pluginVersion: '2.13.0', pos: { x: 3222, y: 3218, plane: 0 }, stats: {}, coins: 100, bankCoins: 0, equipment: [], inventory: [] },
        events: [{ type: 'OWNED', bankSeen: true, items: [...new Set(names)].map((n) => ({ name: n, carried: 0, noted: 0, bank: 0 })) }],
      }, '#/step/S2-10');
      await page.waitForSelector('.one-trip', { timeout: 5000 });
      const trip = await text(page, '.one-trip');
      expect(trip.includes('Возьми за один заход') && trip.includes('Сейчас') && trip.includes('Открыть закупки'), 'одна ходка: список «Сейчас» и ссылка на закупки');
      expect(await noOverflow(page), 'одна ходка: без горизонтальной прокрутки');
      expect(!errors.length, `одна ходка: ошибок в консоли нет ${errors.join('; ')}`);
      await page.context().close();
    }

    // Квест сдан — «Проверка вылета» не требует предметов, которых уже нет.
    {
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S2-10'),
        status: { protocol: 5, questsDone: ['Prince Ali Rescue'], pluginVersion: '2.13.0', pos: { x: 3222, y: 3218, plane: 0 }, stats: {}, coins: 0, equipment: [], inventory: [] },
      }, '#/step/S2-10');
      await page.waitForTimeout(500);
      const t = await text(page, '.preflight-verdict');
      expect(t.includes('Шаг выполнен') && !/Не готов|не хватает/i.test(t), `сданный квест: проверка вылета не ругается на пустую сумку (${t.slice(0, 80)})`);
      expect(!errors.length, `сданный квест: ошибок в консоли нет ${errors.join('; ')}`);
      await page.context().close();
    }

    // Квест с NPC: на карте шага — точки NPC и откуда предметы, как в списке в игре.
    {
      const { page, errors } = await open(browser, width, { progress: progressBefore('S2-10') }, '#/step/S2-10');
      const chips = await page.locator('.spot-chip').allInnerTexts();
      expect(chips.some((c) => c.includes('Ned')) && chips.some((c) => c.includes('Lady Keli')) && chips.some((c) => c.includes('Prince Ali')),
        `карта шага: NPC квеста точками (${chips.length})`);
      await page.getByRole('radio', { name: /Ned — дом в Draynor Village/ }).click();
      await page.getByRole('button', { name: '🧭 Вести сюда в игре' }).click();
      await page.waitForTimeout(500);
      const nav = await page.evaluate(() => (window as unknown as { __posts: { path: string; body: Record<string, unknown> }[] }).__posts
        .filter((p) => p.path === '/nav-target').pop()?.body);
      expect(JSON.stringify(nav?.npcNames) === '["Ned"]' && nav?.x === 3099, 'карта шага: «Вести сюда в игре» к Ned с подсветкой');
      expect(await noOverflow(page), 'карта шага с NPC: без горизонтальной прокрутки');
      expect(!errors.length, `карта шага с NPC: ошибок в консоли нет ${errors.join('; ')}`);
      await page.context().close();
    }
  }

  // Все страницы: шаги, навыки, справка — открываются без ошибок в консоли, без падения и горизонтальной прокрутки.
  console.log('Все страницы');
  const skillIds = [
    ...(JSON.parse(readFileSync(new URL('../src/data/skills.json', import.meta.url), 'utf8')) as { id: string }[]).map((x) => x.id),
    ...(JSON.parse(readFileSync(new URL('../src/data/members-skills.json', import.meta.url), 'utf8')) as { skills: { id: string }[] }).skills.map((x) => x.id),
  ];
  const routes = ['#/', '#/skills', '#/goals', '#/quests', '#/reference', '#/settings', '#/shopping', '#/gear',
    ...steps.map((x) => `#/step/${x.id}`), ...skillIds.map((id) => `#/skills/${id}`)];
  for (const width of [390, 1280]) {
    const { page, errors } = await open(browser, width, { progress: progressBefore('S2-10') }, '#/');
    const bad: string[] = [];
    for (const r of routes) {
      const before = errors.length;
      await page.evaluate((h) => { location.hash = h; }, r);
      await page.waitForTimeout(120);
      const info = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        crashed: !!document.querySelector('.page-error'),
      }));
      if (info.overflow > 0) bad.push(`${r}: прокрутка ${info.overflow}px`);
      if (info.crashed) bad.push(`${r}: страница упала`);
      if (errors.length > before) bad.push(`${r}: ${errors.slice(before).join('; ').slice(0, 200)}`);
    }
    expect(!bad.length, `${routes.length} страниц на ${width} точках — без ошибок и прокрутки ${bad.slice(0, 5).join(' | ')}`);
    await page.context().close();
  }

  // Content-Security-Policy собранной страницы: мета-тег есть, чужой встроенный скрипт не выполняется, а страница
  // с нашим скриптом темы и сетью только к вики работает (ошибок в консоли нет).
  console.log('CSP');
  {
    const { page, errors } = await open(browser, 1280, {}, '#/');
    expect(await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')?.includes("default-src 'none'") ?? false), 'CSP: политика в странице');
    const blocked = await page.evaluate(() => new Promise<boolean>((res) => {
      const s = document.createElement('script');
      s.textContent = 'window.__injected = 1';
      document.head.appendChild(s);
      setTimeout(() => res(!(window as unknown as Record<string, unknown>).__injected), 100);
    }));
    expect(blocked, 'CSP: чужой встроенный скрипт заблокирован');
    // Одно нарушение — наше же испытание выше; остальных быть не должно.
    const own = errors.filter((e) => /Content Security Policy|Refused/.test(e));
    expect(own.length === 1 && own[0].includes('inline script'), `CSP: наша страница не нарушает свою политику ${own.join('; ')}`);
    await page.context().close();
  }

  // Шапка помещается на любой ширине, когда RuneLite на связи (раньше вылезала на 11–193 точки).
  console.log('Шапка');
  for (const width of [320, 390, 900, 1000, 1100, 1280, 1400, 1600, 1720, 1920]) {
    const { page } = await open(browser, width, {}, '#/');
    expect(await noOverflow(page), `шапка на ${width} точках без горизонтальной прокрутки`);
    await page.context().close();
  }
}

// Адрес задан явно: без --host сервер на части машин (CI GitHub) слушает только IPv6 ::1, и 127.0.0.1 не отвечает.
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
try {
  let up = false;
  for (let i = 0; i < 150 && !up; i++) {
    up = await fetch(BASE).then((r) => r.ok).catch(() => false);
    if (!up) await new Promise((r) => setTimeout(r, 200));
  }
  if (!up) throw new Error(`Сервер предпросмотра не поднялся на ${BASE} — сначала npm run build`);
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    await run(browser);
  } finally {
    await browser.close();
  }
} finally {
  server.kill();
}
console.log(failures.length ? `\nИтог: не прошло ${failures.length}` : '\nИтог: всё прошло');
process.exit(failures.length ? 1 : 0);

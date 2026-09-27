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

    // Готовность к шагу: не хватает уровня — действие «добрать»; предмет в банке — «к банку».
    {
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S9-01'),
        status: { stats: { crafting: 28, woodcutting: 40 } },
        events: [{ type: 'STATS', stats: { crafting: 28, woodcutting: 40 } }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Knife', carried: 0, noted: 0, bank: 1 }] }],
      }, '#/step/S9-01');
      const t = await text(page, '.readiness');
      expect(t.includes('Нужна короткая подготовка') && t.includes('Добрать Crafting'), 'готовность: не хватает Crafting 31 — «⚡ Добрать Crafting»');
      expect(t.includes('К банку'), 'готовность: Knife в банке — «🧭 К банку»');
      expect(await noOverflow(page), 'шаг: без горизонтальной прокрутки');
      expect(!errors.length, `шаг: ошибок в консоли нет ${errors.join('; ')}`);
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
        status: { activeStepId: 'S2-03', protocol: 4, pluginVersion: '2.11.0' },
      }, '#/step/S2-03');
      const f = await text(fresh.page, '.ingame');
      expect(f.includes('список «Что нужно»') && !f.includes('старый плагин'), 'шаг: плагин 2.11 — подсказка, где в игре список «Что нужно»');
      expect(!fresh.errors.length, `шаг: ошибок в консоли нет ${fresh.errors.join('; ')}`);
      await fresh.page.context().close();
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

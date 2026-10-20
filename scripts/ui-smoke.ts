// npm run test:ui — a run of the interface in a real browser (Chromium through Playwright), as the player has it in the exe:
// the built page, a stub desktop app (window.osrsDesktop) and a stub RuneLite bridge. The network to the wiki
// is closed — it checks that everything works without it too. It needs a build (npm run build) and Chromium
// (npx playwright install chromium). These scenarios used to live outside the repository.

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
  /** The "Zen" mode (by default the tests turn "Inspector" on: all the step blocks are expanded, as it was checked before). */
  zen?: boolean;
  /** The exchange prices by item ID: they stand in for the prices.runescape.wiki reply (without them the network to the wiki is closed). */
  prices?: Record<number, number>;
  /** The exchange as captured on 2026-10-18 (tests/funding/fixtures), with its times moved to now: latest, hourly and the item reference. */
  market?: boolean;
  /** The plugin does not answer (RuneLite is not running). */
  offline?: boolean;
  /** A reachable bridge rejects the guide snapshot for its size. */
  oversizedSnapshot?: boolean;
  /** Windows display scaling (1.25 = 125%): the device pixel ratio; the viewport width passed is then in CSS pixels. */
  scale?: number;
}

/** The progress: everything before the step is closed. */
function progressBefore(id: string, extra: Record<string, unknown> = {}) {
  const ids = steps.map((s) => s.id);
  const done = Object.fromEntries(ids.slice(0, ids.indexOf(id)).map((s) => [s, 'done']));
  return { version: 3, steps: done, levels: {}, notes: {}, updatedAt: '2026-09-27T10:00:00.000Z', gameMode: 'members', ...extra };
}

async function open(browser: Browser, width: number, mock: Mock, hash: string): Promise<{ page: Page; errors: string[] }> {
  const ctx = await browser.newContext({
    viewport: { width, height: mock.scale ? Math.round(1040 / mock.scale) : 900 }, colorScheme: width < 600 ? 'light' : 'dark',
    ...(mock.scale ? { deviceScaleFactor: mock.scale } : {}),
  });
  await ctx.addInitScript((m: Mock) => {
    for (const [k, v] of Object.entries(m.localStorage ?? {})) localStorage.setItem(k, v);
    try {
      const f = JSON.parse(localStorage.getItem('osrs-put:features') ?? '{}') as Record<string, unknown>;
      if (f.inspector === undefined) f.inspector = !m.zen;
      localStorage.setItem('osrs-put:features', JSON.stringify(f));
    } catch { /* no storage */ }
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
      runelite: { check: async () => ({ ok: true, problems: [], clientVersion: '1.12.39', credentials: true }), launch: async () => { w.__launched = ((w.__launched as number) ?? 0) + 1; return { ok: true, state: 'started' }; } },
      bridge: {
        request: async (method: string, path: string, body: unknown) => {
          posts.push({ method, path, body });
          if (m.offline) return { ok: false, status: 0, data: null };
          // __status: what a scenario changes in the plugin's answer after the page has loaded (the quest cursor moving on).
          if (path === '/status') return { ok: true, status: 200, data: { status: 'ok', inGame: true, activeStepId: null, shortestPath: true, ...(m.status ?? {}), ...((w.__status as Record<string, unknown>) ?? {}) } };
          if (path === '/prep-plan' && m.oversizedSnapshot) return { ok: false, status: 413, data: { error: 'body too large' } };
          return { ok: true, status: 200, data: { ok: true } };
        },
        openEvents: (onEvent: (d: string) => void, onState: (s: string) => void) => {
          w.__emit = (e: unknown) => onEvent(JSON.stringify(e));
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
  if (mock.market) {
    type Row = { id: number; limit: number | null; high: number | null; low: number | null; avgHigh: number | null; avgLow: number | null; highVolume: number; lowVolume: number };
    const rows = (JSON.parse(readFileSync(new URL('../tests/funding/fixtures/market-2026-10-18.json', import.meta.url), 'utf8')) as { items: Record<string, Row> }).items;
    await page.route(/prices\.runescape\.wiki\/api\/v2\/osrs\/(latest|1h|mapping)/, (r) => {
      const kind = /\/osrs\/(latest|1h|mapping)/.exec(r.request().url())![1];
      const now = Math.floor(Date.now() / 1000);
      if (kind === 'mapping') return r.fulfill({ json: Object.entries(rows).map(([name, x]) => ({ id: x.id, name, limit: x.limit ?? undefined, members: false })) });
      if (kind === 'latest') return r.fulfill({ json: { data: Object.fromEntries(Object.values(rows).map((x) => [x.id, { high: x.high, highTime: x.high === null ? null : now - 90, low: x.low, lowTime: x.low === null ? null : now - 120 }])) } });
      return r.fulfill({ json: { timestamp: now, data: Object.fromEntries(Object.values(rows).map((x) => [x.id, { avgHighPrice: x.avgHigh, highPriceVolume: x.highVolume, avgLowPrice: x.avgLow, lowPriceVolume: x.lowVolume }])) } });
    });
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
/**
 * A step is one workspace with four views (Steps, Preparation, Travel, Details). Opens the view whose content matches the selector, so the
 * scenarios keep asking "is this on the page" without caring which tab holds it. Nothing happens off the Path page, or when it is already shown.
 */
async function reveal(page: Page, sel: string) {
  if (await page.locator(sel).count()) return;
  // The cockpit: Preparation, Travel and Details are drawers. The companion strip: Now, Bag, Route and More are tabs.
  const openers = [page.getByRole('navigation', { name: 'Step views' }).getByRole('button'), page.getByRole('tablist', { name: 'Companion views' }).getByRole('tab')];
  for (const group of openers) {
    const n = await group.count();
    for (let i = 0; i < n; i++) {
      await group.nth(i).click();
      await page.waitForTimeout(150);
      if (await page.locator(sel).count()) return;
      await page.keyboard.press('Escape');
    }
  }
}
/** waitForSelector for something that may live in another workspace tab. */
async function waitFor(page: Page, sel: string, timeout: number) {
  await reveal(page, sel);
  await page.waitForSelector(sel, { timeout });
}

/** A button of the step workspace, found in whichever tab holds it. */
async function stepButton(page: Page, name: string | RegExp, role: 'button' | 'radio' = 'button') {
  // The map and its button are on the cockpit and in the Travel drawer when that is open: the last one is the drawer's, which is the one in front.
  const find = () => page.getByRole(role, { name }).last();
  if (await find().count()) return find();
  const openers = [page.getByRole('navigation', { name: 'Step views' }).getByRole('button'), page.getByRole('tablist', { name: 'Companion views' }).getByRole('tab')];
  for (const group of openers) {
    const total = await group.count();
    for (let i = 0; i < total; i++) {
      await group.nth(i).click();
      await page.waitForTimeout(150);
      if (await find().count()) return find();
      await page.keyboard.press('Escape');
    }
  }
  return find();
}
const text = async (page: Page, sel: string) => {
  await reveal(page, sel);
  return page.locator(sel).allInnerTexts().then((t) => t.join('\n'));
};

async function run(browser: Browser) {
  // Recovery uses the real StoreProvider: a parser test alone would not catch its automatic save overwriting a valid source.
  {
    const progress = progressBefore('S3-05', { notes: { 'S3-05': 'recovered from disk' } });
    const { page, errors } = await open(browser, 1280, { offline: true, progress, localStorage: { 'osrs-put:progress': '{broken' } }, '#/settings');
    const saved = await page.evaluate(() => JSON.parse((window as unknown as { __saved: string }).__saved));
    expect(saved.notes['S3-05'] === 'recovered from disk', 'progress recovery: damaged browser storage cannot beat the valid file');
    expect(await page.evaluate(() => localStorage.getItem('osrs-put:progress:recovery:local')) === '{broken', 'progress recovery: the damaged source is kept');
    expect(await page.locator('.progress-storage-warning').count() === 0 && !errors.length, 'progress recovery: recovered progress saves normally without errors');
    await page.context().close();
  }
  {
    const { page, errors } = await open(browser, 1280, { offline: true, progress: { ...progressBefore('S3-05'), version: 99 } }, '#/settings');
    expect(await page.locator('.progress-storage-warning').isVisible(), 'progress recovery: unsupported file shows a saving-paused warning');
    expect(await page.evaluate(() => (window as unknown as { __saved?: string }).__saved === undefined), 'progress recovery: an unsupported save is not automatically overwritten');
    expect(!errors.length, 'progress recovery: unsupported format does not crash the page');
    await page.getByRole('tab', { name: 'Progress and copies', exact: true }).click();
    const imported = progressBefore('S4-03', { notes: { 'S4-03': 'explicit compatible import' } });
    await page.locator('input[type="file"]').setInputFiles({ name: 'recovery.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
    await page.getByRole('button', { name: 'Replace', exact: true }).click();
    await page.waitForTimeout(400);
    expect(await page.locator('.progress-storage-warning').count() === 0, 'progress recovery: explicit compatible import resumes saving');
    expect(await page.evaluate(() => JSON.parse((window as unknown as { __saved: string }).__saved).notes['S4-03']) === 'explicit compatible import', 'progress recovery: the explicitly imported progress is saved');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:progress:recovery:file')!).version) === 99, 'progress recovery: explicit import retains the unsupported original');
    await page.getByRole('button', { name: 'Reset progress', exact: true }).click();
    await page.getByRole('button', { name: 'Yes, reset everything', exact: true }).click();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => Object.keys(JSON.parse((window as unknown as { __saved: string }).__saved).steps).length) === 0, 'progress recovery: explicit reset saves a fresh state after recovery');
    expect(!errors.length, 'progress recovery: import and reset have no page errors');
    await page.context().close();
  }
  {
    const { page, errors } = await open(browser, 1280, { offline: true, progress: progressBefore('S3-05') }, '#/settings');
    const before = await page.evaluate(() => (window as unknown as { __saved: string }).__saved);
    await page.evaluate(() => {
      const bad = JSON.stringify({ version: 99, steps: {} });
      localStorage.setItem('osrs-put:progress', bad);
      window.dispatchEvent(new StorageEvent('storage', { key: 'osrs-put:progress', newValue: bad }));
    });
    await page.waitForTimeout(400);
    expect(await page.locator('.progress-storage-warning').isVisible(), 'progress recovery: an unsupported cross-window update pauses saving');
    expect(await page.evaluate(() => (window as unknown as { __saved: string }).__saved) === before, 'progress recovery: cross-window corruption cannot overwrite the working file');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:progress:recovery:local')!).version) === 99 && !errors.length, 'progress recovery: the cross-window source is preserved without a crash');
    await page.context().close();
  }
  {
    const { page, errors } = await open(browser, 1280, {
      oversizedSnapshot: true, progress: progressBefore('S3-05'), status: { protocol: 6, pluginVersion: '2.74.0', activeStepId: 'S3-05' },
      localStorage: { 'osrs-put:active-step': 'S3-05' },
    }, '#/step/S3-05');
    await page.getByText(/The game guide could not sync: its data exceeds/).waitFor({ timeout: 5000 });
    expect(await page.locator('.bridge-indicator.is-online').count() === 1, 'bridge limits: snapshot 413 does not mark a reachable game offline');
    expect(!errors.length, 'bridge limits: snapshot refusal has an explanation without a page crash');
    await page.context().close();
  }
  if (process.env.UI_ONLY === 'stabilization') return;
  for (const width of [390, 1280]) {
    const equipment = [[1329, 'Mithril scimitar', 'weapon'], [1153, 'Iron full helm', 'head'], [1115, 'Iron platebody', 'body'], [1081, 'Iron plateskirt', 'legs'], [1191, 'Iron kiteshield', 'shield']]
      .map(([id, name, slot]) => ({ id, name, slot }));
    const stats = { attack: 22, strength: 16, defence: 1, hitpoints: 22 };
    const gear = { equipment, inventory: [{ id: 330, name: 'Salmon', count: 40, noted: true }], coins: 500, bankCoins: 3000 };
    const { page, errors } = await open(browser, width, {
      zen: true, progress: progressBefore('S3-08'), localStorage: { 'osrs-put:active-step': 'S3-08' },
      status: { protocol: 6, ...gear, stats, activeStepId: 'S3-08' },
      events: [{ type: 'STATS', stats }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Salmon', carried: 0, noted: 40, bank: 0, exactCarried: 0, exactNoted: 40, exactBank: 0 }] }],
    }, '#/step/S3-08');
    await page.getByText(/Bank: unnote/i).first().waitFor({ timeout: 8000 });
    expect((await page.locator('main').innerText()).includes('Unnote at bank'), `notes (${width}): notes are an action, not ready-to-eat food`);
    expect(await page.evaluate(() => (window as unknown as { __posts: { path: string; body?: { plan?: { lines: { name: string; unnote?: number }[] } } }[] }).__posts.some((p) => p.path === '/prep-plan' && p.body?.plan?.lines.some((l) => l.name === 'Salmon' && (l.unnote ?? 0) > 0))), `notes (${width}): the actual game snapshot carries the unnote action`);
    expect(await noOverflow(page) && !errors.length, `notes (${width}): no overflow or console errors`);
    await page.evaluate(() => (window as unknown as { __emit: (e: unknown) => void }).__emit({ type: 'OWNED', bankSeen: true, items: [{ name: 'Salmon', carried: 26, noted: 14, bank: 0, exactCarried: 26, exactNoted: 14, exactBank: 0 }] }));
    await page.waitForTimeout(800);
    expect(!(await page.locator('main').innerText()).includes('Unnote at bank'), `notes (${width}): unnoting clears the action after the live ownership update`);
    await page.context().close();
  }
  if (process.env.UI_ONLY === 'items') return;
  if (process.env.UI_ONLY === 'funding') { await fundingScenarios(browser); return; }
  if (process.env.UI_ONLY === 'combat') { await combatRouteScenarios(browser); return; }
  if (process.env.UI_ONLY === 'shopping') { await shoppingScenarios(browser); return; }
  if (process.env.UI_ONLY === 'gear') { await gearScenarios(browser); return; }
  if (process.env.UI_ONLY === 'money') { await moneyScenarios(browser); return; }
  for (const width of [390, 1100]) {
    console.log(`Width ${width}`);

    // Step readiness: a level is missing — the action "catch up"; an item is in the bank — "to the bank". The auto preparation is off —
    // the trip starts with a button (the auto queue is checked below).
    {
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S9-01'),
        status: { stats: { crafting: 28, woodcutting: 40 } },
        events: [{ type: 'STATS', stats: { crafting: 28, woodcutting: 40 } }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Knife', carried: 0, noted: 0, bank: 1 }] }],
        localStorage: { 'osrs-put:features': JSON.stringify({ autoPrep: false }) },
      }, '#/step/S9-01');
      const t = await text(page, '.readiness');
      expect(t.includes('A short preparation is needed') && t.includes('Catch up Crafting'), 'readiness: Crafting 31 is missing — "⚡ Catch up Crafting"');
      expect(t.includes('To the bank'), 'readiness: Knife is in the bank — "🧭 To the bank"');
      // The preparation route: one main thing, the start button, the return to the step; the trip survives a page reload.
      const prep = await text(page, '.prep-route');
      expect(prep.includes('Preparing for S9-01') && prep.includes('Start the preparation') && prep.includes('then we return to S9-01'), 'preparation: the main thing, the button and the return to the step');
      await (await stepButton(page, /Start the preparation/)).click();
      await page.waitForTimeout(300);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:prep') ?? '{}') as { stack?: { sourceStepId: string }[] });
      expect(saved.stack?.length === 1 && saved.stack[0].sourceStepId === 'S9-01', 'preparation: the trip was remembered in the storage');
      await page.reload();
      await page.waitForTimeout(1200);
      expect((await text(page, '.prep-route')).includes('Preparation underway'), 'preparation: after a reload the trip is still going');
      expect(await noOverflow(page), 'step: no horizontal scrolling');
      expect(!errors.length, `step: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // The auto queue of the preparation: it sets the arrow to the bank for a Knife by itself, remembers the trip, survives a reload;
    // the player cleared the arrow — the queue is paused, "Continue" brings it back.
    {
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S9-01'),
        status: { stats: { crafting: 40, woodcutting: 40 } },
        events: [{ type: 'STATS', stats: { crafting: 40, woodcutting: 40 } }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Knife', carried: 0, noted: 0, bank: 1 }] }],
      }, '#/step/S9-01');
      type Post = { path: string; body: Record<string, unknown> };
      const posts = () => page.evaluate(() => (window as unknown as { __posts: Post[] }).__posts);
      // The link with the game and the bank do not arrive at once — we wait until the queue starts a trip.
      await page.waitForFunction(() => (window as unknown as { __posts: Post[] }).__posts.some((p) => p.path === '/nav-target'), null, { timeout: 10000 }).catch(() => undefined);
      await page.waitForTimeout(300);
      const nav = (await posts()).filter((p) => p.path === '/nav-target').pop()?.body;
      expect(nav?.itemName === 'Knife' && nav?.stepId === 'S9-01', 'auto queue: the arrow leads to the bank for a Knife by itself');
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:prep') ?? '{}') as { stack?: { sourceStepId: string; detourId: string }[] });
      expect(saved.stack?.length === 1 && saved.stack[0].detourId === 'bank', 'auto queue: the trip started by itself and was remembered');
      expect((await text(page, '.prep-route')).includes('Preparation underway'), 'auto queue: the preparation block says "Preparation underway"');
      const navCount = (await posts()).filter((p) => p.path === '/nav-target').length;
      await page.waitForTimeout(800);
      expect((await posts()).filter((p) => p.path === '/nav-target').length === navCount, 'auto queue: the arrow is not jerked in circles');
      await page.reload();
      await page.waitForTimeout(1200);
      expect((await text(page, '.prep-route')).includes('Preparation underway'), 'auto queue: after a reload the trip is still going');
      expect(!errors.length, `auto queue: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // The player cleared the arrow themselves — the queue is paused and does not set it any more.
    {
      const target = { label: 'Bank: take Knife', x: 3185, y: 3436, plane: 0, itemName: 'Knife', stepId: 'S9-01' };
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S9-01'),
        status: { protocol: 5, stats: { crafting: 40, woodcutting: 40 }, navTarget: target },
        events: [{ type: 'STATS', stats: { crafting: 40, woodcutting: 40 } }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Knife', carried: 0, noted: 0, bank: 1 }] }],
        localStorage: { 'osrs-put:prep': JSON.stringify({ stack: [{ sourceStepId: 'S9-01', detourId: 'bank', reason: 'Take it from the bank', startedAt: 1, returnCondition: 'done' }], done: [] }) },
      }, '#/step/S9-01');
      await (await stepButton(page, /Return to the step now/)).click();
      await page.waitForTimeout(700);
      expect((await text(page, '.prep-route')).includes('Continue the preparation'), 'pause: after the arrow is cleared — "Continue the preparation"');
      type Post = { path: string };
      const navs = (await page.evaluate(() => (window as unknown as { __posts: Post[] }).__posts)).filter((p) => p.path === '/nav-target').length;
      await page.waitForTimeout(800);
      const after = (await page.evaluate(() => (window as unknown as { __posts: Post[] }).__posts)).filter((p) => p.path === '/nav-target').length;
      expect(navs === after, 'pause: it does not set the arrow any more');
      expect(!errors.length, `pause: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // "What to train with": the balanced choice by default (2.69), with no mode switch on the card; "Fastest" in Settings shows the time estimate.
    {
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S1-08', { levels: { woodcutting: 32 } }),
        status: { stats: { woodcutting: 32 } },
        events: [{ type: 'STATS', stats: { woodcutting: 32 } }],
      }, '#/skills/WC');
      await waitFor(page, '.training', 5000);
      const calm = await text(page, '.training');
      expect(calm.includes('Willow') && !calm.includes('by the wiki speed') && await page.locator('.training').getByRole('button', { name: /Calm|Efficient/ }).count() === 0, 'what to train with: at level 32 — willows, no time estimate and no mode switch on the card');
      expect(await noOverflow(page), 'what to train with: no horizontal scrolling');
      await page.goto(`${BASE}#/settings`);
      await page.waitForTimeout(400);
      await page.locator('details.settings-advanced > summary').click();
      await page.getByRole('group', { name: 'Training choices' }).getByRole('button', { name: 'Fastest' }).click();
      await page.waitForTimeout(200);
      const feat = await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:features') ?? '{}') as { efficient?: boolean; relaxedTraining?: boolean });
      expect(feat.efficient === true && feat.relaxedTraining === false, 'training choices: "Fastest" was remembered in the settings');
      await page.goto(`${BASE}#/skills/WC`);
      await waitFor(page, '.training', 5000);
      const fast = await text(page, '.training');
      expect(/wiki speed/.test(fast), 'what to train with: "Fastest" shows the time and the speed "per the wiki"');
      expect(!errors.length, `what to train with: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // "Zen": instead of a stack of plaques — one status line; the details on a button, as tabs; ready — "Start the step".
    {
      const { page, errors } = await open(browser, width, {
        zen: true,
        progress: progressBefore('S9-01'),
        status: { stats: { crafting: 28, woodcutting: 40 } },
        events: [{ type: 'STATS', stats: { crafting: 28, woodcutting: 40 } }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Knife', carried: 0, noted: 0, bank: 1 }] }],
        localStorage: { 'osrs-put:features': JSON.stringify({ autoPrep: false }) },
      }, '#/step/S9-01');
      await waitFor(page, '.step-status', 8000);
      const line = await text(page, '.status-line');
      expect(/Preparation required \(\d/.test(line) && line.includes('Fix'), `Zen: one status line with the preparation and the Fix button (${line.replace(/\s+/g, ' ').slice(0, 90)})`);
      expect((await text(page, '.readiness')).length > 0, 'Zen: Preparation exposes the readiness panel');
      await page.keyboard.press('Escape');
      expect((await text(page, '.manual-complete')).includes('Done'),'Zen: Done is one clear action under the current instruction');
      expect(await page.getByRole('navigation', { name: 'Step views' }).getByRole('button').count() === 3, 'Zen: the reference views are three buttons: Preparation, Travel, Details');
      await page.getByRole('navigation', { name: 'Step views' }).getByRole('button', { name: /Preparation/ }).click();
      await page.waitForTimeout(300);
      const open1 = await text(page, '.readiness');
      expect(open1.includes('Catch up Crafting') && open1.includes('To the bank'), 'Zen: the Preparation view holds the whole preparation panel');
      expect(await noOverflow(page), 'Zen: no horizontal scrolling');
      expect(!errors.length, `Zen: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    {
      const { page, errors } = await open(browser, width, {
        zen: true,
        progress: progressBefore('S1-04'),
        status: { stats: {} },
      }, '#/step/S1-04');
      await waitFor(page, '.step-status', 8000);
      const line = await text(page, '.status-line');
      expect(line.includes('Ready to set off') && !line.includes('Fix') && await page.getByRole('button', { name: /Show in game/ }).count() > 0, `Zen: ready — "Ready to set off" and the step has its own "Show in game" (${line.replace(/s+/g, ' ').slice(0, 80)})`);
      expect(await noOverflow(page), 'Zen (ready): no horizontal scrolling');
      // "Inspector" brings back all the blocks; the switch is in Settings, Appearance.
      await page.goto(`${BASE}#/settings`);
      await page.getByRole('button', { name: /^Inspector$/ }).click();
      await page.waitForTimeout(300);
      const feat = await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:features') ?? '{}') as { inspector?: boolean });
      expect(feat.inspector === true, 'Inspector: the switch in Settings is saved');
      expect(!errors.length, `Zen (ready): no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // Bulk shopping: "already have" changes "buy", is saved and goes into the exchange hint.
    {
      const { page, errors } = await open(browser, width, {
        events: [{ type: 'OWNED', bankSeen: true, items: [{ name: 'Clay', carried: 3, noted: 0, bank: 2 }] }],
      }, '#/shopping');
      // The stages the old page opened on: the next trip is the default now, a range is chosen.
      await page.getByRole('button', { name: 'Stages', exact: true }).click();
      await page.waitForTimeout(300);
      const potion = page.locator('.shop-item-row', { hasText: 'Energy potion(4)' }).first();
      await potion.locator('.shop-why > summary').click();
      // Potions are marked in doses (2.73.0): 12 doses are three Energy potion(4) of the five, so 8 doses are left, bought as 2 potions.
      const input = potion.getByLabel('Energy potion(4): how many doses you already have');
      await input.fill('12');
      await input.press('Enter');
      await page.waitForTimeout(900);
      const row = await page.locator('.shop-item-row', { hasText: 'Energy potion(4)' }).first().innerText();
      expect(/8 doses short/.test(row) && /Buy 2 × Energy potion\(4\)/.test(row), `shopping: 12 of 20 doses marked — 8 left, bought as 2 potions (${row.replace(/\s+/g, ' ').slice(0, 120)})`);
      const saved = await page.evaluate(() => JSON.parse(String((window as unknown as Record<string, unknown>).__saved ?? '{}')));
      expect(saved.ownedManual?.['dose:energy potion']?.count === 12, 'shopping: the mark "already have 12 doses" is saved in the progress');
      const plan = await page.evaluate(() => ((window as unknown as { __posts: { path: string; body: { items: { name: string; count: number }[] } }[] }).__posts)
        .filter((p) => p.path === '/shopping-plan').pop()?.body.items ?? []);
      expect(plan.find((i) => i.name === 'Energy potion(4)')?.count === 2, 'shopping: "buy 2" goes to the game, not 5');
      expect(plan.find((i) => i.name === 'Clay')?.count === 7, 'shopping: clay — by the game data, the plugin subtracts the 5 you own itself');
      expect(await noOverflow(page), 'shopping: no horizontal scrolling');
      expect(!errors.length, `shopping: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // 2.63.3: "Launch RuneLite" in the header while the plugin does not answer; gone once it is connected.
    {
      const off = await open(browser, width, { offline: true }, '#/');
      const btn = off.page.locator('.topbar .launch-runelite');
      expect(await btn.count() === 1, `header (${width} px): the launch button is there while the plugin does not answer`);
      if (await btn.count()) {
        // The app's own start-up launch (auto-launch) is counted already: the click is one more.
        const launched = () => off.page.evaluate(() => (window as unknown as { __launched?: number }).__launched ?? 0);
        const before = await launched();
        await btn.click();
        await off.page.waitForTimeout(300);
        expect(await launched() === before + 1 && await btn.isDisabled(), `header (${width} px): a click starts RuneLite once and the button waits`);
      }
      if (process.env.UI_SHOTS) await off.page.screenshot({ path: `${process.env.UI_SHOTS}/header-launch-${width}.png`, clip: { x: 0, y: 0, width, height: 90 } }).catch(() => {});
      expect(await noOverflow(off.page), `header (${width} px): launch button, no horizontal scrolling`);
      await off.page.context().close();
      const on = await open(browser, width, {}, '#/');
      expect(await on.page.locator('.topbar .launch-runelite').count() === 0, `header (${width} px): no launch button once the plugin is connected`);
      await on.page.context().close();
    }

    // Gear: a Coif in the bank at 17 Ranged — "you have it but cannot wear it", not advice to wear it.
    {
      const gear = { equipment: [{ id: 1325, name: 'Steel scimitar', slot: 'weapon' }], inventory: [], coins: 500, bankCoins: 3000 };
      const stats = { attack: 20, strength: 20, defence: 1, ranged: 17 };
      const { page, errors } = await open(browser, width, {
        status: { ...gear, stats },
        events: [{ type: 'STATS', stats }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Coif', carried: 0, noted: 0, bank: 1 }] }],
      }, '#/gear');
      // Future unlocks are folded since 2.68: opened, the lock is there.
      await page.locator('#gear-roadmap > summary').click();
      const t = await text(page, '.gear-locked');
      expect(t.includes('needs 20 Ranged') && t.includes('Coif') && t.includes('cannot be worn yet'), 'gear: 🔒 Coif — needs 20 Ranged, lies in the bank');
      if (process.env.UI_SHOTS) await page.screenshot({ path: `${process.env.UI_SHOTS}/gear-${width}.png`, fullPage: true }).catch(() => {});
      expect(!(await text(page, '.gear-page')).includes('Wear Coif'), 'gear: it is not advised to wear the Coif');
      // No exchange prices here: an exchange upgrade is neither called beyond the money nor is the kit called the best the money buys.
      const more = page.locator('.gear-more', { hasText: 'Other options' });
      if (await more.count()) await more.locator('summary').click();
      const goals = await text(page, '.gear-page');
      const reco = await text(page, '.gear-reco');
      expect(goals.includes('The price is not known yet') && !goals.includes('Better than what your money allows') && !/best you can wear and afford/.test(reco), 'gear: without exchange prices nothing is called beyond or within your money');
      expect(!/faster/.test(reco), 'gear: the recommendation never says "faster" unless the attack interval changes');
      expect(await noOverflow(page), 'gear: no horizontal scrolling');
      expect(!errors.length, `gear: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // The food plan of a combat training step (S3-08) from the game data: the next trip, the whole goal, what to buy; the level 27
    // Minotaur and the potions behind "Details".
    {
      const equipment = [[1329, 'Mithril scimitar', 'weapon'], [1153, 'Iron full helm', 'head'], [1115, 'Iron platebody', 'body'], [1081, 'Iron plateskirt', 'legs'], [1191, 'Iron kiteshield', 'shield']]
        .map(([id, name, slot]) => ({ id, name, slot }));
      const gear = { equipment, inventory: [], coins: 500, bankCoins: 3000 };
      const stats = { attack: 22, strength: 16, defence: 1, hitpoints: 22 };
      const xp = { attack: 5624, strength: 2746, defence: 0, hitpoints: 2400 };
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S3-08'),
        localStorage: { 'osrs-put:active-step': 'S3-08' },
        status: { protocol: 5, ...gear, stats, xp, activeStepId: 'S3-08' },
        events: [{ type: 'STATS', stats }, { type: 'XP', xp }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Salmon', carried: 0, noted: 0, bank: 13 }] }],
      }, '#/step/S3-08');
      await waitFor(page, '.combat-plan', 8000);
      const t = await text(page, '.combat-plan');
      expect(t.includes('Next trip: 26 Salmon') && t.includes('You have 13 Salmon') && t.includes('buy about'), `food plan: next trip, owned, deficit (${t.replace(/\s+/g, ' ').slice(0, 160)})`);
      expect(!(await page.locator('.food-advice').count()), 'food plan: the generic food block is not repeated');
      await page.locator('.combat-plan summary').click();
      const d = await text(page, '.combat-plan');
      expect(d.includes('Minotaur (level 27) instead') && d.includes('Strength 16 → 20'), 'food plan: the details hold the phases and the level 27 Minotaur');
      if (process.env.UI_SHOTS) await page.locator('.combat-plan').screenshot({ path: `${process.env.UI_SHOTS}/combat-plan-${width}.png` }).catch(() => {});
      expect(await noOverflow(page), 'food plan: no horizontal scrolling');
      expect(!errors.length, `food plan: no console errors ${errors.join('; ')}`);
      await page.context().close();

      // The same in the default "Zen" view: the step page and its Preparation view, for the visual review.
      const zen = await open(browser, width, {
        zen: true,
        progress: progressBefore('S3-08'),
        localStorage: { 'osrs-put:active-step': 'S3-08' },
        status: { protocol: 5, ...gear, stats, xp, activeStepId: 'S3-08' },
        // As the plugin reports it: the step's fish alternatives are counted too (0 here).
        events: [{ type: 'STATS', stats }, { type: 'XP', xp }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items: [
          { name: 'Salmon', carried: 0, noted: 0, bank: 13 }, { name: 'Mithril scimitar', carried: 1, noted: 0, bank: 0 },
          ...['Trout', 'Tuna', 'Lobster', 'Swordfish'].map((name) => ({ name, carried: 0, noted: 0, bank: 0 })),
        ] }],
      }, '#/step/S3-08');
      await waitFor(zen.page, '.step-status', 8000);
      await zen.page.keyboard.press('Escape');
      if (process.env.UI_SHOTS) await zen.page.screenshot({ path: `${process.env.UI_SHOTS}/zen-s308-${width}.png`, fullPage: true }).catch(() => {});
      await zen.page.getByRole('navigation', { name: 'Step views' }).getByRole('button', { name: /Preparation/ }).click();
      await zen.page.waitForTimeout(300);
      if (process.env.UI_SHOTS) await zen.page.screenshot({ path: `${process.env.UI_SHOTS}/zen-s308-prep-${width}.png`, fullPage: true }).catch(() => {});
      const prep = await zen.page.locator('body').innerText();
      expect(prep.includes('Salmon ×26') && !prep.includes('Salmon ×110'), 'food plan (Zen): Preparation asks for one bag (26), not the whole goal');
      // The readiness verdict (2.62.0): the status, the bank first (13 Salmon owned), then what to buy; both Minotaur versions; the weapon judged.
      const verdict = await text(zen.page, '.readiness-verdict');
      expect(verdict.includes('Preparation needed') && verdict.includes('Bank: withdraw 13 Salmon') && verdict.includes('Then buy about 13 Salmon'),
        `readiness (Zen): the next action names the bank and the purchase (${verdict.replace(/\s+/g, ' ').slice(0, 200)})`);
      expect(verdict.includes('Minotaur (level 12) suits your current kit best') && verdict.includes('Minotaur (level 27):'), 'readiness (Zen): both Minotaur versions are compared');
      // Preparation opens as a drawer over the step page: its own card is the one in the dialog.
      await zen.page.locator('dialog[aria-label="Preparation"] .readiness-verdict summary').first().click();
      const why = await text(zen.page, 'dialog[aria-label="Preparation"] .readiness-verdict');
      expect(why.includes('Mithril scimitar: suitable for training') && why.includes('Armour: Iron full helm'), 'readiness (Zen): the weapon and the armour are judged');
      expect(why.includes('not a chance of surviving'), 'readiness (Zen): the percent is never a survival chance');
      if (process.env.UI_SHOTS) await zen.page.locator('dialog[aria-label="Preparation"] .readiness-verdict').first().screenshot({ path: `${process.env.UI_SHOTS}/readiness-s308-${width}.png` }).catch(() => {});
      expect(!prep.includes('What to train with'), 'food plan (Zen): no other training place beside the Minotaurs of the step');
      expect(prep.includes('Where to get each item') && !prep.includes('Required items and food'), 'food plan (Zen): the item cards wait behind "Where to get each item"');
      expect(await noOverflow(zen.page), 'food plan (Zen): no horizontal scrolling');
      expect(!zen.errors.length, `food plan (Zen): no console errors ${zen.errors.join('; ')}`);
      await zen.page.context().close();
    }

    // The big map: the arrow target (a quick variant) is visible as a separate marker.
    {
      const { page, errors } = await open(browser, width, {
        localStorage: { 'osrs-put:branch-choice': '{"S2-05":"varrock-teleport"}', 'osrs-put:active-step': 'S2-05' },
        progress: progressBefore('S2-05'),
        status: { activeStepId: 'S2-05' },
      }, '#/step/S2-05');
      await (await stepButton(page, '🗺️ World map')).first().click();
      await page.waitForTimeout(800);
      const t = await text(page, '.map-source');
      expect(t.includes('The in-game arrow leads') && t.includes('Varrock Teleport'), 'map: the marker "The in-game arrow leads to Varrock Teleport"');
      expect(await page.locator('.map-arrow-pin').count() === 1, 'map: the 🧭 marker on the map');
      expect(!errors.length, `map: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // A step point → the game: "Lead here in the game" sets a target with the point's NPC; "Show in the game" gives the RuneLite panel
    // "what you need / where to get it / the step points".
    {
      const { page, errors } = await open(browser, width, { progress: progressBefore('S2-03') }, '#/step/S2-03');
      await (await stepButton(page, /Eye of newt — Betty/, 'radio')).click();
      await (await stepButton(page, '🧭 Lead here in the game')).click();
      await page.waitForTimeout(500);
      type Post = { path: string; body: Record<string, unknown> };
      const posts = () => page.evaluate(() => (window as unknown as { __posts: Post[] }).__posts);
      const nav = (await posts()).filter((p) => p.path === '/nav-target').pop()?.body;
      expect(nav?.x === 3014 && JSON.stringify(nav?.npcNames) === '["Betty"]' && nav?.stepId === 'S2-03',
        'step map: "Lead here in the game" — a target at Betty with the NPC highlighted');
      await (await stepButton(page, '🧭 Show in the game')).first().click();
      await page.waitForTimeout(500);
      const guide = (await posts()).filter((p) => p.path === '/active-step').pop()?.body.guide as
        { items: { name: string; where?: string }[]; places: { label: string; items?: string[] }[] } | undefined;
      expect(guide?.items.length === 4 && guide.items.every((i) => i.where) && guide.places.length === 5,
        'show in the game: 4 items with "where to get it" and 5 points go to the RuneLite panel');
      expect(await noOverflow(page), 'step map: no horizontal scrolling');
      expect(!errors.length, `step map: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // An earning step: coins against the goal.
    {
      const gear = { equipment: [], inventory: [], coins: 300, bankCoins: 8000, carriedValue: 4200, bankValue: 5000 };
      const { page } = await open(browser, width, { progress: progressBefore('S1-13'), status: gear, events: [{ type: 'GEAR', gear }] }, '#/step/S1-13');
      const t = await text(page, '.money-goal');
      expect(t.includes('8,300 / 12,000') && t.includes('3,700 missing'), 'earning: "Coins: 8,300 / 12,000 gp — 3,700 missing"');
      expect(t.includes('~9,200'), 'earning: the items — separately, with "~"');
      await page.context().close();
    }

    // An old plugin without the protocol field — a request to restart RuneLite.
    {
      const { page } = await open(browser, width, {}, '#/settings');
      await page.getByRole('tab', { name: 'RuneLite' }).click();
      const t = await text(page, '.plaque-warning');
      expect(t.includes('old plugin') && t.includes('restart RuneLite'), 'settings: a plugin without a handshake — "old plugin, restart RuneLite"');
      await page.context().close();
    }

    // Plugin 2.10 (protocol 3) with app 2.11: the step card says it is missing and what to do; with a new one — a hint about the list.
    {
      const { page } = await open(browser, width, {
        localStorage: { 'osrs-put:active-step': 'S2-03' }, progress: progressBefore('S2-03'),
        status: { activeStepId: 'S2-03', protocol: 3, pluginVersion: '2.10.0' },
      }, '#/step/S2-03');
      const t = await text(page, '.ingame');
      expect(t.includes('old plugin 2.10.0') && t.includes('"What you need" list on the game screen'), 'step: plugin 2.10 — "restart RuneLite", without the list in the game');
      await page.context().close();
      const fresh = await open(browser, width, {
        localStorage: { 'osrs-put:active-step': 'S2-03' }, progress: progressBefore('S2-03'),
        status: { activeStepId: 'S2-03', protocol: 6, pluginVersion: '2.22.0' },
      }, '#/step/S2-03');
      const f = await text(fresh.page, '.ingame');
      // The static explanations ("In the game at the top left...", "The path over land is laid by Shortest Path...") were removed on purpose: a current plugin
      // gets only the status and the buttons; the old-plugin note above stays.
      expect(!f.includes('old plugin') && !f.includes('at the top left') && !f.includes('laid by Shortest Path') && /Show(n)? in the game/.test(f), 'step: plugin 2.22 — only the status and the buttons, no explanatory paragraphs');
      expect(!fresh.errors.length, `step: no console errors ${fresh.errors.join('; ')}`);
      await fresh.page.context().close();
    }

    // 2.42/2.70: the leveling roadmap drawer opens from the Skills page, the priority changes the path, "Follow this plan" pins the skill to the Path card and
    // "Back to the quest route" stops it. A group's label covers its steps (no "Levels 30–40" over "Lvl 30 → 60").
    {
      const { page, errors } = await open(browser, width, { progress: progressBefore('S9-01') }, '#/skills');
      await page.getByRole('button', { name: /Leveling roadmap/ }).first().click();
      await waitFor(page, 'dialog.skill-drawer[open] .skill-timeline', 5000);
      const before = await text(page, '.skill-timeline');
      expect(/Levels \d+/.test(before), 'roadmap: the level brackets are shown');
      expect(await noOverflow(page), 'roadmap: no horizontal scrolling');
      const covered = await page.locator('.skill-bracket').evaluateAll((els) => els.every((el) => {
        const head = /Levels (\d+)–(\d+)/.exec(el.querySelector('h3')?.textContent ?? '');
        if (!head) return false;
        const to = Number(head[2]);
        return [...el.querySelectorAll('.skill-step-range')].every((r) => { const m = /→ (\d+)/.exec(r.textContent ?? ''); return !m || Number(m[1]) <= to; });
      }));
      expect(covered, 'roadmap: every group label covers the levels of its steps');
      await page.getByRole('group', { name: 'Priority' }).getByRole('button', { name: 'Low effort' }).click();
      expect((await page.locator('.skill-seg-btn.is-on').allInnerTexts()).some((x) => x.includes('Low effort')), 'roadmap: the priority is applied');
      expect(await page.getByRole('button', { name: /AFK \/ Budget|F2P Only|Quest-Driven/ }).count() === 0, 'roadmap: no mixed filters');
      await page.getByRole('button', { name: /Follow this plan/ }).click();
      const tracked = await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:skill-track') ?? 'null') as { mode?: string } | null);
      expect(tracked?.mode === 'afk', 'roadmap: the followed plan was remembered with its priority');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      await page.evaluate(() => { location.hash = '#/step/S9-01'; });
      await waitFor(page, '.tracked-skill', 5000);
      await page.getByRole('button', { name: /Back to the quest route/ }).click();
      expect((await page.locator('.tracked-skill').count()) === 0, 'roadmap: stopping gives the quest route back');
      expect(!errors.length, `roadmap: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // 2.12: another character does not write into the active profile and gets an offer; XP from the game is visible on the skill page.
    {
      const profiles = JSON.stringify({ active: 'main', list: [{ id: 'main', name: 'Main', player: 'Alpha One' }] });
      const { page, errors } = await open(browser, width, {
        localStorage: { 'osrs-put:profiles': profiles },
        status: { protocol: 5, pluginVersion: '2.12.0', player: 'Beta Two', xp: { woodcutting: 10, strength: 0 } },
      }, '#/skills/WC');
      await waitFor(page, '.plaque-warning', 5000);
      const t = await text(page, '.plaque-warning');
      expect(t.includes('new character') && t.includes('Beta Two'), 'profile: another character — an offer to create a profile');
      expect(!errors.length, `profile: no console errors ${errors.join('; ')}`);
      await page.context().close();

      const ok = await open(browser, width, {
        localStorage: { 'osrs-put:profiles': profiles },
        status: { protocol: 5, pluginVersion: '2.12.0', player: 'Alpha One', xp: { woodcutting: 10 } },
      }, '#/skills/WC');
      await waitFor(ok.page, '.live-xp', 5000);
      const x = await text(ok.page, '.live-xp');
      expect(x.includes('to ') && x.includes('XP left'), 'skill: XP from the game — "N XP left to the level"');
      expect((await ok.page.locator('.plaque-warning').count()) === 0, 'profile: the own character — no warning');
      await ok.page.context().close();
    }

    // 2.19.2: the resource journal lives between sessions — the records of the earlier launch are in place, another character's is not visible, clearing works.
    {
      const profiles = JSON.stringify({ active: 'main', list: [{ id: 'main', name: 'Main', player: 'Alpha One' }] });
      const now = Date.now();
      const rows = [
        { name: 'Coins', quantityDelta: 5000, reason: 'LOOT', timestamp: now - 3 * 24 * 3600_000, estimatedGpValue: 5000 },
        { name: 'Cowhide', quantityDelta: 10, reason: 'LOOT', timestamp: now - 3 * 24 * 3600_000, estimatedGpValue: 1000 },
      ];
      const key = (who: string) => `osrs-put:ledger:main:${who}`;
      const { page, errors } = await open(browser, width, {
        localStorage: { 'osrs-put:profiles': profiles, [key('alpha one')]: JSON.stringify(rows), [key('beta two')]: JSON.stringify(rows.slice(0, 1)) },
        status: { protocol: 5, pluginVersion: '2.20.0', player: 'Alpha One' },
      }, '#/settings');
      await page.getByRole('tab', { name: 'Progress and copies' }).click();
      await waitFor(page, '.ledger-block', 5000);
      const t = await text(page, '.ledger-block');
      expect(t.includes('entries 2') && t.includes('Coins +'), 'journal: the records of the earlier launch are in place');
      await page.getByRole('button', { name: 'Clear the journal' }).click();
      await page.getByRole('button', { name: 'Yes, clear the journal' }).click();
      await page.waitForFunction(() => document.body.innerText.includes('The resource journal is empty'), null, { timeout: 5000 });
      const left = await page.evaluate((k) => ({ a: localStorage.getItem(k.a), b: localStorage.getItem(k.b) }), { a: key('alpha one'), b: key('beta two') });
      expect(left.a === null && left.b !== null, 'journal: clearing erases this character\'s journal and does not touch another\'s');
      expect(!errors.length, `journal: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // 2.12.1: Magic 25 is there but the runes are not — the quick Varrock Teleport is not passed off as ready, it says what is missing.
    {
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S2-05'),
        events: [{ type: 'STATS', stats: { magic: 25 } }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Law rune', carried: 0, noted: 0, bank: 0 }, { name: 'Air rune', carried: 0, noted: 0, bank: 0 }] }],
      }, '#/step/S2-05');
      await waitFor(page, '.branch-missing', 5000);
      const t = await text(page, '.branch-missing');
      expect(t.includes('Missing') && t.includes('Law rune'), 'quick variant: no runes — "missing Law rune"');
      expect((await page.locator('.branch button:has-text("Lead in the game")').count()) === 0, 'quick variant: without runes it does not lead by teleport in the game');
      expect(!errors.length, `quick variant: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // 2.13: S2-04 — the magic calculation by exchange prices and "how to make up the money" for the player's levels.
    {
      const prices = { 556: 6, 558: 3, 555: 6, 557: 6, 554: 6, 563: 120, 1381: 1542, 1383: 1500, 1385: 1500, 1387: 940, 1739: 125 };
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S2-04'), prices,
        events: [{ type: 'STATS', stats: { magic: 10, mining: 1, attack: 5, strength: 5, defence: 5 } }, { type: 'XP', xp: { magic: 1200 } }],
      }, '#/step/S2-04');
      await waitFor(page, '.magic-plan table', 6000);
      const t = await text(page, '.magic-plan');
      expect(t.includes('Wind Strike only') && t.includes('staff of fire') && t.includes('Magic 25'), 'S2-04: the magic calculation — the options and the staff of fire');
      expect(t.includes('hides'), 'S2-04: how many hides pay back the runes');
      await reveal(page, '.money-plan summary');
      await page.locator('.money-plan summary').click();
      const m = await text(page, '.money-plan');
      expect(m.includes('How to make up the money') && m.includes('gp/h'), 'S2-04: "How to make up the money" — methods with revenue per hour');
      expect((await page.locator('.money-method').count()) > 0, 'S2-04: the money block has methods');
      await reveal(page, '.style-gear summary');
      await page.locator('.style-gear summary').click();
      await waitFor(page, '.style-row', 6000);
      const sg = await text(page, '.style-gear');
      expect(sg.includes('What to wear for magic') && sg.includes('Weapon:') && sg.includes('OSRS Wiki recommendations'), 'S2-04: "What to wear for magic" — the slots and the source');
      expect(await noOverflow(page), 'S2-04: the gear without horizontal scrolling');
      expect(!errors.length, `S2-04: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // 2.15: the dragon fight (S5-08) — "Food for combat": Elvarg's hits per the wiki and the food advice.
    {
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S5-08'),
        events: [{ type: 'STATS', stats: { hitpoints: 40 } }],
      }, '#/step/S5-08');
      const f = await text(page, '.food-advice');
      expect(f.includes('Food for combat') && f.includes('Elvarg') && f.includes('Eat when HP is below'), 'S5-08: "Food for combat" — Elvarg\'s hits and the food threshold');
      expect(await noOverflow(page), 'S5-08: no horizontal scrolling');
      expect(!errors.length, `S5-08: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // 2.63.0: a quest fight with the real kit (S2-08 Count Draynor): how long, how much damage, the food, and how it is worked out.
    {
      const equipment = [[1329, 'Mithril scimitar', 'weapon'], [1153, 'Iron full helm', 'head'], [1115, 'Iron platebody', 'body'], [1081, 'Iron plateskirt', 'legs'], [1191, 'Iron kiteshield', 'shield']]
        .map(([id, name, slot]) => ({ id, name, slot }));
      const gear = { equipment, inventory: [{ id: 333, name: 'Trout', count: 5 }], coins: 100, bankCoins: 0 };
      const stats = { attack: 20, strength: 20, defence: 1, hitpoints: 20 };
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S2-08'),
        status: { protocol: 5, ...gear, stats, activeStepId: 'S2-08' },
        events: [{ type: 'STATS', stats }, { type: 'GEAR', gear }],
      }, '#/step/S2-08');
      await waitFor(page, '.fight-plan', 8000);
      const f = await text(page, '.fight-plan');
      expect(/Count Draynor: about \d+ s on (Accurate|Aggressive|Defensive); you take about \d+ damage/.test(f), `S2-08: the fight with your kit (${f.replace(/\s+/g, ' ').slice(0, 160)})`);
      await page.locator('.fight-plan summary').click();
      const d = await text(page, '.fight-plan');
      expect(d.includes('you hit') && d.includes('No kit guarantees survival'), 'S2-08: how the fight estimate is worked out');
      if (process.env.UI_SHOTS) await page.locator('.food-advice').screenshot({ path: `${process.env.UI_SHOTS}/fight-s208-${width}.png` }).catch(() => {});
      expect(await noOverflow(page), 'S2-08: no horizontal scrolling');
      expect(!errors.length, `S2-08: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // 2.14: "Where am I? How to get there" — the position from the game, the options to Varrock (S2-05) and their availability.
    {
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S2-05'),
        status: {
          protocol: 5, pluginVersion: '2.13.0', pos: { x: 3222, y: 3218, plane: 0 }, stats: { magic: 25, woodcutting: 20 },
          coins: 500, equipment: [], inventory: [{ id: 563, name: 'Law rune', count: 1 }, { id: 556, name: 'Air rune', count: 3 }, { id: 554, name: 'Fire rune', count: 1 }],
        },
      }, '#/step/S2-05');
      await (await stepButton(page, /Where am I/)).click();
      await waitFor(page, '.travel-option', 5000);
      const t = await text(page, '.travel-plan');
      expect(t.includes('Varrock Teleport') && t.includes('available now'), 'how to get there: Varrock Teleport with runes — "available now"');
      expect(t.includes('3222, 3218'), 'how to get there: the position from the game is shown');
      // The text does not overlap the status plate: in every option the name and the plate do not intersect.
      const overlaps = await page.evaluate(() => {
        const bad: string[] = [];
        document.querySelectorAll('.travel-option').forEach((o) => {
          const a = o.querySelector('.travel-title')?.getBoundingClientRect();
          const b = o.querySelector('.travel-badge')?.getBoundingClientRect();
          if (a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) bad.push(o.textContent?.slice(0, 40) ?? '');
        });
        return bad;
      });
      expect(overlaps.length === 0, `how to get there: the name does not overlap the plate (${overlaps.join(' | ')})`);
      // A drop-down list in the app's style, not the system white one.
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
      expect(sel !== null && sel.appearance === 'none' && sel.bg === sel.surface, `how to get there: the select is in the app's style (${JSON.stringify(sel)})`);
      expect(!errors.length, `how to get there: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // "One trip": the bank is open, the items of the step and the nearest ones are missing — what to take now, meanwhile and later; the unknown — separately.
    {
      const route = JSON.parse(readFileSync(new URL('../src/data/steps.json', import.meta.url), 'utf8')) as { id: string; itemsRequired?: { nameEn: string; amount: string | number; inStep?: boolean }[] }[];
      const at = route.findIndex((x) => x.id === 'S2-10');
      const names = route.slice(at, at + 4).flatMap((x) => (x.itemsRequired ?? []).filter((i) => !i.inStep).map((i) => i.nameEn));
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S2-10'),
        status: { protocol: 5, pluginVersion: '2.13.0', pos: { x: 3222, y: 3218, plane: 0 }, stats: {}, coins: 100, bankCoins: 0, equipment: [], inventory: [] },
        events: [{ type: 'OWNED', bankSeen: true, items: [...new Set(names)].map((n) => ({ name: n, carried: 0, noted: 0, bank: 0 })) }],
      }, '#/step/S2-10');
      // The preparation of the next steps lives in the Preparation view of the workspace.
      await waitFor(page, '.one-trip', 5000);
      const trip = await text(page, '.one-trip');
      expect(trip.includes('What you need') && trip.includes('Needed now') && trip.includes('Open the shopping list'), 'what you need: the "Needed now" list and a link to shopping');
      expect(/ready \d+%/.test(trip) && trip.includes('critical'), 'what you need: the readiness in percent and the number of critical ones');
      expect(trip.includes('missing') && /Buy|Take|Obtain|Earn/.test(trip), 'what you need: for each thing — what to do with it');
      if (process.env.UI_SHOTS) await page.locator('.one-trip').screenshot({ path: `${process.env.UI_SHOTS}/prep-plan-${width}.png` }).catch(() => {});
      if (process.env.UI_SHOTS) await page.screenshot({ path: `${process.env.UI_SHOTS}/step-prep-${width}.png` }).catch(() => {});
      expect(await noOverflow(page), 'one trip: no horizontal scrolling');
      expect(!errors.length, `one trip: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // The cockpit: the current sub-step is the hero, its items are a strip, the walkthrough is folded, and the dossier column is never an empty hint.
    {
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S2-10'),
        status: { protocol: 5, pluginVersion: '2.37.3', stats: {}, coins: 0, bankCoins: 0, equipment: [], inventory: [],
          navTarget: { label: 'Lady Keli: use soft clay on the key for a print', x: 3127, y: 3244, plane: 0, stepId: 'S2-10' } },
      }, '#/step/S2-10');
      await waitFor(page, '.sub-hero', 5000);
      const hero = await text(page, '.sub-hero');
      const action = (await text(page, '.current-action')).toLowerCase();
      expect(action.includes('navigation target') && action.includes('lady keli'), 'legacy cockpit: a navigation target is labelled as navigation, not confirmed quest progress');
      expect(hero.includes('Lead to Target in Game'), 'cockpit: the sub-step has the lead button');
      expect(hero.includes('Could I touch the key for a moment please?'), 'cockpit: the dialogue options are listed');
      expect((await text(page, '.sub-items')).includes('Soft clay'), 'cockpit: the strip holds the items of this sub-step');
      expect(await page.locator('details.step-fold:not([open])', { hasText: 'Full walkthrough and dialogue' }).count() === 1, 'cockpit: the full walkthrough is folded');
      expect(await page.locator('.one-trip').count() === 0, 'cockpit: the preparation of later steps is not on the Steps view');
      expect(await noOverflow(page), 'cockpit: no horizontal scrolling');
      expect(!errors.length, `cockpit: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // 2.63.2: the live game wins. Mid-quest "Where" starts at the game's current target; the quest points are the game's; a quest marked
    // done here that the game has not finished is said in the journal.
    {
      const { page, errors } = await open(browser, width, {
        localStorage: { 'osrs-put:active-step': 'S2-10' }, progress: progressBefore('S2-10'),
        status: { protocol: 6, inGame: true, activeStepId: 'S2-10', questPoints: 3, questsDone: [], stats: {}, coins: 0, bankCoins: 0, equipment: [], inventory: [],
          navTarget: { label: 'Go down to the test target', x: 3200, y: 3300, plane: 0, stepId: 'S2-10' } },
      }, '#/step/S2-10');
      await waitFor(page, '.cockpit-where-card', 5000);
      const where = await text(page, '.cockpit-where-card');
      expect(where.includes('Now: Go down to the test target'), 'live: mid-quest "Where" starts at the game\'s current target');
      await page.evaluate(() => { location.hash = '#/journal'; });
      await page.waitForTimeout(800);
      const journal = await text(page, 'main');
      expect(journal.includes('quest points 3') && journal.includes('not finished in the game'), 'live: the journal counts the game\'s quest points and names a quest the game has not finished');
      expect(await noOverflow(page), 'live: no horizontal scrolling');
      expect(!errors.length, `live: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // The recovery mode: died in a dungeon and respawned in Lumbridge — instead of "kill zombies" a plan "collect the things, go back".
    {
      const { page, errors } = await open(browser, width, {
        zen: true, localStorage: { 'osrs-put:active-step': 'S2-07' }, progress: progressBefore('S2-07'),
        status: { activeStepId: 'S2-07', protocol: 5, pluginVersion: '2.20.0', stats: {}, coins: 0, bankCoins: 0, equipment: [], inventory: [] },
        events: [
          { type: 'MOVED', kind: 'DEATH', from: { x: 3049, y: 9566, plane: 0 }, to: null },
          { type: 'MOVED', kind: 'TELEPORT', from: { x: 3049, y: 9566, plane: 0 }, to: { x: 3222, y: 3218, plane: 0 } },
        ],
      }, '#/step/S2-07');
      await waitFor(page, '.prep-recovery', 5000);
      const t = await text(page, '.prep-recovery');
      expect(t.includes('Recovery mode') && t.includes('died') && t.includes('Collect the things') && t.includes('Go back to step S2-07'), 'recovery: died — the things, the missing, the return');
      expect((await text(page, '.step-status')).includes('recovery mode'), 'recovery: the step status speaks of the mode');
      expect(await noOverflow(page), 'recovery: no horizontal scrolling');
      await (await stepButton(page, 'This is not a derailment — continue')).click();
      await page.waitForFunction(() => !document.querySelector('.prep-recovery'), null, { timeout: 5000 });
      expect(!errors.length, `recovery: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // Protocol 6: the step, shopping, the bank highlight, the advice and the plan go to the game in one /prep-plan snapshot — there are no separate requests.
    {
      const { page, errors } = await open(browser, width, {
        zen: true, localStorage: { 'osrs-put:active-step': 'S2-07', 'osrs-put:shopping-plan': '{"items":[{"name":"Iron bar","count":2}]}' }, progress: progressBefore('S2-07'),
        status: { protocol: 6, pluginVersion: '2.22.0', stats: {}, coins: 0, bankCoins: 0, equipment: [], inventory: [] },
      }, '#/step/S2-07');
      await page.waitForTimeout(1500);
      const sent = await page.evaluate(() => (window as unknown as { __posts: { path: string; body: any }[] }).__posts);
      const snaps = sent.filter((p) => p.path === '/prep-plan');
      expect(snaps.length > 0, 'protocol 6: the /prep-plan snapshot was sent');
      const last = snaps[snaps.length - 1]?.body;
      expect(last?.v === 6 && last?.step?.stepId === 'S2-07', 'protocol 6: the snapshot has step S2-07');
      expect(last?.plan?.stepId === 'S2-07' && Array.isArray(last?.plan?.lines) && last.plan.lines.length > 0, 'protocol 6: the snapshot has the preparation plan with items');
      expect(last?.shopping?.items?.[0]?.name === 'Iron bar', 'protocol 6: shopping — in the same snapshot');
      expect(!sent.some((p) => ['/active-step', '/gear-hint', '/bank-tags', '/shopping-plan'].includes(p.path)), 'protocol 6: there are no five separate requests');
      expect(snaps.every((p, i) => i === 0 || p.body.seq > snaps[i - 1].body.seq), 'protocol 6: the snapshot numbers grow');
      expect(!errors.length, `protocol 6: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // The quest is handed in — the "Departure check" does not demand items that are no longer there.
    {
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S2-10'),
        status: { protocol: 5, questsDone: ['Prince Ali Rescue'], pluginVersion: '2.13.0', pos: { x: 3222, y: 3218, plane: 0 }, stats: {}, coins: 0, equipment: [], inventory: [] },
      }, '#/step/S2-10');
      await page.waitForTimeout(500);
      const t = await text(page, '.preflight-verdict');
      expect(t.includes('The step is done') && !/Not ready|missing/i.test(t), `a handed-in quest: the departure check does not complain about an empty bag (${t.slice(0, 80)})`);
      expect(!errors.length, `a handed-in quest: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // A quest with an NPC: on the step map — the points of the NPC and where items come from, as in the list in the game.
    {
      const { page, errors } = await open(browser, width, { progress: progressBefore('S2-10') }, '#/step/S2-10');
      await reveal(page, '.spot-chip');
      const chips = await page.locator('.spot-chip').allInnerTexts();
      expect(chips.some((c) => c.includes('Ned')) && chips.some((c) => c.includes('Lady Keli')) && chips.some((c) => c.includes('Prince Ali')),
        `step map: the quest NPC as points (${chips.length})`);
      await (await stepButton(page, /Ned — a house in Draynor Village/, 'radio')).click();
      await (await stepButton(page, '🧭 Lead here in the game')).click();
      await page.waitForTimeout(500);
      const nav = await page.evaluate(() => (window as unknown as { __posts: { path: string; body: Record<string, unknown> }[] }).__posts
        .filter((p) => p.path === '/nav-target').pop()?.body);
      expect(JSON.stringify(nav?.npcNames) === '["Ned"]' && nav?.x === 3099, 'step map: "Lead here in the game" to Ned with a highlight');
      expect(await noOverflow(page), 'step map with an NPC: no horizontal scrolling');
      expect(!errors.length, `step map with an NPC: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }
  }

  // All the pages: steps, skills, the reference — open without console errors, without a crash and horizontal scrolling.
  console.log('All the pages');
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
      if (info.overflow > 0) bad.push(`${r}: scroll ${info.overflow}px`);
      if (info.crashed) bad.push(`${r}: the page crashed`);
      if (errors.length > before) bad.push(`${r}: ${errors.slice(before).join('; ').slice(0, 200)}`);
    }
    expect(!bad.length, `${routes.length} pages at ${width} px — no errors and scrolling ${bad.slice(0, 5).join(' | ')}`);
    await page.context().close();
  }

  // The wiki dossier is on demand: no permanent column. A click on an NPC opens it as a drawer, "Pin to the side" makes it a column that is
  // remembered; pinned with nothing chosen it shows the current target, never an empty hint; "Unpin" returns the drawer behaviour.
  console.log('dossier');
  {
    const { page, errors } = await open(browser, 1280, {
      progress: progressBefore('S2-10'),
      status: { protocol: 5, pluginVersion: '2.37.3', stats: {}, coins: 0, bankCoins: 0, equipment: [], inventory: [],
        navTarget: { label: 'Lady Keli: use soft clay on the key for a print', x: 3127, y: 3244, plane: 0, stepId: 'S2-10' } },
    }, '#/step/S2-10');
    await waitFor(page, '.path-wide', 5000);
    expect(await page.locator('.path-wide.no-dock').count() === 1 && !(await page.locator('.dock').isVisible()), 'dossier: no permanent column by default');
    await page.getByRole('navigation', { name: 'Step views' }).getByRole('button', { name: /Details/ }).click();
    await page.locator('.npc-name').first().click();
    await page.waitForSelector('dialog.drawer[open]', { timeout: 5000 });
    expect(await page.getByRole('button', { name: 'Pin to the side' }).count() === 1, 'dossier: the drawer offers to pin it');
    await page.getByRole('button', { name: 'Pin to the side' }).click();
    await page.waitForSelector('.path-wide:not(.no-dock) .dock .dock-panel', { timeout: 5000 });
    expect(await page.locator('dialog.drawer[open][aria-label="OSRS Wiki inspector"]').count() === 0, 'dossier: pinning closes the drawer and shows the column');
    await page.reload();
    await page.waitForTimeout(1500);
    const dock = await text(page, '.dock');
    expect(await page.locator('.path-wide:not(.no-dock)').count() === 1, 'dossier: the pin is remembered after a reload');
    expect(/your current target/i.test(dock) && dock.includes('Keli') && !dock.includes('Click an item or NPC'), 'dossier: pinned with nothing chosen it shows the target NPC instead of an empty hint');
    if (process.env.UI_SHOTS) await page.screenshot({ path: `${process.env.UI_SHOTS}/cockpit-1280.png` }).catch(() => {});
    await page.getByRole('button', { name: 'Unpin from the side' }).click();
    await page.waitForTimeout(300);
    expect(await page.locator('.path-wide.no-dock').count() === 1, 'dossier: unpinning returns the on-demand drawer');
    expect(errors.length === 0, `dossier: no console errors ${errors.join('; ')}`);
    await page.context().close();
  }

  // A connected client at the login screen is not live guidance. Keep the target without claiming a visible arrow.
  {
    const questData = JSON.parse(readFileSync(new URL('../src/data/questStages.json', import.meta.url),'utf8')).quests['S3-04'];
    const stage = questData.stages.find((s: {do: {t:string;k?:string}[]}) => s.do.some(l => l.k === 'defeatGuardian'));
    const lineIndex = stage.do.findIndex((l: {t:string;k?:string}) => l.k === 'defeatGuardian');
    const {page, errors} = await open(browser,1440,{
      progress:progressBefore('S3-04'),localStorage:{'osrs-put:active-step':'S3-04'},
      status:{protocol:6,inGame:true,activeStepId:'S3-04',questInstruction:{stepId:'S3-04',stageAt:stage.at,lineIndex,peeking:false},navTarget:{stepId:'S3-04',label:'Talk to Willow (south of Ice Mountain)',x:0,y:0,plane:0}},
    },'#/step/S3-04');
    expect((await text(page,'.current-action-title')).includes('Ancient Guardian') && !(await text(page,'.current-action-title')).includes('Willow'),'current instruction: the quest cursor wins over the earlier arrow destination');
    const actionBox = await page.locator('.current-action-title').boundingBox();
    // Three columns at this width: the action keeps a readable measure (not squeezed into a sliver) and stays within four lines.
    expect(!!actionBox && actionBox.width >= 420 && actionBox.height < 180,'modern Path: the main action has readable desktop width');
    expect(await page.locator('.cockpit-walk .overview').isVisible(),'cockpit: the walkthrough is open without a click');
    const bag = await page.locator('.cockpit-bag .quest-preparation').boundingBox();
    expect(!!bag && !!actionBox && bag.x > actionBox.x + actionBox.width - 1 && bag.y < actionBox.y + 400 && await page.locator('.quest-preparation').count() === 1,'cockpit: on a wide window the stage list stands beside the action, once');
    const need = await text(page,'.cockpit-bag .quest-preparation');
    // The last fight asks for a pickaxe and food; the meat, bread, knife and beer of stage 15 are used up and folded away.
    expect(need.includes('Needed for this stage') && need.includes('Used earlier in this quest') && need.includes('Bronze pickaxe') && !need.includes('Missing')
      && !need.includes('Cooked meat') && !need.includes('Bread') && !need.includes('Knife') && !need.includes('Beer'),'cockpit: the quest items the stage no longer asks for are folded away, not listed as missing');
    expect(/checked|Ready to set off/.test(await text(page,'.cockpit-bag .status-line')) && !(await text(page,'.cockpit-bag .status-line')).includes('Missing'),'cockpit: the verdict follows the stage too');
    expect((await text(page,'.overview')).includes('In the game now'),'current instruction: the canonical walkthrough identifies the confirmed line');
    expect(await page.locator('.manual-complete').isVisible(),'cockpit: manual completion stays accessible');
    await page.keyboard.press('p');
    await page.waitForSelector('dialog.step-drawer[open]',{timeout:3000});
    expect((await text(page,'dialog.step-drawer[open]')).includes('Preparation') && await page.locator('dialog.step-drawer[open] .one-trip').count() === 1,'cockpit: P opens the Preparation drawer with the whole plan');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    expect(await page.locator('dialog.step-drawer[open]').count() === 0,'cockpit: Esc closes the drawer');
    await page.keyboard.press('t');
    await page.waitForSelector('dialog.step-drawer[open]',{timeout:3000});
    await page.keyboard.press('Escape');
    expect(errors.length === 0 && await noOverflow(page),'modern Path: no runtime errors or horizontal overflow');
    await page.context().close();
  }

  // The companion strip (compact view): four tabs of the same step, the same stage-aware list, Done and Skip, a way back to the full workspace.
  {
    const questData = JSON.parse(readFileSync(new URL('../src/data/questStages.json', import.meta.url),'utf8')).quests['S3-04'];
    const stage = questData.stages.find((s: {do: {t:string;k?:string}[]}) => s.do.some(l => l.k === 'defeatGuardian'));
    const lineIndex = stage.do.findIndex((l: {t:string;k?:string}) => l.k === 'defeatGuardian');
    const {page, errors} = await open(browser, 420, {
      progress:progressBefore('S3-04'),
      localStorage:{'osrs-put:active-step':'S3-04','osrs-put:features':JSON.stringify({compact:true})},
      status:{protocol:6,inGame:true,activeStepId:'S3-04',questInstruction:{stepId:'S3-04',stageAt:stage.at,lineIndex,peeking:false},navTarget:{stepId:'S3-04',label:'Talk to Willow (south of Ice Mountain)',x:0,y:0,plane:0}},
    }, '#/step/S3-04');
    await waitFor(page, '.strip', 5000);
    const tabs = page.getByRole('tablist', { name: 'Companion views' }).getByRole('tab');
    expect(await tabs.count() === 4 && (await tabs.allInnerTexts()).join('|') === 'Now|Bag|Route|More', 'strip: four tabs - Now, Bag, Route, More');
    expect((await text(page, '.strip .current-action-title')).includes('Ancient Guardian'), 'strip: Now shows the confirmed game line');
    expect(await page.locator('.strip .strip-next li').count() > 0, 'strip: Now lists the next lines');
    expect(await page.locator('.strip .step-status').count() === 0 && await page.locator('.strip .overview').count() === 0, 'strip: Now carries no readiness panel or walkthrough (they are Bag and More)');
    await tabs.nth(1).click();
    const bag = await text(page, '#strip-panel');
    expect(bag.includes('Needed for this stage') && bag.includes('Used earlier in this quest') && !bag.includes('Missing'), 'strip: Bag is stage-aware, earlier items are folded away');
    await tabs.nth(2).click();
    expect(await page.locator('.strip .strip-route li').count() > 1 && await page.locator('.strip .strip-step.is-current').count() === 1, 'strip: Route lists the stage with the current step marked');
    await tabs.nth(3).click();
    expect(await page.locator('.strip details.strip-fold').count() === 2, 'strip: More holds Travel and Details');
    await tabs.nth(0).click();
    expect(await page.getByRole('button', { name: /^Done/ }).count() === 1, 'strip: Done is one click away');
    expect(await page.getByRole('button', { name: 'Full workspace' }).count() === 1, 'strip: a way back to the full workspace');
    expect(errors.length === 0 && await noOverflow(page), `strip: no runtime errors or horizontal overflow ${errors.join('; ')}`);
    await page.getByRole('button', { name: 'Full workspace' }).click();
    await waitFor(page, '.cockpit, .path-wide', 5000);
    expect(await page.locator('.strip').count() === 0, 'strip: Full workspace returns to the cockpit');
    await page.context().close();
  }

  // Shield of Arrav had no stage data until 2.53 (the card never moved past Reldo). Now its overview lists the lines of both gangs.
  {
    const {page, errors} = await open(browser,1440,{
      progress:progressBefore('S3-05'), status:{protocol:6,inGame:true,activeStepId:'S3-05'}, localStorage:{'osrs-put:active-step':'S3-05'},
    },'#/step/S3-05');
    await waitFor(page,'.quest-walkthrough',5000);
    const overview = await page.locator('.quest-walkthrough').first().innerText();
    expect(['Reldo', 'Baraek', 'Charlie the Tramp', 'Katrine', 'Straven', 'King Roald'].every((n) => overview.includes(n)),'Shield of Arrav: the overview lists both gangs\' lines');
    expect(errors.length === 0 && await noOverflow(page),'Shield of Arrav: no runtime errors or horizontal overflow');
    await page.context().close();
  }

  // A connected client at the login screen is not live guidance. Keep the target without claiming a visible arrow.
  {
    const {page, errors} = await open(browser, 1280, {
      progress:progressBefore('S3-04'), status:{protocol:6, inGame:false, activeStepId:'S3-04'}, localStorage:{'osrs-put:active-step':'S3-04'},
    }, '#/step/S3-04');
    await waitFor(page, '.current-action', 5000);
    const hero = await text(page, '.current-action');
    expect(hero.includes('Waiting for character') && !hero.includes('Shown in the game'), 'login screen: the action waits for the character');
    expect(!(await text(page, '.step-status')).includes('the arrow leads to it'), 'login screen: the step status does not claim a live arrow');
    const code = await page.locator('.cockpit .step-id').boundingBox();
    expect(!!code && code.height <= 20, 'route rail: the current step code stays on one line');
    const hints = await text(page, '.ingame');
    expect(hints.includes('Saved target') && !hints.includes('Shown in the game') && !hints.includes('Active in RuneLite'), 'login screen: travel keeps the saved target without a live badge');
    await page.goto(BASE+'#/settings');
    await page.getByRole('tab',{name:'RuneLite',exact:true}).click();
    expect((await text(page, 'main')).includes('your character logs in'), 'login screen: settings explain when guidance resumes');
    const launch = await page.getByRole('button',{name:/RuneLite with the bridge is running/}).boundingBox();
    expect(!!launch && launch.width > 260 && launch.height <= 60, 'RuneLite settings: the launch button uses a full action row');
    expect(errors.length === 0, `login screen: no runtime errors ${errors.join('; ')}`);
    await page.context().close();
  }

  // The Content-Security-Policy of the built page: the meta tag is there, a foreign inline script does not run, and the page
  // with our theme script and the network only to the wiki works (there are no console errors).
  console.log('CSP');
  {
    const { page, errors } = await open(browser, 1280, {}, '#/');
    expect(await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')?.includes("default-src 'none'") ?? false), 'CSP: the policy is in the page');
    const blocked = await page.evaluate(() => new Promise<boolean>((res) => {
      const s = document.createElement('script');
      s.textContent = 'window.__injected = 1';
      document.head.appendChild(s);
      setTimeout(() => res(!(window as unknown as Record<string, unknown>).__injected), 100);
    }));
    expect(blocked, 'CSP: a foreign inline script is blocked');
    // One violation is our own trial above; there must be no others.
    const own = errors.filter((e) => /Content Security Policy|Refused/.test(e));
    expect(own.length === 1 && own[0].includes('inline script'), `CSP: our page does not violate its own policy ${own.join('; ')}`);
    await page.context().close();
  }

  // The header fits at any width when RuneLite is connected (it used to overflow by 11–193 px).
  console.log('Header');
  for (const scale of [1, 1.5]) for (const width of [320, 390, 900, 1000, 1100, 1280, 1400, 1600, 1720, 1920]) {
    const { page } = await open(browser, width, {progress:progressBefore('S3-03'),localStorage:{'osrs-put:text-scale':String(scale)}}, '#/');
    expect(await noOverflow(page), `the header at ${width} px and ${scale*100}% text without horizontal scrolling`);
    if (width >= 1000) expect(await page.locator('.app-sidebar').evaluate(el => el.scrollWidth <= el.clientWidth), `sidebar at ${width} px and ${scale*100}% text without internal horizontal scrolling`);
    // The old header moved its tabs to a third row below 1200 px and at large text; in the sidebar that rule put the sections under Settings.
    if (width >= 1000) expect(await page.evaluate(() => {
      const nav = document.querySelector('.app-sidebar .tabs-top')!.getBoundingClientRect();
      const foot = document.querySelector('.app-sidebar .sidebar-utilities')!.getBoundingClientRect();
      return nav.bottom <= foot.top + 1;
    }), `sidebar at ${width} px and ${scale*100}% text: the sections stand above quest points and Settings`);
    await page.context().close();
  }

  // The local strip of a section shows every link: the first one used to take the whole width and push the rest out of view.
  console.log('Section strip');
  // Shopping (2.67) and Gear (2.68) have no strip: one short page each.
  for (const [hash, least] of [['#/skills/ME', 5], ['#/journal', 3], ['#/reference', 3]] as [string, number][]) {
    for (const width of [1000, 1440]) {
      const { page } = await open(browser, width, { progress: progressBefore('S3-03') }, hash);
      const seen = await page.evaluate(() => {
        const nav = document.querySelector('.section-rail nav');
        if (!nav) return -1;
        const box = nav.getBoundingClientRect();
        return [...nav.querySelectorAll('.section-nav-item')].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.left >= box.left - 1 && r.right <= box.right + 1;
        }).length;
      });
      expect(seen >= least, `section strip ${hash} at ${width} px: ${seen} links in view (at least ${least})`);
      await page.context().close();
    }
  }

  // The desktop action follows the quest cursor while the player stays logged in: the plugin announces a moved cursor with a STATUS event.
  {
    const quest = JSON.parse(readFileSync(new URL('../src/data/questStages.json', import.meta.url), 'utf8')).quests['S3-04'];
    const last = quest.stages.find((s: { do: { t: string; k?: string }[] }) => s.do.some((l) => l.k === 'defeatGuardian'));
    const earlier = quest.stages.find((s: { at: number; do: { t: string; k?: string }[] }) => s.at < last.at && s.do.length > 0 && s.do[0].k !== 'defeatGuardian');
    const { page } = await open(browser, 1440, {
      progress: progressBefore('S3-04'), localStorage: { 'osrs-put:active-step': 'S3-04' },
      status: { protocol: 6, inGame: true, activeStepId: 'S3-04', questInstruction: { stepId: 'S3-04', stageAt: earlier.at, lineIndex: 0, peeking: false } },
    }, '#/step/S3-04');
    const before = await text(page, '.current-action-title');
    await page.evaluate((at: number) => {
      const w = window as unknown as { __status: Record<string, unknown>; __emit: (e: unknown) => void };
      w.__status = { questInstruction: { stepId: 'S3-04', stageAt: at, lineIndex: 0, peeking: false } };
      w.__emit({ type: 'STATUS', inGame: true });
    }, last.at);
    await page.waitForTimeout(600);
    const after = await text(page, '.current-action-title');
    expect(!before.includes('Ancient Guardian') && after.includes('Ancient Guardian'), 'current instruction: it moves with the quest cursor without a new login');
    await page.context().close();
  }

  // A step's tasks: buying the Dragon scimitar completes the step; wielding it needs Attack 60 and is tracked beside the step, not inside it.
  {
    const { page, errors } = await open(browser, 1440, {
      progress: progressBefore('S9-04'), localStorage: { 'osrs-put:active-step': 'S9-04' },
      status: { protocol: 6, inGame: true, activeStepId: 'S9-04', stats: { attack: 52 }, equipment: [], inventory: [], coins: 1000, bankCoins: 0 },
    }, '#/step/S9-04');
    await page.waitForTimeout(500);
    const tasks = await text(page, '.step-tasks');
    expect(/Attack 52 of 60/.test(tasks) && /Wield the Dragon scimitar/.test(tasks), 'step tasks: Attack 60 and wielding are tracked beside the step');
    expect(errors.length === 0, `step tasks: no console errors ${errors.join('; ')}`);
    await page.context().close();
  }

  // A new account's sale restrictions: the hide-selling step warns when the game's own numbers say it is restricted, and only hints otherwise.
  for (const [label, qp, total, banner] of [['restricted', 4, 41, true], ['unknown', 30, 320, false]] as const) {
    const { page, errors } = await open(browser, 1440, {
      progress: progressBefore('S1-13', { gameMode: 'f2p' }), localStorage: { 'osrs-put:active-step': 'S1-13' },
      status: { protocol: 6, inGame: true, activeStepId: 'S1-13', questPoints: qp, totalLevel: total, coins: 8400, bankCoins: 0 },
    }, '#/step/S1-13');
    await page.waitForTimeout(500);
    const note = await text(page, '.trade-note');
    expect(banner ? /cannot sell Cowhide, Leather yet/.test(note) && /quest points 4 of 10/.test(note) : /20 hours of play/.test(note) && !/cannot sell Cowhide, Leather yet/.test(note),
      `trade restrictions (${label}): the note matches the account's numbers`);
    expect(errors.length === 0, `trade restrictions (${label}): no console errors ${errors.join('; ')}`);
    if (banner) {
      await page.getByRole('button', { name: 'I can already sell these' }).first().click();
      await page.waitForTimeout(200);
      expect(/You marked the sale restrictions as lifted/.test(await text(page, '.trade-note')), 'trade restrictions: the player can say the restrictions are lifted');
    }
    await page.context().close();
  }

  // Inventory cleanup: the bag is checked against the open steps, "Always keep" moves a line to the kept list and survives a reload.
  for (const width of [1440, 390]) {
    const { page, errors } = await open(browser, width, {
      progress: progressBefore('S2-10', { gameMode: 'f2p' }),
      status: {
        protocol: 6, inGame: true, player: 'Cleanup Test', questPoints: 4, totalLevel: 41, coins: 100, bankCoins: 0,
        equipment: [], inventory: [{ id: 1759, name: 'Ball of wool', count: 23 }, { id: 1760, name: 'Ball of wool', count: 7, noted: true }, { id: 315, name: 'Shrimps', count: 4 }, { id: 995, name: 'Coins', count: 100 }],
      },
    }, '#/shopping');
    await page.waitForTimeout(800);
    // Cleanup is folded away on the shopping page and mounted when opened.
    await page.locator('.shop-cleanup > summary').click();
    await page.waitForTimeout(400);
    const card = await text(page, '.cleanup-card');
    expect(/Inventory cleanup/.test(card) && /Ball of wool/.test(card), `inventory cleanup (${width} px): the section lists the bag`);
    expect(/Keep 3 for Prince Ali Rescue/.test(card), `inventory cleanup (${width} px): the quantity kept for the route is named`);
    expect(!/Shrimps ×4[^]*Sell/.test(card.split('Staying in the bag')[0] ?? ''), `inventory cleanup (${width} px): food is never offered for sale`);
    expect(/sells, drops and destroys nothing/.test(card), `inventory cleanup (${width} px): it says it is advice only`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(!overflow, `inventory cleanup (${width} px): no horizontal scroll`);
    if (process.env.UI_SHOTS) await page.locator('.cleanup-card').screenshot({ path: `${process.env.UI_SHOTS}/cleanup-${width}.png` }).catch(() => {});
    // The same advice goes to the game in the snapshot: the surplus wool with its ids, for this character; food and coins never.
    const lastCleanup = async () => {
      const posts = await page.evaluate(() => (window as unknown as { __posts: { path: string; body: any }[] }).__posts);
      const snaps = posts.filter((p) => p.path === '/prep-plan');
      return snaps.length ? (snaps[snaps.length - 1].body.cleanup ?? null) : undefined;
    };
    const sentHint = await lastCleanup();
    expect(sentHint?.player === 'Cleanup Test' && sentHint.lines.some((l: any) => l.id === 1760 && l.qty === 7 && l.noted)
      && !sentHint.lines.some((l: any) => l.id === 315 || l.id === 995), `inventory cleanup (${width} px): the game gets the same lines in the snapshot`);
    await page.getByRole('button', { name: 'Always keep' }).first().click();
    await page.waitForTimeout(800);
    expect((await lastCleanup()) === null, `inventory cleanup (${width} px): "Always keep" takes the lines out of the game too`);
    expect(/You marked it/.test(await page.evaluate(() => document.querySelector('.cleanup-keeps')?.textContent ?? '')) && /Stop always keeping/.test(await page.evaluate(() => document.querySelector('.cleanup-keeps')?.textContent ?? '')), `inventory cleanup (${width} px): Always keep moves the line to the kept list`);
    expect(errors.length === 0, `inventory cleanup (${width} px): no console errors ${errors.join('; ')}`);
    await page.context().close();
  }

  // The visual review at Windows display scaling (UI_SCALES=1): a 1920×1040 screen at 100, 125 and 150%, every main page with a linked game on the
  // Minotaur step. Screenshots go to UI_SHOTS as scale-<percent>-<page>.png for the eye; the checks are the ones a review needs every time.
  if (process.env.UI_SCALES) {
    const equipment = [[1329, 'Mithril scimitar', 'weapon'], [1153, 'Iron full helm', 'head'], [1115, 'Iron platebody', 'body'], [1081, 'Iron plateskirt', 'legs'], [1191, 'Iron kiteshield', 'shield']]
      .map(([id, name, slot]) => ({ id, name, slot }));
    const gear = { equipment, inventory: [{ id: 1759, name: 'Ball of wool', count: 23 }], coins: 500, bankCoins: 3000 };
    const stats = { attack: 22, strength: 16, defence: 1, hitpoints: 22 };
    const xp = { attack: 5624, strength: 2746, defence: 0, hitpoints: 2400 };
    const pages: [string, string][] = [['home', '#/'], ['step', '#/step/S3-08'], ['shopping', '#/shopping'], ['skills', '#/skills'], ['gear', '#/gear'], ['money', '#/money'], ['journal', '#/journal'], ['settings', '#/settings']];
    for (const scale of [1, 1.25, 1.5]) {
      for (const [name, hash] of pages) {
        const { page, errors } = await open(browser, Math.round(1920 / scale), {
          scale, zen: true, progress: progressBefore('S3-08'), localStorage: { 'osrs-put:active-step': 'S3-08' },
          status: { protocol: 6, ...gear, stats, xp, activeStepId: 'S3-08', player: 'Scale Test' },
          events: [{ type: 'STATS', stats }, { type: 'XP', xp }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Salmon', carried: 0, noted: 0, bank: 13 }] }],
        }, hash);
        await page.waitForTimeout(400);
        const pct = Math.round(scale * 100);
        expect(await noOverflow(page), `scale ${pct}%: ${name} without horizontal scrolling`);
        const clipped = await page.evaluate(() => [...document.querySelectorAll('button, .btn')].filter((b) => {
          const el = b as HTMLElement;
          return el.offsetParent !== null && el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible';
        }).length);
        expect(clipped === 0, `scale ${pct}%: ${name} has no clipped button text (${clipped})`);
        expect(errors.length === 0, `scale ${pct}%: ${name} no console errors ${errors.join('; ')}`);
        if (process.env.UI_SHOTS) await page.screenshot({ path: `${process.env.UI_SHOTS}/scale-${pct}-${name}.png`, fullPage: true }).catch(() => {});
        await page.context().close();
      }
    }
  }

  await fundingScenarios(browser);
  await combatRouteScenarios(browser);
  await shoppingScenarios(browser);
  await gearScenarios(browser);
  await moneyScenarios(browser);
}

// Raising coins for the Hill Giants step: a character with 400 coins and an empty bank is short of food. The card says so in one line with one button;
// Start sets an arrow and a status line, Cancel takes both away and the route step is untouched.
async function fundingScenarios(browser: Browser) {
  console.log('funding');
  const equipment = ([[1331, 'Adamant scimitar', 'weapon'], [1153, 'Iron full helm', 'head'], [1115, 'Iron platebody', 'body'], [1081, 'Iron plateskirt', 'legs'], [1191, 'Iron kiteshield', 'shield']] as [number, string, string][])
    .map(([id, name, slot]) => ({ id, name, slot }));
  const gear = { equipment, inventory: [], coins: 400, bankCoins: 0 };
  // The plugin reports every item the route asks about, zero included; what is worn counts as carried.
  const all = JSON.parse(readFileSync(new URL('../src/data/steps.json', import.meta.url), 'utf8')) as { id: string; itemsRequired?: { nameEn: string }[] }[];
  const from = all.findIndex((x) => x.id === 'S4-03');
  const worn = new Set(equipment.map((e) => e.name));
  const asked = [...new Set(all.slice(from, from + 8).flatMap((x) => (x.itemsRequired ?? []).map((i) => i.nameEn)))];
  const owned = asked.map((name) => ({ name, carried: worn.has(name) ? 1 : 0, noted: 0, bank: 0 }));
  for (const width of [1440, 390]) {
    const { page, errors } = await open(browser, width, {
      progress: progressBefore('S4-03', { gameMode: 'f2p' }),
      status: {
        protocol: 6, inGame: true, player: 'Funding Test', activeStepId: 'S4-03', questPoints: 30, totalLevel: 150,
        stats: { attack: 30, strength: 21, defence: 1, hitpoints: 24 }, pos: { x: 3093, y: 3495, plane: 0 }, ...gear,
      },
      events: [
        { type: 'OWNED', bankSeen: true, items: owned }, { type: 'GEAR', gear }, { type: 'QUESTS', done: [] },
        { type: 'STATS', stats: { attack: 30, strength: 21, defence: 1, hitpoints: 24 } }, { type: 'XP', xp: { attack: 13363, strength: 2000, defence: 0, hitpoints: 3500 } },
      ],
      market: true,
    }, '#/step/S4-03');
    await reveal(page, '.one-trip');
    await page.waitForTimeout(1500);
    const posts = async () => page.evaluate(() => (window as unknown as { __posts: { path: string; body: any }[] }).__posts);
    const card = await text(page, '.funding-card');
    expect(/gp short/.test(card), `funding (${width} px): the card names the shortage in one line`);
    expect(await page.locator('.funding-card .btn-primary').count() === 1, `funding (${width} px): one primary button`);
    expect(await page.locator('.funding-card details').count() === 1 && !(await page.locator('.funding-card details').evaluate((d) => (d as HTMLDetailsElement).open)), `funding (${width} px): the details are folded`);
    expect(!/Coins for the steps/.test(await text(page, '.one-trip')), `funding (${width} px): the coin shortage is said once`);
    expect(await noOverflow(page), `funding (${width} px): no horizontal scroll`);
    if (process.env.UI_SHOTS) await page.locator('.funding-card').screenshot({ path: `${process.env.UI_SHOTS}/funding-${width}.png` }).catch(() => {});
    await page.locator('.funding-card details > summary').click();
    if (process.env.UI_SHOTS) await page.locator('.funding-card').screenshot({ path: `${process.env.UI_SHOTS}/funding-open-${width}.png` }).catch(() => {});
    expect(/Your coins: 400 gp/.test(await text(page, '.funding-card')), `funding (${width} px): the details state the coins`);
    await page.locator('.funding-card .btn-primary').click();
    await page.waitForTimeout(800);
    const nav = (await posts()).filter((p) => p.path === '/nav-target');
    expect(nav.length > 0 && String(nav[nav.length - 1].body.label).startsWith('Funding: ') && !('stepId' in nav[nav.length - 1].body), `funding (${width} px): Start sets one arrow that is not a route step`);
    expect(await page.locator('.status-funding').count() >= 1, `funding (${width} px): the plan shows as one line in the step status`);
    await page.waitForTimeout(900);
    const lastFunding = async () => {
      const snaps = (await posts()).filter((p) => p.path === '/prep-plan');
      return snaps.length ? (snaps[snaps.length - 1].body.funding ?? null) : undefined;
    };
    const sentPlan = await lastFunding();
    expect(sentPlan?.player === 'Funding Test' && sentPlan.status === 'ACTIVE' && typeof sentPlan.action === 'string' && sentPlan.stepCount >= 2, `funding (${width} px): the game gets the same plan in the snapshot`);
    expect((await text(page, '.status-funding')).includes(String(sentPlan?.action ?? ' ')), `funding (${width} px): the app and the game say the same sentence`);
    expect(await page.locator('.funding-card.is-running').count() === 1, `funding (${width} px): the card shows the step in hand`);
    const saved = await page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('osrs-put:funding-plan')).map(([, v]) => JSON.parse(v)));
    expect(saved.length === 1 && saved[0].sourceStepId === 'S4-03' && saved[0].character === 'Funding Test', `funding (${width} px): the plan is saved for this character`);
    if (process.env.UI_SHOTS) await page.locator('.funding-card').screenshot({ path: `${process.env.UI_SHOTS}/funding-running-${width}.png` }).catch(() => {});
    await page.getByRole('button', { name: 'Cancel' }).first().click();
    await page.waitForTimeout(500);
    expect(await page.locator('.funding-card.is-running').count() === 0 && await page.locator('.status-funding').count() === 0, `funding (${width} px): Cancel closes the plan`);
    await page.waitForTimeout(900);
    expect((await lastFunding()) === undefined || (await lastFunding()) === null, `funding (${width} px): Cancel takes the line out of the game too`);
    const gone = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('osrs-put:funding-plan')).length);
    expect(gone === 0, `funding (${width} px): nothing is left saved`);
    const done = await page.evaluate(() => { const j = (window as unknown as { __saved?: string }).__saved; return j ? JSON.parse(j) : null; });
    expect(!done || !done.steps || done.steps['S4-03'] === undefined, `funding (${width} px): the route step was not touched`);
    expect(errors.length === 0, `funding (${width} px): no console errors ${errors.join('; ')}`);
    await page.context().close();
  }
}

// The Money section 2.71: every earning method at any time, one recommendation, a search, a sort, filters, the details under a row; Start asks for the
// goal and makes the coin card's plan (the arrow, the step's card, the game line); another method is an explicit switch; the route step is never touched.
async function moneyScenarios(browser: Browser) {
  console.log('money');
  const equipment = ([[1331, 'Adamant scimitar', 'weapon'], [1153, 'Iron full helm', 'head'], [1115, 'Iron platebody', 'body'], [1081, 'Iron plateskirt', 'legs'], [1191, 'Iron kiteshield', 'shield']] as [number, string, string][])
    .map(([id, name, slot]) => ({ id, name, slot }));
  const all = JSON.parse(readFileSync(new URL('../src/data/steps.json', import.meta.url), 'utf8')) as { id: string; itemsRequired?: { nameEn: string }[] }[];
  const from = all.findIndex((x) => x.id === 'S4-03');
  const worn = new Set(equipment.map((e) => e.name));
  const asked = [...new Set(all.slice(from, from + 8).flatMap((x) => (x.itemsRequired ?? []).map((i) => i.nameEn)))];
  const stats = { attack: 30, strength: 21, defence: 1, hitpoints: 24 };
  const hero = (o: { bankSeen?: boolean; offline?: boolean } = {}): Mock => {
    const gear = { equipment, inventory: [], coins: 400, bankCoins: o.bankSeen === false ? null : 0 };
    const owned = asked.map((name) => ({ name, carried: worn.has(name) ? 1 : 0, noted: 0, ...(o.bankSeen === false ? {} : { bank: 0 }) }));
    return {
      progress: progressBefore('S4-03', { gameMode: 'f2p' }),
      localStorage: { 'osrs-put:active-step': 'S4-03' },
      market: true,
      ...(o.offline ? { offline: true } : {
        status: { protocol: 6, inGame: true, player: 'Money Test', activeStepId: 'S4-03', questPoints: 30, totalLevel: 150, stats, pos: { x: 3093, y: 3495, plane: 0 }, ...gear },
        events: [
          { type: 'OWNED', bankSeen: o.bankSeen !== false, items: owned }, { type: 'GEAR', gear }, { type: 'QUESTS', done: [] },
          { type: 'STATS', stats }, { type: 'XP', xp: { attack: 13363, strength: 2000, defence: 0, hitpoints: 3500 } },
        ],
      }),
    };
  };
  type Post = { path: string; body: any };
  const shot = async (page: Page, name: string) => {
    if (process.env.UI_SHOTS) await page.screenshot({ path: `${process.env.UI_SHOTS}/money-${name}.png`, fullPage: true }).catch(() => {});
  };
  const gpOf = (t: string) => { const m = /^([\d.]+)(k?)/.exec(t.trim()); return m ? Number(m[1]) * (m[2] ? 1000 : 1) : -Infinity; };

  for (const width of [1440, 390]) {
    const { page, errors } = await open(browser, width, hero(), '#/money');
    await page.waitForTimeout(1500);
    const posts = async () => page.evaluate(() => (window as unknown as { __posts: Post[] }).__posts);
    const lastFunding = async () => {
      const snaps = (await posts()).filter((p) => p.path === '/prep-plan');
      return snaps.length ? (snaps[snaps.length - 1].body.funding ?? null) : undefined;
    };
    const savedPlans = async () => page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('osrs-put:funding-plan')).map(([, v]) => JSON.parse(v)));
    const navBefore = (await posts()).filter((p) => p.path === '/nav-target').length;

    // Without a goal: one recommendation, a compact list, nothing started.
    expect(await page.getByRole('heading', { name: 'Money' }).count() === 1, `money (${width} px): the section opens from its own page`);
    expect(await page.locator('a[href="#/money"]').count() >= 1, `money (${width} px): it is in the navigation`);
    const best = (await page.locator('.money-reco-head strong').innerText()).trim();
    expect(best.length > 0 && await page.locator('.money-reco .btn-primary').count() === 1, `money (${width} px): one recommendation with one primary button (${best})`);
    expect(/Ranked by the time to cover the [\d,]+ gp S4-03 is short/.test(await page.locator('.money-context').innerText()), `money (${width} px): ranked for the step's shortfall, as the coin card`);
    const rows = page.locator('.money-row');
    expect(await rows.count() >= 3 && await rows.count() <= 6, `money (${width} px): a compact list, ${await rows.count()} rows before "Show more"`);
    expect(await page.locator('.money-row .money-details').count() === 0, `money (${width} px): the details are folded`);
    const facts = await page.locator('.money-row-facts').allInnerTexts();
    expect(facts.every((t) => /gp\/h net|Estimate unavailable/.test(t) && /gp to start|No coins needed/.test(t)), `money (${width} px): every row says net an hour (or "Estimate unavailable") and the coins to start`);
    if (width === 390) {
      const narrow = await page.locator('.money-row-title').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width < 100).length);
      expect(narrow === 0, `money (390 px): no row title is squeezed by its badge`);
    }
    expect(await noOverflow(page), `money (${width} px): no horizontal scroll`);
    await shot(page, `default-${width}`);

    // Search, sort and filters.
    await page.locator('.money-search').fill('coal');
    await page.waitForTimeout(200);
    const found = await page.locator('.money-row-title').allInnerTexts();
    expect(found.length >= 1 && found.length < 6, `money (${width} px): the search narrows the list (${found.join(', ')})`);
    await page.locator('.money-search').fill('');
    await page.locator('.money-sort select').selectOption('profit');
    await page.waitForTimeout(200);
    const nets = (await page.locator('.money-row-facts').allInnerTexts()).map(gpOf);
    expect(nets.every((n, i) => i === 0 || n <= nets[i - 1]), `money (${width} px): "Profit an hour" orders the rows by profit`);
    await page.locator('.money-sort select').selectOption('recommended');
    await page.locator('.money-filters-toggle').click();
    await page.getByLabel('Show locked methods').check();
    await page.waitForTimeout(200);
    while (await page.getByRole('button', { name: /^Show \d+ more$/ }).count()) await page.getByRole('button', { name: /^Show \d+ more$/ }).click();
    expect(await page.locator('.money-row .money-badge.is-locked').count() >= 1, `money (${width} px): "Show locked methods" adds what the account cannot do, with what is missing`);
    await page.getByLabel('Show locked methods').uncheck();
    await page.locator('.money-filters-toggle').click();

    // The details under a row: what it needs and how the player meets it; reading them changes nothing.
    await rows.first().locator('.money-row-head').click();
    await page.waitForTimeout(200);
    const details = await page.locator('.money-row .money-details').first().innerText();
    expect(/What it needs/.test(details) && /Where and how/.test(details) && await page.locator('.money-row .money-checks li').count() >= 2, `money (${width} px): the details list the requirements and the way`);
    expect(await page.locator('.money-row .money-calc').first().evaluate((d) => !(d as HTMLDetailsElement).open), `money (${width} px): sources and calculations stay folded`);
    expect((await posts()).filter((p) => p.path === '/nav-target').length === navBefore && (await savedPlans()).length === 0, `money (${width} px): browsing sets no arrow and starts nothing`);
    await rows.first().locator('.money-row-head').click();

    // Start: the goal, then the coin card's plan everywhere.
    await page.locator('.money-reco').getByRole('button', { name: 'Start…' }).click();
    const goal = page.locator('.money-reco .money-goal');
    expect(await goal.count() === 1 && /Cover the [\d,]+ gp S4-03 is short/.test(await goal.innerText()), `money (${width} px): Start asks for the goal and offers the step's shortfall`);
    await goal.locator('.money-goal-option', { hasText: 'more coins' }).locator('input[type=radio]').check();
    await goal.locator('.money-amount').fill('2,000');
    await goal.getByRole('button', { name: 'Start' }).click();
    await page.waitForTimeout(1200);
    expect(await page.locator('.money-running .funding-card.is-running').count() === 1, `money (${width} px): the plan runs, shown by the coin card itself`);
    const nav = (await posts()).filter((p) => p.path === '/nav-target');
    expect(nav.length > navBefore && String(nav[nav.length - 1].body.label).startsWith('Funding: '), `money (${width} px): Start sets the plan's arrow`);
    let saved = await savedPlans();
    expect(saved.length === 1 && saved[0].goal?.kind === 'amount' && saved[0].goal.coins === 2000 && saved[0].sourceStepId === 'S4-03' && saved[0].target.required === 2400,
      `money (${width} px): the plan is saved with its goal: 2,000 more than the 400 gp at the start`);
    await page.waitForTimeout(900);
    const sent = await lastFunding();
    expect(sent?.status === 'ACTIVE' && sent.player === 'Money Test' && (await page.locator('.money-running .funding-line').innerText()).includes(String(sent.action)),
      `money (${width} px): the game gets the same action as the app`);
    await shot(page, `running-${width}`);

    // Pause and resume.
    await page.locator('.money-running').getByRole('button', { name: 'Pause' }).click();
    await page.waitForTimeout(300);
    expect(await page.locator('.money-running .funding-card.is-paused').count() === 1, `money (${width} px): Pause holds the plan`);
    await page.locator('.money-running').getByRole('button', { name: 'Resume' }).click();
    await page.waitForTimeout(300);
    expect(await page.locator('.money-running .funding-card.is-paused').count() === 0, `money (${width} px): Resume carries on`);

    // The step page shows the same plan; the route step is untouched.
    await page.evaluate(() => { location.hash = '#/step/S4-03'; });
    await page.waitForTimeout(900);
    expect(await page.locator('.status-funding').count() >= 1, `money (${width} px): the step shows the running plan in its status`);
    await page.evaluate(() => { location.hash = '#/money'; });
    await page.waitForTimeout(900);

    // An explicit switch to another method.
    const other = page.locator('.money-row').filter({ has: page.locator('.money-badge.is-ok') }).first();
    if (await other.count()) {
      const name = (await other.locator('.money-row-title').innerText()).trim();
      await other.locator('.money-row-head').click();
      await other.getByRole('button', { name: 'Start…' }).click();
      const chooser = other.locator('.money-goal');
      expect(/This stops/.test(await chooser.innerText()) && await chooser.getByRole('button', { name: 'Switch to this method' }).count() === 1, `money (${width} px): another method says what it stops and asks to switch`);
      await chooser.locator('.money-goal-option', { hasText: 'open session' }).locator('input[type=radio]').check();
      await chooser.getByRole('button', { name: 'Switch to this method' }).click();
      await page.waitForTimeout(900);
      saved = await savedPlans();
      expect(saved.length === 1 && saved[0].openEnded === true && saved[0].title === name, `money (${width} px): the switch replaces the plan (${name}, open session)`);
    } else {
      expect(false, `money (${width} px): a second method the player can do now, to switch to`);
    }

    // Stop: nothing left running or saved, the game line gone, the route step not touched.
    await page.locator('.money-running').getByRole('button', { name: 'Cancel' }).click();
    await page.waitForTimeout(900);
    expect(await page.locator('.money-running').count() === 0 && (await savedPlans()).length === 0, `money (${width} px): Stop ends the plan`);
    const line = await lastFunding();
    expect(line === null || line === undefined, `money (${width} px): the game line goes too`);
    const progress = await page.evaluate(() => { const j = (window as unknown as { __saved?: string }).__saved; return j ? JSON.parse(j) : null; });
    expect(!progress || !progress.steps || progress.steps['S4-03'] === undefined, `money (${width} px): the route step was not touched`);
    expect(errors.length === 0, `money (${width} px): no console errors ${errors.join('; ')}`);
    await page.context().close();
  }

  // The coin card leads here.
  {
    const { page, errors } = await open(browser, 1440, hero(), '#/step/S4-03');
    await reveal(page, '.one-trip');
    await page.waitForTimeout(1500);
    const card = (await page.locator('.funding-card .funding-line').first().innerText()).trim();
    expect(await page.locator('.funding-card a.funding-browse[href="#/money"]').count() === 1, 'money: the coin card links to "Browse earning methods"');
    await page.locator('.funding-card a.funding-browse').click();
    await page.waitForTimeout(1500);
    const best = (await page.locator('.money-reco-head strong').innerText()).trim();
    expect(card === best, `money: the coin card and the Money section recommend the same method (${card} / ${best})`);
    expect(errors.length === 0, `money (card link): no console errors ${errors.join('; ')}`);
    await page.context().close();
  }

  // The bank not read: "more coins" cannot be counted yet, an open session can start.
  {
    const { page, errors } = await open(browser, 1440, hero({ bankSeen: false }), '#/money');
    await page.waitForTimeout(1500);
    expect(/bag only/.test(await page.locator('.money-context').innerText()), 'money (bank unread): the coins are said to be the bag only');
    await page.locator('.money-reco').getByRole('button', { name: 'Start…' }).click();
    const goal = page.locator('.money-reco .money-goal');
    await goal.locator('.money-goal-option', { hasText: 'more coins' }).locator('input[type=radio]').check();
    expect(/Open your bank once/.test(await goal.innerText()) && await goal.getByRole('button', { name: 'Start' }).isDisabled(), 'money (bank unread): "more coins" waits for the bank, with the reason');
    await goal.locator('.money-goal-option', { hasText: 'open session' }).locator('input[type=radio]').check();
    expect(!(await goal.getByRole('button', { name: 'Start' }).isDisabled()), 'money (bank unread): an open session can start');
    await shot(page, 'bank-unread');
    expect(errors.length === 0, `money (bank unread): no console errors ${errors.join('; ')}`);
    await page.context().close();
  }

  // RuneLite not connected: published figures, nothing called available.
  {
    const { page, errors } = await open(browser, 1440, hero({ offline: true }), '#/money');
    await page.waitForTimeout(1500);
    expect(/No method can be recommended yet/.test(await page.locator('.money-empty').innerText()), 'money (offline): no recommendation without the account');
    expect(await page.locator('.money-row').count() >= 3 && await page.locator('.money-badge.is-ok').count() === 0, 'money (offline): the list shows the methods, none called "Can do now"');
    expect(/Connect RuneLite/.test(await page.locator('.money-context').innerText()), 'money (offline): it says what would confirm them');
    await shot(page, 'offline');
    expect(errors.length === 0, `money (offline): no console errors ${errors.join('; ')}`);
    await page.context().close();
  }
}

// Another way to do the Hill Giants step: the character with 24 hitpoints and Defence 1 is offered a split (cows for Attack, then the giants for the bones).
// Adopting it moves the arrow, the pace line and the food to the cows for the app and the game alike, and leaves the route's own step open; going back undoes it.
// Shopping 2.67: one list for the step in progress, grouped by what to do; each state said as what it is (lib/shoppingView.ts).
async function shoppingScenarios(browser: Browser) {
  console.log('shopping');
  const scim = { id: 1329, name: 'Mithril scimitar', slot: 'weapon' };
  const base = (o: { worn?: boolean; coins?: number; bankSeen?: boolean; items?: { name: string; carried: number; noted: number; bank?: number }[]; offline?: boolean }) => {
    const gear = { equipment: o.worn ? [scim] : [], inventory: [], coins: o.coins ?? 100, bankCoins: o.bankSeen === false ? null : 0 };
    return {
      progress: progressBefore('S3-08'),
      localStorage: { 'osrs-put:active-step': 'S3-08', 'osrs-put:shopping-scope': 'step' },
      market: true,
      ...(o.offline ? { offline: true } : {
        status: { protocol: 6, inGame: true, player: 'Shop Test', activeStepId: 'S3-08', questPoints: 20, totalLevel: 120, ...gear },
        events: [{ type: 'OWNED', bankSeen: o.bankSeen !== false, items: o.items ?? [] }, { type: 'GEAR', gear }],
      }),
    };
  };
  const shot = async (page: Page, name: string) => {
    if (process.env.UI_SHOTS) await page.locator('.shop-page').screenshot({ path: `${process.env.UI_SHOTS}/shopping-${name}.png` }).catch(() => {});
  };
  for (const width of [1440, 390]) {
    // Real shortages: the purchases, the money short, the way to the coin plan, the exchange list.
    {
      const { page, errors } = await open(browser, width, base({ items: [{ name: 'Mithril scimitar', carried: 0, noted: 0, bank: 0 }, { name: 'Salmon', carried: 0, noted: 0, bank: 5 }] }), '#/shopping');
      await page.waitForTimeout(1200);
      const body = await text(page, '.shop-page');
      expect(/Buy · 2/.test(body) && /Salmon[^]*×15/.test(body) && /5 more in the bank/.test(body), `shopping (${width} px): the buy list with the bank stock named`);
      expect(/short [\d,]+ gp/.test(body) && await page.getByRole('link', { name: 'Raise the coins' }).count() === 1, `shopping (${width} px): the shortfall links to the coin plan`);
      expect(await page.getByRole('button', { name: /Copy the exchange list/ }).count() === 1, `shopping (${width} px): one copy button for the exchange purchases`);
      expect(!/Still open|Partly owned|Unverified/.test(body), `shopping (${width} px): no status filter bar`);
      expect(/Bag and bank checked in this session/.test(body), `shopping (${width} px): the sync line says what was read`);
      expect(await noOverflow(page), `shopping (${width} px): no horizontal scroll`);
      expect(!errors.length, `shopping (${width} px): no console errors ${errors.join('; ')}`);
      await shot(page, `missing-${width}`);
      await page.context().close();
    }
    // Everything owned: worn and in the bag. The way back to the step, no copy button, no budget.
    {
      const { page, errors } = await open(browser, width, base({ worn: true, items: [{ name: 'Mithril scimitar', carried: 1, noted: 0, bank: 0 }, { name: 'Salmon', carried: 20, noted: 0, bank: 0 }] }), '#/shopping');
      await page.waitForTimeout(1200);
      const body = await text(page, '.shop-page');
      expect(/Everything for this step is with you/.test(body) && await page.getByRole('link', { name: 'Back to the step' }).count() === 1, `shopping all owned (${width} px): said, with the way back`);
      expect(await page.getByRole('button', { name: /Copy the exchange list/ }).count() === 0 && !/Purchases/.test(body), `shopping all owned (${width} px): no copy button, no budget`);
      expect(!errors.length, `shopping all owned (${width} px): no console errors ${errors.join('; ')}`);
      await shot(page, `owned-${width}`);
      await page.context().close();
    }
    // In the bank, not with you: take, not buy.
    {
      const { page } = await open(browser, width, base({ worn: true, items: [{ name: 'Mithril scimitar', carried: 1, noted: 0, bank: 0 }, { name: 'Salmon', carried: 0, noted: 0, bank: 30 }] }), '#/shopping');
      await page.waitForTimeout(1200);
      const body = await text(page, '.shop-page');
      expect(/Take from the bank · 1/.test(body) && /Take 20 from the bank/.test(body) && !/Buy · /.test(body), `shopping bank (${width} px): a withdrawal, not a purchase`);
      expect(await page.getByRole('button', { name: /Copy the exchange list/ }).count() === 0, `shopping bank (${width} px): a withdrawal is not in the exchange list`);
      await page.context().close();
    }
    // The bank not opened: not confirmed, never "missing" or "owned".
    {
      const { page } = await open(browser, width, base({ bankSeen: false, items: [{ name: 'Salmon', carried: 3, noted: 0 }] }), '#/shopping');
      await page.waitForTimeout(1200);
      const body = await text(page, '.shop-page');
      expect(/Not confirmed · \d/.test(body) && /Open your bank in RuneLite to refresh/.test(body), `shopping unknown bank (${width} px): not confirmed, with the honest way to refresh`);
      expect(!/Everything for/.test(body), `shopping unknown bank (${width} px): no success message`);
      await shot(page, `unknown-${width}`);
      await page.context().close();
    }
    // Offline: said as offline, the steps' needs listed as not confirmed.
    {
      const { page } = await open(browser, width, base({ offline: true }), '#/shopping');
      await page.waitForTimeout(1500);
      const body = await text(page, '.shop-page');
      expect(/Offline — ownership not confirmed/.test(body) && !/Nothing to/.test(body), `shopping offline (${width} px): offline is said, not "nothing to buy"`);
      await shot(page, `offline-${width}`);
      await page.context().close();
    }
  }
}

async function combatRouteScenarios(browser: Browser) {
  console.log('combat route');
  const equipment = ([[1331, 'Adamant scimitar', 'weapon'], [1153, 'Iron full helm', 'head'], [1115, 'Iron platebody', 'body'], [1081, 'Iron plateskirt', 'legs'], [1191, 'Iron kiteshield', 'shield']] as [number, string, string][])
    .map(([id, name, slot]) => ({ id, name, slot }));
  const gear = { equipment, inventory: [], coins: 5000, bankCoins: 0 };
  const all = JSON.parse(readFileSync(new URL('../src/data/steps.json', import.meta.url), 'utf8')) as { id: string; itemsRequired?: { nameEn: string }[] }[];
  const from = all.findIndex((x) => x.id === 'S4-03');
  const worn = new Set(equipment.map((e) => e.name));
  const asked = [...new Set(all.slice(from, from + 8).flatMap((x) => (x.itemsRequired ?? []).map((i) => i.nameEn)))];
  const owned = asked.map((name) => ({ name, carried: worn.has(name) ? 1 : 0, noted: 0, bank: 0 }));
  const COWS = 'The cow field east of Lumbridge';
  for (const width of [1440, 390]) {
    const { page, errors } = await open(browser, width, {
      progress: progressBefore('S4-03', { gameMode: 'f2p' }),
      localStorage: { 'osrs-put:active-step': 'S4-03' },
      status: {
        protocol: 6, inGame: true, player: 'Combat Test', activeStepId: 'S4-03', questPoints: 30, totalLevel: 150,
        stats: { attack: 30, strength: 21, defence: 1, hitpoints: 24 }, pos: { x: 3093, y: 3495, plane: 0 }, ...gear,
      },
      events: [
        { type: 'OWNED', bankSeen: true, items: owned }, { type: 'GEAR', gear }, { type: 'QUESTS', done: [] },
        { type: 'STATS', stats: { attack: 30, strength: 21, defence: 1, hitpoints: 24 } }, { type: 'XP', xp: { attack: 13363, strength: 2000, defence: 0, hitpoints: 3500 } },
      ],
      market: true,
    }, '#/step/S4-03');
    await page.waitForTimeout(1500);
    const posts = async () => page.evaluate(() => (window as unknown as { __posts: { path: string; body: any }[] }).__posts);
    const lastStep = async () => {
      const snaps = (await posts()).filter((p) => p.path === '/prep-plan');
      return snaps.length ? snaps[snaps.length - 1].body.step : undefined;
    };
    const savedPlans = async () => page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('osrs-put:combat-plans')).map(([, v]) => JSON.parse(v)));
    const verdict = await page.locator('.step-status .status-text').first().innerText().catch(() => '');
    if (/Not everything is checked/.test(verdict)) expect(await page.locator('.step-status .ready-ring').count() === 0, `combat route (${width} px): no percentage beside "Not everything is checked"`);
    // 2.69: nothing to press. The recommended plan is in effect, named in one line with one short reason.
    const line = await text(page, '.status-combat-route');
    expect(/Plan: Cows, then Hill Giant for the Big bones\./.test(line) && /Recommended for your levels and kit/.test(line), `combat route (${width} px): the recommended plan is in effect, said in one line`);
    expect(!/Another way|Use this plan/.test(await page.locator('body').innerText()), `combat route (${width} px): no "Default → better" switch to press`);
    const step = await lastStep();
    expect(step?.stepId === 'S4-03' && step.worldPoint?.label === COWS && step.npcNames?.[0] === 'Cow', `combat route (${width} px): the game is sent to the cows without a press`);
    expect(step?.goal === 'Cows: Attack 40', `combat route (${width} px): the game's plate says what the phase is for`);
    expect(step?.pacing?.actionName === 'cow|cows' && step.pacing.expPerAction === 32, `combat route (${width} px): the game's pace line counts cows`);
    const trigger = JSON.stringify(step?.completionTrigger ?? {});
    expect(trigger.includes('Big bones') && trigger.includes('"attack"'), `combat route (${width} px): the step still completes by the route's own trigger`);
    const page1 = await page.locator('body').innerText();
    expect(/Fight the cows on Accurate until Attack 40/.test(page1) && !/Climb down the trapdoor/.test(page1), `combat route (${width} px): one set of instructions on the page, the plan's`);
    const saved = await savedPlans();
    expect(saved.length === 1 && saved[0]['S4-03']?.key === 'split' && saved[0]['S4-03']?.by === 'auto' && Object.keys(saved[0]['S4-03']).sort().join() === 'at,by,key', `combat route (${width} px): the guide's own choice is remembered as such, nothing else`);
    const done = await page.evaluate(() => { const j = (window as unknown as { __saved?: string }).__saved; return j ? JSON.parse(j) : null; });
    expect(!done || !done.steps || done.steps['S4-03'] === undefined, `combat route (${width} px): the route step is still open`);
    if (process.env.UI_SHOTS) await page.locator('.status-combat-route').screenshot({ path: `${process.env.UI_SHOTS}/combat-route-line-${width}.png` }).catch(() => {});
    // "Why this plan?": the comparison, folded, and any plan can be chosen from it.
    await reveal(page, '.combat-route');
    const fold = page.locator('.combat-route details');
    expect(await fold.count() === 1 && !(await fold.evaluate((d) => (d as HTMLDetailsElement).open)), `combat route (${width} px): the comparison is folded under "Why this plan?"`);
    // The status line's link opens the comparison itself, not only the view it is in (2.72). The view opened above is closed first, as a player would.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.locator('.status-combat-route:visible').getByRole('button', { name: 'Why this plan?' }).first().click();
    await page.waitForTimeout(600);
    expect(await fold.evaluate((d) => (d as HTMLDetailsElement).open), `combat route (${width} px): the status line's "Why this plan?" opens the comparison itself`);
    const rows = await page.locator('.combat-plan-row').count();
    expect(rows >= 4, `combat route (${width} px): the comparison lists the plans (${rows})`);
    expect(/Compared: .*Cow/.test(await text(page, '.combat-route')), `combat route (${width} px): it says what was compared`);
    if (process.env.UI_SHOTS) await page.locator('.combat-route').screenshot({ path: `${process.env.UI_SHOTS}/combat-route-open-${width}.png` }).catch(() => {});
    // The player's own choice: the route as written. The arrow goes back to the giants, the choice is kept, and the better plan is offered.
    await page.locator('.combat-plan-row', { hasText: 'The route as written' }).getByRole('button', { name: 'Use this instead' }).click();
    await page.waitForTimeout(1500);
    const back = await lastStep();
    expect(back?.worldPoint?.label !== COWS && back?.npcNames?.[0] === 'Hill Giant', `combat route (${width} px): the route as written, chosen, brings the arrow back to the giants`);
    const mine = await text(page, '.status-combat-route');
    expect(/Your plan: The route as written/.test(mine) && /Looks better now: Cows, then Hill Giant/.test(mine), `combat route (${width} px): the player's choice is named and the better plan offered, not forced`);
    expect((await savedPlans())[0]['S4-03']?.by === 'player', `combat route (${width} px): the player's choice is saved as theirs`);
    // Any plan from the list, and a Defence plan says what the route gives later.
    if (!(await fold.evaluate((d) => (d as HTMLDetailsElement).open))) await page.locator('.combat-route details > summary').click();
    const d20 = page.locator('.combat-plan-row', { hasText: 'Defence 20 first' });
    expect(/S5-09 .Triumph at Oziach. gives 18,650 Defence XP/.test(await d20.innerText()), `combat route (${width} px): a Defence plan names the Defence the route gives later`);
    await d20.getByRole('button', { name: 'Use this instead' }).click();
    await page.waitForTimeout(1500);
    const dstep = await lastStep();
    expect(dstep?.worldPoint?.label === COWS && dstep.pacing?.skill === 'defence', `combat route (${width} px): a plan picked from the list leads the game (Defence on the cows)`);
    // Back to the recommendation.
    if (!(await fold.evaluate((d) => (d as HTMLDetailsElement).open))) await page.locator('.combat-route details > summary').click();
    await page.getByRole('button', { name: 'Follow the recommendation' }).click();
    await page.waitForTimeout(1500);
    const again = await lastStep();
    expect(again?.npcNames?.[0] === 'Cow' && again.pacing?.skill === 'attack' && (await savedPlans())[0]?.['S4-03']?.by === 'auto', `combat route (${width} px): "Follow the recommendation" hands the plan back to the guide`);
    expect(await noOverflow(page), `combat route (${width} px): no horizontal scroll`);
    expect(errors.length === 0, `combat route (${width} px): no console errors ${errors.join('; ')}`);
    await page.context().close();
  }
}

// The Gear page in its four states (2.68): one recommendation from what is owned, no worthwhile change, offline with the last known gear of
// the character, and offline with nothing known. At most one action; nothing empty is drawn.
async function gearScenarios(browser: Browser) {
  console.log('gear');
  const item = (id: number, name: string, slot: string) => ({ id, name, slot });
  const BRONZE = item(1321, 'Bronze scimitar', 'weapon');
  const RUNE = item(1333, 'Rune scimitar', 'weapon');
  const STRENGTH = item(1725, 'Amulet of strength', 'amulet');
  const live = (equipment: { id: number; name: string; slot: string }[], stats: Record<string, number>, coins: number, bank: { name: string; bank: number }[] = []) => {
    const gear = { equipment, inventory: [], coins, bankCoins: 0 };
    return {
      progress: progressBefore('S4-03'), localStorage: { 'osrs-put:active-step': 'S4-03' }, market: true,
      status: { protocol: 6, inGame: true, player: 'Gear Test', activeStepId: 'S4-03', ...gear, stats },
      events: [{ type: 'STATS', stats }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items: bank.map((b) => ({ name: b.name, carried: 0, noted: 0, bank: b.bank })) }],
    };
  };
  const shot = async (page: Page, name: string) => {
    if (process.env.UI_SHOTS) await page.locator('.gear-page').screenshot({ path: `${process.env.UI_SHOTS}/gear-${name}.png` }).catch(() => {});
  };
  for (const width of [1440, 390]) {
    // What is owned beats a purchase: the Mithril scimitar in the bank is the one recommendation, the rest folded.
    {
      const { page, errors } = await open(browser, width, live([BRONZE], { attack: 20, strength: 20, defence: 1, hitpoints: 25 }, 5000, [{ name: 'Mithril scimitar', bank: 1 }]), '#/gear');
      await page.waitForTimeout(1200);
      const head = await text(page, '.gear-page .page-head');
      const reco = await text(page, '.gear-reco');
      // The opponent of the plan in effect (2.69): for this character the guide selects the cows first, and Gear judges against them.
      expect(/For S4-03: (Cow|Hill Giant), attacks with crush/.test(head), `gear (${width} px): the context names the fight in the plan in effect and the style that hits`);
      expect(await page.locator('.gear-reco').count() === 1 && /Mithril scimitar/.test(reco) && /bank/i.test(reco), `gear (${width} px): one recommendation, to wear the scimitar from the bank`);
      expect(!/faster/.test(reco), `gear (${width} px): accuracy is not called speed`);
      expect(/Bronze scimitar/.test(await text(page, '.gear-now')), `gear (${width} px): what is worn now is shown`);
      expect(await page.locator('.gear-page .btn-primary').count() <= 1, `gear (${width} px): at most one primary button`);
      expect(await page.locator('details.gear-more[open]').count() === 0, `gear (${width} px): the other options, numbers and future unlocks are folded`);
      expect(await noOverflow(page), `gear (${width} px): no horizontal scroll`);
      expect(!errors.length, `gear (${width} px): no console errors ${errors.join('; ')}`);
      await shot(page, `reco-${width}`);
      await page.context().close();
    }
    // The best wearable weapon and amulet and no coins: said once, with the reason; no action.
    {
      const { page, errors } = await open(browser, width, live([RUNE, STRENGTH], { attack: 40, strength: 40, defence: 1, hitpoints: 40 }, 0), '#/gear');
      await page.waitForTimeout(1200);
      const reco = await text(page, '.gear-reco');
      expect(/No worthwhile change for this fight/.test(reco) && await page.locator('.gear-reco .btn').count() === 0, `gear none (${width} px): no worthwhile change, no button`);
      expect(reco.split('No worthwhile change').length === 2, `gear none (${width} px): said once`);
      expect(await noOverflow(page), `gear none (${width} px): no horizontal scroll`);
      expect(!errors.length, `gear none (${width} px): no console errors ${errors.join('; ')}`);
      await shot(page, `none-${width}`);
      await page.context().close();
    }
    // Offline with a snapshot: the last known gear of the character, with its time; no recommendation built on it.
    {
      const at = Date.now() - 3 * 3600_000;
      const snap = { byPlayer: { 'gear test': { at, player: 'Gear Test', gear: { equipment: [RUNE, STRENGTH], inventory: [], coins: 120, bankCoins: 4000 } } } };
      const { page, errors } = await open(browser, width, { offline: true, progress: progressBefore('S4-03'), localStorage: { 'osrs-put:active-step': 'S4-03', 'osrs-put:last-gear': JSON.stringify(snap) } }, '#/gear');
      await page.waitForTimeout(1200);
      const now = await text(page, '.gear-now');
      expect(/Last known/.test(now) && /Gear Test/.test(now) && /Rune scimitar/.test(now) && /Amulet of strength/.test(now), `gear offline (${width} px): the last known gear, named and timed`);
      expect(await page.locator('.gear-worn-list.is-stale').count() === 1, `gear offline (${width} px): the snapshot looks like one`);
      expect(await page.locator('.gear-reco').count() === 0 && await page.locator('.gear-connect').count() === 0, `gear offline (${width} px): no recommendation from old data, no second notice`);
      expect(await noOverflow(page), `gear offline (${width} px): no horizontal scroll`);
      expect(!errors.length, `gear offline (${width} px): no console errors ${errors.join('; ')}`);
      await shot(page, `offline-${width}`);
      await page.context().close();
    }
    // Offline with nothing known: one short card, no empty slots or panels.
    {
      const { page, errors } = await open(browser, width, { offline: true, progress: progressBefore('S4-03'), localStorage: { 'osrs-put:active-step': 'S4-03' } }, '#/gear');
      await page.waitForTimeout(1200);
      expect(/RuneLite is not connected/.test(await text(page, '.gear-connect')), `gear connect (${width} px): the connection card`);
      expect(await page.locator('.gear-now').count() === 0 && await page.locator('.gear-reco').count() === 0 && await page.locator('details.gear-more').count() === 0, `gear connect (${width} px): no empty panels around it`);
      expect(await noOverflow(page), `gear connect (${width} px): no horizontal scroll`);
      expect(!errors.length, `gear connect (${width} px): no console errors ${errors.join('; ')}`);
      await shot(page, `connect-${width}`);
      await page.context().close();
    }
  }
}

// The address is set explicitly: without --host the server on some machines (GitHub CI) listens on IPv6 ::1 only, and 127.0.0.1 does not answer.
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
try {
  let up = false;
  for (let i = 0; i < 150 && !up; i++) {
    up = await fetch(BASE).then((r) => r.ok).catch(() => false);
    if (!up) await new Promise((r) => setTimeout(r, 200));
  }
  if (!up) throw new Error(`The preview server did not come up on ${BASE} — run npm run build first`);
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    await run(browser);
  } finally {
    await browser.close();
  }
} finally {
  server.kill();
}
console.log(failures.length ? `\nTotal: ${failures.length} failed` : '\nTotal: everything passed');
process.exit(failures.length ? 1 : 0);

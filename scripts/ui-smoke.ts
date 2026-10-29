// Desktop-only QA: phone viewports retired by owner decision2026-10-28. Keep desktop sizes, themes and DPI coverage.
// npm run test:ui — a run of the interface in a real browser (Chromium through Playwright), as the player has it in the exe:
// the built page, a stub desktop app (window.osrsDesktop) and a stub RuneLite bridge. The network to the wiki
// is closed — it checks that everything works without it too. It needs a build (npm run build) and Chromium
// (npx playwright install chromium). These scenarios used to live outside the repository.

import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import { PICKAXES } from '../src/lib/toolTiers.ts';

const PORT = 4179;
const BASE = `http://127.0.0.1:${PORT}/`;
const steps = JSON.parse(readFileSync(new URL('../src/data/steps.json', import.meta.url), 'utf8')) as { id: string }[];

interface Mock {
  progress?: unknown;
  /** The native profile list, independent of a damaged browser list. */
  profileFile?: unknown;
  status?: Record<string, unknown>;
  events?: unknown[];
  localStorage?: Record<string, string>;
  /** The "Zen" mode (by default the tests turn "Inspector" on: all the step blocks are expanded, as it was checked before). */
  zen?: boolean;
  /** The exchange prices by item ID: they stand in for the prices.runescape.wiki reply (without them the network to the wiki is closed). */
  prices?: Record<number, number>;
  /** The exchange as captured on 2026-10-18 (tests/funding/fixtures), with its times moved to now: latest, hourly and the item reference. */
  market?: boolean;
  /** The item catalogue is available but market quotes are missing. */
  marketUnavailable?: boolean;
  /** Scenario-specific quotes added to the recorded market fixture. */
  marketQuotes?: Record<string, { id: number; price: number }>;
  marketAgeMinutes?: number;
  /** The plugin does not answer (RuneLite is not running). */
  offline?: boolean;
  /** A reachable bridge rejects the guide snapshot for its size. */
  oversizedSnapshot?: boolean;
  /** A physical file-save failure, independent of working browser storage. */
  fileWriteFailure?: boolean;
  profileWriteFailure?: boolean;
  /** Windows display scaling (1.25 = 125%): the device pixel ratio; the viewport width passed is then in CSS pixels. */
  scale?: number;
  theme?: 'light' | 'dark';
}

/** The progress: everything before the step is closed. */
function progressBefore(id: string, extra: Record<string, unknown> = {}) {
  const ids = steps.map((s) => s.id);
  const done = Object.fromEntries(ids.slice(0, ids.indexOf(id)).map((s) => [s, 'done']));
  return { version: 3, steps: done, levels: {}, notes: {}, updatedAt: '2026-09-27T10:00:00.000Z', gameMode: 'members', ...extra };
}

async function open(browser: Browser, width: number, mock: Mock, hash: string): Promise<{ page: Page; errors: string[] }> {
  const ctx = await browser.newContext({
    viewport: { width, height: mock.scale ? Math.round(1040 / mock.scale) : 900 }, colorScheme: mock.theme ?? 'dark',
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
    w.__fileWriteFailure = !!m.fileWriteFailure;
    w.__profileWriteFailure = !!m.profileWriteFailure;
    let progress = m.progress ? JSON.stringify(m.progress) : null;
    w.osrsDesktop = {
      getZoom: async () => ({ zoom: 1, autoZoom: false, effective: 1, alwaysOnTop: false }),
      setZoom() {}, setAlwaysOnTop() {}, onZoom: () => () => {},
      loadProgressFile: () => progress,
      loadProfilesFile: () => m.profileFile ? JSON.stringify(m.profileFile) : null,
      saveProfilesFile: (json: string) => { w.__savedProfiles = json; },
      saveProfilesFileChecked: (json: string) => {
        if (w.__profileWriteFailure) return { ok: false, error: 'ENOSPC' };
        w.__savedProfiles = json;
        return { ok: true, error: null };
      },
      saveProgressFile: (j: string) => { progress = j; w.__saved = j; },
      saveProgressFileChecked: async (j: string) => {
        if (w.__holdSave) return new Promise(resolve => { w.__releaseSave = () => resolve({ ok: false, error: 'ENOSPC' }); });
        if (w.__fileWriteFailure) return { ok: false, error: 'ENOSPC' };
        progress = j; w.__saved = j;
        return { ok: true, error: null };
      },
      dataDir: () => 'C:/OSRS', isPortable: () => true,
      runelite: { check: async () => ({ ok: true, problems: [], clientVersion: '1.12.39', credentials: true }), launch: async () => { w.__launched = ((w.__launched as number) ?? 0) + 1; return { ok: true, state: 'started' }; } },
      bridge: {
        request: async (method: string, path: string, body: unknown) => {
          posts.push({ method, path, body });
          if (m.offline) return { ok: false, status: 0, data: null };
          // __status: what a scenario changes in the plugin's answer after the page has loaded (the quest cursor moving on).
          if (path === '/status') {
            const reply = { ok: true, status: 200, data: { status: 'ok', inGame: true, activeStepId: null, shortestPath: true, ...(m.status ?? {}), ...((w.__status as Record<string, unknown>) ?? {}) } };
            if (w.__holdStatus) return new Promise(resolve => { w.__releaseStatus = () => resolve(reply); });
            return reply;
          }
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
    for (const [name, quote] of Object.entries(mock.marketQuotes ?? {})) rows[name] = {
      id: quote.id, limit: 100, high: quote.price, low: quote.price, avgHigh: quote.price, avgLow: quote.price, highVolume: 1000, lowVolume: 1000,
    };
    await page.route(/prices\.runescape\.wiki\/api\/v2\/osrs\/(latest|1h|mapping)/, (r) => {
      const kind = /\/osrs\/(latest|1h|mapping)/.exec(r.request().url())![1];
      const now = Math.floor(Date.now() / 1000);
      const age = (mock.marketAgeMinutes ?? 1.5) * 60;
      if (kind === 'mapping') return r.fulfill({ json: Object.entries(rows).map(([name, x]) => ({ id: x.id, name, limit: x.limit ?? undefined, members: false })) });
      if (kind === 'latest') return r.fulfill({ json: { data: mock.marketUnavailable ? {} : Object.fromEntries(Object.values(rows).map((x) => [x.id, { high: x.high, highTime: x.high === null ? null : now - age, low: x.low, lowTime: x.low === null ? null : now - age - 30 }])) } });
      return r.fulfill({ json: { timestamp: now, data: Object.fromEntries(Object.values(rows).map((x) => [x.id, { avgHighPrice: x.avgHigh, highPriceVolume: x.highVolume, avgLowPrice: x.avgLow, lowPriceVolume: x.lowVolume }])) } });
    });
  }
  await gotoServed(page, BASE + hash);
  await page.waitForTimeout(1200);
  return { page, errors };
}

// The address is set explicitly: without --host the server on some machines (GitHub CI) listens on IPv6 ::1 only, and 127.0.0.1 does not answer.
// On the release runner the preview server has twice died mid-run (every later page: ERR_CONNECTION_FAILED): open() starts it again once and says
// what the server printed, instead of failing every scenario after it.
let server: ReturnType<typeof spawn> | null = null;
let serverLog = '';
async function startServer() {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const keep = (b: Buffer) => { serverLog = (serverLog + b.toString()).slice(-4000); };
  server.stdout?.on('data', keep);
  server.stderr?.on('data', keep);
  let up = false;
  for (let i = 0; i < 150 && !up; i++) {
    up = await fetch(BASE).then((r) => r.ok).catch(() => false);
    if (!up) await new Promise((r) => setTimeout(r, 200));
  }
  if (!up) throw new Error(`The preview server did not come up on ${BASE} — run npm run build first`);
}
function stopServer() { server?.kill(); }
let restarts = 0;
async function gotoServed(page: Page, url: string) {
  try {
    await page.goto(url);
  } catch (e) {
    if (!/ERR_CONNECTION_(FAILED|REFUSED|RESET)/.test(String(e)) || restarts >= 2) throw e;
    restarts++;
    console.log(`  (the preview server stopped answering; restarting it. Its last output: ${serverLog.trim().slice(-600) || 'none'}; exit code ${server?.exitCode ?? 'running'})`);
    server?.kill();
    await startServer();
    await page.goto(url);
  }
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
  // The Ledger's step page: Steps, Preparation, Route & game, Details and Wiki are ribbons. The companion strip: Now, Bag, Route and More are tabs.
  const openers = [page.getByRole('tablist', { name: 'Step views' }).getByRole('tab'), page.getByRole('tablist', { name: 'Companion views' }).getByRole('tab')];
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
  // A button of the open ribbon; the last one is the one in front.
  const find = () => page.getByRole(role, { name }).last();
  if (await find().count()) return find();
  const openers = [page.getByRole('tablist', { name: 'Step views' }).getByRole('tab'), page.getByRole('tablist', { name: 'Companion views' }).getByRole('tab')];
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

async function f2pSkillsScenarios(browser: Browser) {
  for (const width of [1000, 1440]) {
    const { page, errors } = await open(browser, width, { zen: true, progress: progressBefore('S3-03', { gameMode: 'f2p', levels: { attack: 30, strength: 21, defence: 10 } }) }, '#/skills');
    const defence = page.locator('.skill-tile a[href="#/skills/ME/defence"]');
    expect(await defence.count() === 1, `Skills ${width}: Defence has one direct tile`);
    expect(await page.locator('.section-rail').count() === 0, `Skills ${width}: no duplicate skill menu`);
    expect(await page.locator('.f2p-skill-badge').count() === 15, `F2P ${width}: every free skill including passive Hitpoints has one marker`);
    expect((await defence.innerText()).includes('10 reached'), `F2P ${width}: a known reached checkpoint is marked`);
    expect((await page.locator('.skill-tile a[href="#/skills/CO/cooking"]').innerText()).includes('68'), `F2P ${width}: Cooking shows the verified wine checkpoint`);
    expect((await page.locator('.skill-tile a[href="#/skills/PR/prayer"]').innerText()).includes('Prefer members'), `F2P ${width}: Prayer does not demand a F2P grind`);
    expect(await noOverflow(page) && !errors.length, `F2P ${width}: compact markers have no overflow or console errors`);
    await page.screenshot({ path: `audit-temp/f2p-priorities-${width}.png` });
    await defence.click();
    await page.locator('.training').waitFor();
    expect((await text(page, 'h1')).includes('Defence'), `Skills ${width}: Defence opens directly`);
    expect(await page.locator('[aria-label="Training priority"] button').count() === 3, `Skills ${width}: three priorities`);
    expect(await page.locator('[aria-label="Training priority"] button[aria-pressed="true"]').innerText() === 'Balanced', `Skills ${width}: Balanced is default`);
    expect(await page.locator('.skill-detail details').count() === 0, `Skills ${width}: default view contains no disclosure stack`);
    expect((await text(page, '.f2p-skill-checkpoint')).includes('10 reached'), `F2P ${width}: the detail uses the same checkpoint as its tile`);
    expect(await page.locator('.training-analysis, .skill-level-editor, .skill-guide-roadmap').count() === 0, `Skills ${width}: supporting tools are absent from the default view`);
    for (const label of ['Money', 'XP', 'Balanced']) {
      await page.getByRole('group', { name: 'Training priority' }).getByRole('button', { name: label, exact: true }).click();
      expect(await page.locator('[aria-label="Training priority"] button[aria-pressed="true"]').innerText() === label, `Skills ${width}: ${label} priority remains directly available`);
    }
    await page.screenshot({ path: `audit-temp/skills-compact-${width}.png` });
    await page.getByRole('tab', { name: 'Plan', exact: true }).click();
    expect(await page.locator('.skill-guide-roadmap').count() === 1 && await noOverflow(page), `Skills ${width}: plan remains accessible without a disclosure`);
    expect((await page.locator('.skill-roadmap-head h2').innerText()).includes('Defence'), `Skills ${width}: plan keeps the chosen combat skill`);
    await page.getByRole('tab', { name: 'Calculator', exact: true }).click();
    expect(await page.locator('.calc').count() === 1, `Skills ${width}: calculator remains accessible`);
    await page.getByRole('tab', { name: 'Reference', exact: true }).click();
    expect((await text(page, '.f2p-skill-note')).includes('10 reached') && await page.locator('.skill-level-editor').count() === 1, `Skills ${width}: F2P evidence and level editing remain accessible`);
    await page.getByRole('tab', { name: 'Train', exact: true }).click();
    expect(await noOverflow(page) && !errors.length, `F2P ${width}: the direct skill guide stays usable`);
    await page.context().close();
  }

  {
    const { page, errors } = await open(browser, 1000, { theme: 'light', scale: 1.5, zen: true, progress: progressBefore('S3-03', { gameMode: 'f2p' }) }, '#/skills');
    expect(await page.locator('.f2p-skill-badge').count() === 15 && await noOverflow(page) && !errors.length, 'F2P desktop light theme and 150% scaling: every marker remains readable without horizontal scrolling');
    await page.context().close();
  }
  {
    const { page, errors } = await open(browser, 1280, { zen: true, theme: 'light', scale: 1.5,
      progress: progressBefore('S9-01', { gameMode: 'members', levels: Object.fromEntries(readdirSync(new URL('../src/data/skills/', import.meta.url)).filter(f => f.endsWith('.json')).map(f => [f.slice(0, -5), 30])) }) }, '#/skills');
    expect(await page.locator('.f2p-skill-badge').count() === 0, 'Members: F2P preparation markers do not clutter the overview');
    const links = await page.locator('.skill-tile a').evaluateAll(els => els.map(el => ({ href: el.getAttribute('href')!, name: el.querySelector('.skill-name')!.textContent! })));
    for (const { href, name } of links) {
      await page.evaluate(hash => { location.hash = hash; }, href);
      await page.locator('.skill-detail h1').filter({ hasText: name }).waitFor();
      expect(await page.getByRole('tab', { name: 'Train', exact: true }).getAttribute('aria-selected') === 'true'
        && await page.locator('.skill-detail details').count() === 0, `${href}: direct recommendation without disclosure clutter`);
      expect(await noOverflow(page) && !errors.length, `${href}: light desktop at 150% has no overflow or console errors`);
    }
    await page.evaluate(() => { location.hash = '#/skills/WC/woodcutting'; });
    await waitFor(page, '.training', 5000);
    await page.screenshot({ path: 'audit-temp/skills-compact-light-150.png' });
    await page.context().close();
  }
}

async function membersGatheringScenarios(browser: Browser) {
  for (const width of [1000, 1440]) {
    const levels = { woodcutting: 55, attack: 40 };
    const { page, errors } = await open(browser, width, {
      zen: true, progress: progressBefore('S9-01', { gameMode: 'members', levels }),
      localStorage: { 'osrs-put:features': JSON.stringify({ efficient: true }) },
      status: { protocol: 6, inGame: true, stats: levels, equipment: [], inventory: [{ id: 1359, name: 'Rune axe', count: 1 }], coins: 5000, bankCoins: 0 },
      events: [{ type: 'STATS', stats: levels }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Rune axe', carried: 1, noted: 0, bank: 0 }] }],
    }, '#/skills/WC/woodcutting');
    const card = await text(page, '.training-summary');
    expect(card.includes('Teak trees') && card.includes('Estimated for your setup') && !card.includes('93,000'), `Members gathering ${width}: ordinary chopping replaces the mixed tick-manipulation range`);
    expect(card.includes('Isle of Souls') && card.includes('Earnings not estimated') && await page.locator('.training-summary details').count() === 0, `Members gathering ${width}: one compact modelled location without invented bank income`);
    await page.getByRole('button', { name: 'Show in game', exact: true }).click();
    const targets = await page.evaluate(() => (window as unknown as { __posts: { path: string; body?: { label?: string; objectNames?: string[] } }[] }).__posts.filter(p => p.path === '/nav-target').map(p => p.body));
    expect(targets.some(t => t?.label === 'Isle of Souls' && t.objectNames?.includes('Teak tree')), `Members gathering ${width}: the arrow and scenery use the model's spot`);
    await page.getByRole('tab', { name: 'Plan', exact: true }).click();
    expect((await text(page, '.training-analysis')).includes('drops logs because its banking route is not modelled'), `Members gathering ${width}: the banking limitation is explicit`);
    expect(await noOverflow(page) && !errors.length, `Members gathering ${width}: no overflow or console errors`);
    await page.context().close();
  }
}

/** The Ledger frame (2.81.1): every spine link, HUD control, road control, ribbon and hotbar slot does what its label says. */
async function ledgerScenarios(browser: Browser) {
  console.log('Ledger frame');
  const titleOf = (id: string) => (steps as unknown as { id: string; title: string }[]).find((s) => s.id === id)!.title;
  const saved = (page: Page) => page.evaluate(() => (JSON.parse(localStorage.getItem('osrs-put:progress') ?? '{}').steps ?? {}) as Record<string, string>);
  // What reached RuneLite for a step: the snapshot (protocol 6), the active step or a navigation target that names it.
  const sent = (page: Page, id: string) => page.evaluate((id) => (window as unknown as { __posts: { path: string; body?: unknown }[] }).__posts.filter((p) => p.path !== '/status' && JSON.stringify(p.body ?? '').includes(`"${id}"`)).length, id);
  const navPosts = (page: Page) => page.evaluate(() => (window as unknown as { __posts: { path: string }[] }).__posts.filter((p) => p.path === '/nav-target').length);
  const { page, errors } = await open(browser, 1440, { progress: progressBefore('S2-09'), status: { protocol: 6, inGame: true, activeStepId: null } }, '#/step/S2-09');
  await page.waitForSelector('.la-hotbar', { timeout: 5000 });
  const title = () => page.locator('#step-view-title').innerText();
  const hud = page.locator('.la-hud');

  // The spine: six sections, each opens its own page under its own name.
  const spine = page.getByRole('navigation', { name: 'Sections' });
  expect(await spine.getByRole('link').count() === 6, 'ledger spine: six sections (Lore is not in the spine)');
  for (const [label, hash, h1] of [['Skills', '#/skills', 'Skills'], ['Journal', '#/journal', 'Journal'], ['Gear', '#/gear', 'Gear'], ['Shopping', '#/shopping', 'Shopping'], ['Money', '#/money', 'Money'], ['Journey', '#/', 'Path']]) {
    const link = spine.getByRole('link', { name: new RegExp(`^${label}$`, 'i') });
    await link.click();
    await page.waitForTimeout(400);
    const heads = (await page.locator('h1').allTextContents()).map((h) => h.trim().toLowerCase());
    expect(page.url().endsWith(hash) && heads.includes(h1.toLowerCase()) && await link.getAttribute('aria-current') === 'page', `ledger spine: ${label} opens the ${h1} page (${heads.join(' | ')})`);
  }
  await page.evaluate(() => { location.hash = '#/step/S2-09'; });
  await page.waitForTimeout(500);

  // The HUD.
  const mode = page.getByRole('group', { name: 'Game mode' });
  await mode.getByRole('button', { name: 'FREE' }).click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.documentElement.dataset.mode) === 'f2p' && await mode.getByRole('button', { name: 'FREE' }).getAttribute('aria-pressed') === 'true', 'ledger HUD: FREE switches to the free route');
  await mode.getByRole('button', { name: 'MEMBERS' }).click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.documentElement.dataset.mode) === 'members', 'ledger HUD: MEMBERS switches back');
  expect(await hud.getByRole('button', { name: /^(zen|inspect)/i }).count() === 0, 'ledger HUD: no Zen or Inspect buttons');
  await hud.getByRole('button', { name: 'Search' }).click();
  await page.waitForSelector('dialog.search-dialog[open]', { timeout: 3000 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  expect(await page.locator('dialog.search-dialog[open]').count() === 0, 'ledger HUD: Search opens the search and Escape closes it');
  await page.locator('#main').click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press('/');
  await page.waitForTimeout(300);
  expect(await page.locator('dialog.search-dialog[open]').count() === 1, 'ledger HUD: "/" opens the search');
  await page.keyboard.press('Escape');
  const pin = page.getByRole('button', { name: 'Always on top' });
  await pin.click();
  const pinned = await pin.getAttribute('aria-pressed');
  await pin.click();
  expect(pinned === 'true' && await pin.getAttribute('aria-pressed') === 'false', 'ledger title strip: the pin turns always-on-top on and off');
  await hud.getByRole('link', { name: 'Settings' }).click();
  await page.waitForTimeout(300);
  expect(page.url().endsWith('#/settings') && await page.getByRole('tablist', { name: 'Settings sections' }).count() === 1, 'ledger HUD: the slider button opens Settings');
  await hud.locator('a.la-stat').click();
  await page.waitForTimeout(300);
  expect(page.url().endsWith('#/') && await page.locator('.cockpit').count() === 1, 'ledger HUD: the quest-point ring opens the Path');
  await hud.getByRole('button', { name: /compact/i }).click();
  await page.waitForSelector('.strip', { timeout: 3000 });
  expect(await page.locator('.la-pg.la-l').isVisible() === false, 'ledger HUD: COMPACT shows the companion strip alone');
  await hud.getByRole('button', { name: /full workspace/i }).click();
  await page.waitForSelector('.cockpit', { timeout: 3000 });
  expect(await page.locator('.strip').count() === 0, 'ledger HUD: FULL WORKSPACE returns the book');
  await page.evaluate(() => { location.hash = '#/step/S2-09'; });
  await page.waitForTimeout(500);

  // The road: a complete chapter unrolls and folds back; a row opens its step; "To the current step" returns.
  const rows = () => page.locator('.la-rrow').count();
  const folded = await rows();
  await page.locator('.la-seal6').first().click();
  await page.waitForTimeout(300);
  const unrolled = await rows();
  expect(unrolled > folded && await page.locator('#rail-S1-01').count() === 1, `ledger road: Unroll shows a complete chapter's steps (${folded} -> ${unrolled})`);
  await page.locator('button.la-stagehead').first().click();
  await page.waitForTimeout(300);
  expect(await rows() === folded && await page.locator('#rail-S1-01').count() === 0, 'ledger road: the chapter heading folds it again');
  await page.locator('#rail-S2-10').click();
  await page.waitForTimeout(600);
  expect((await title()) === titleOf('S2-10') && await page.locator('#rail-S2-10[aria-current="step"]').count() === 1, 'ledger road: a row opens its step');
  await page.getByRole('button', { name: /to the current step/i }).click();
  await page.waitForTimeout(600);
  expect((await title()) === titleOf('S2-09'), 'ledger road: To the current step returns to it');

  // The ribbons: each one opens its own view; P, T and D too.
  for (const [name, id] of [['Preparation', 'prep'], ['Route & game', 'travel'], ['Details', 'details'], ['Steps', 'steps']]) {
    await page.getByRole('tab', { name, exact: true }).click();
    await page.waitForTimeout(250);
    expect(await page.locator(`#step-view-${id}[aria-selected="true"]`).count() === 1 && (await page.locator('#step-view-panel').innerText()).trim().length > 20, `ledger ribbons: ${name} opens its view`);
  }
  await page.getByRole('tab', { name: 'Wiki', exact: true }).click();
  await page.waitForTimeout(250);
  expect(await page.locator('#step-view-wiki-panel').isVisible() && await page.locator('#step-view-wiki[aria-selected="true"]').count() === 1, 'ledger ribbons: Wiki opens the dossier place');
  for (const [key, id] of [['p', 'prep'], ['t', 'travel'], ['d', 'details']]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(200);
    expect(await page.locator(`#step-view-${id}[aria-selected="true"]`).count() === 1, `ledger ribbons: ${key.toUpperCase()} opens ${id}`);
  }
  await page.getByRole('tab', { name: 'Steps', exact: true }).click();

  // The hotbar.
  const bar = page.getByRole('toolbar', { name: 'Step actions' });
  const slot = (name: RegExp) => bar.getByRole('button', { name });
  await slot(/next/i).click();
  await page.waitForTimeout(500);
  expect((await title()) === titleOf('S2-10'), 'ledger hotbar: NEXT opens the next step');
  await slot(/previous/i).click();
  await page.waitForTimeout(500);
  expect((await title()) === titleOf('S2-09'), 'ledger hotbar: PREVIOUS opens the step before');
  await page.keyboard.press('e');
  await page.waitForTimeout(500);
  const afterE = await title();
  await page.keyboard.press('q');
  await page.waitForTimeout(500);
  expect(afterE === titleOf('S2-10') && (await title()) === titleOf('S2-09'), 'ledger hotbar: E and Q move between steps');
  const fix = slot(/^f\s*(fix|preparation)$/i);
  const fixLabel = (await fix.innerText()).toLowerCase();
  const before = await navPosts(page);
  await fix.click();
  await page.waitForTimeout(500);
  expect(fixLabel.includes('preparation')
    ? await page.locator('#step-view-prep[aria-selected="true"]').count() === 1
    : (await navPosts(page)) > before || await page.locator('#step-view-prep[aria-selected="true"]').count() === 1,
  `ledger hotbar: ${fixLabel.replace(/\s+/g, ' ')} does what it says (opens Preparation, or leads to what is missing)`);
  let n = await sent(page, 'S2-09');
  await slot(/show in game/i).click();
  await page.waitForTimeout(600);
  expect((await sent(page, 'S2-09')) > n, 'ledger hotbar: SHOW IN GAME sends the step to RuneLite');
  await slot(/next/i).click();
  await page.waitForTimeout(600);
  n = await sent(page, 'S2-10');
  await slot(/start the step/i).click();
  await page.waitForTimeout(600);
  expect((await sent(page, 'S2-10')) > n, 'ledger hotbar: START THE STEP sends the step to RuneLite');
  await slot(/previous/i).click();
  await page.waitForTimeout(600);
  await slot(/world map/i).click();
  await page.waitForSelector('dialog.map-modal[open]', { timeout: 5000 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.getByRole('tab', { name: 'Steps', exact: true }).click();
  await page.getByRole('tab', { name: 'Route & game', exact: true }).click();
  await page.waitForTimeout(400);
  expect(await page.locator('dialog.map-modal[open]').count() === 0, 'ledger hotbar: the world map does not reopen by itself on the next visit');
  await page.keyboard.press('m');
  await page.waitForSelector('dialog.map-modal[open]', { timeout: 5000 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  expect(await page.locator('dialog.map-modal[open]').count() === 0, 'ledger hotbar: WORLD MAP and M open the map every time');
  expect(await slot(/skip step/i).isDisabled() && await slot(/remove mark/i).isDisabled(), 'ledger hotbar: Skip and Remove mark wait for an optional or a marked step');
  await bar.getByRole('button', { name: /^done$/i }).click();
  await page.waitForTimeout(600);
  expect((await saved(page))['S2-09'] === 'done' && (await title()) !== titleOf('S2-09'), 'ledger hotbar: DONE marks the step and opens the next one');
  await page.locator('#rail-S2-09').click();
  await page.waitForTimeout(600);
  await slot(/remove mark/i).click();
  await page.waitForTimeout(400);
  expect(!(await saved(page))['S2-09'], 'ledger hotbar: REMOVE MARK takes the mark back');
  await page.evaluate(() => { location.hash = '#/step/S3-05'; });
  await page.waitForTimeout(800);
  await slot(/skip step/i).click();
  await page.waitForTimeout(400);
  expect((await saved(page))['S3-05'] === 'skipped', 'ledger hotbar: SKIP STEP skips an optional step');
  await page.keyboard.press('u');
  await page.waitForTimeout(400);
  expect(!(await saved(page))['S3-05'], 'ledger hotbar: U removes the skip');

  // The other pages' own menus.
  await page.evaluate(() => { location.hash = '#/journal'; });
  await page.waitForTimeout(500);
  await page.getByRole('link', { name: /^session$/i }).click();
  await page.waitForTimeout(400);
  expect(page.url().endsWith('#/journal/session') && (await page.locator('.la-pg.la-r .journal-pane').innerText()).length > 20, 'ledger Journal: SESSION opens the session journal');
  await page.getByRole('link', { name: /^stage goals$/i }).click();
  await page.waitForTimeout(400);
  expect(page.url().endsWith('#/journal/goals'), 'ledger Journal: STAGE GOALS opens the goals');
  await page.evaluate(() => { location.hash = '#/reference'; });
  await page.waitForTimeout(500);
  const second = page.locator('.reference-index .nav-list a').nth(1);
  const topic = (await second.innerText()).trim();
  await second.click();
  await page.waitForTimeout(400);
  expect((await page.locator('.reference-article h1').innerText()).trim() === topic, `ledger Reference: an index link opens its article (${topic})`);
  await page.evaluate(() => { location.hash = '#/settings'; });
  await page.waitForTimeout(500);
  for (const tab of ['RuneLite', 'Progress and copies', 'App', 'Appearance']) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await page.waitForTimeout(250);
    expect(await page.getByRole('tab', { name: tab, exact: true }).getAttribute('aria-selected') === 'true' && (await page.locator('.settings-content').innerText()).length > 20, `ledger Settings: ${tab} opens its section`);
  }
  await page.evaluate(() => { location.hash = '#/skills'; });
  await page.waitForTimeout(500);
  await page.locator('.skills-index .skill-card-link[href*="/defence"]').click();
  await page.waitForTimeout(500);
  expect(page.url().includes('/defence') && (await page.locator('.skills-detail h1').innerText()).includes('Defence'), 'ledger Skills: a tile opens its skill on the right page');
  await page.evaluate(() => { location.hash = '#/shopping'; });
  await page.waitForTimeout(500);
  const scopes = page.getByRole('group', { name: 'What to prepare for' }).getByRole('button');
  for (let i = 0; i < await scopes.count(); i++) {
    await scopes.nth(i).click();
    await page.waitForTimeout(250);
    expect(await scopes.nth(i).getAttribute('aria-pressed') === 'true', `ledger Shopping: scope ${i + 1} is selectable`);
  }
  expect(await noOverflow(page) && !errors.length, `ledger: no overflow or console errors ${errors.join('; ')}`);
  await page.context().close();
}

async function run(browser: Browser) {
  if (process.env.UI_ONLY === 'ledger') { await ledgerScenarios(browser); return; }
  if (!process.env.UI_ONLY) await ledgerScenarios(browser);
  if (process.env.UI_ONLY === 'members-gathering') { await membersGatheringScenarios(browser); return; }
  if (!process.env.UI_ONLY) await membersGatheringScenarios(browser);
  if (process.env.UI_ONLY === 'f2p-skills') { await f2pSkillsScenarios(browser); return; }
  if (!process.env.UI_ONLY) await f2pSkillsScenarios(browser);
  if (process.env.UI_ONLY === 'skill-handover') { await skillHandoverScenarios(browser); return; }
  if (!process.env.UI_ONLY) await skillHandoverScenarios(browser);
  if (process.env.UI_ONLY === 'mining-handover') { await miningHandoverScenarios(browser); return; }
  if (!process.env.UI_ONLY) await miningHandoverScenarios(browser);
  if (process.env.UI_ONLY === 'ranged-preparation') { await rangedPreparationScenarios(browser); return; }
  if (!process.env.UI_ONLY) await rangedPreparationScenarios(browser);
  if (process.env.UI_ONLY === 'shopping-quotes') { await shoppingQuoteScenarios(browser); return; }
  if (!process.env.UI_ONLY) await shoppingQuoteScenarios(browser);
  if (process.env.UI_ONLY === 'journal-quotes') { await journalQuoteScenarios(browser); return; }
  if (!process.env.UI_ONLY) await journalQuoteScenarios(browser);
  if (process.env.UI_ONLY === 'dossier-quotes') { await dossierQuoteScenarios(browser); return; }
  if (!process.env.UI_ONLY) await dossierQuoteScenarios(browser);
  if (process.env.UI_ONLY === 'style-quotes') { await styleQuoteScenarios(browser); return; }
  if (!process.env.UI_ONLY) await styleQuoteScenarios(browser);
  if (process.env.UI_ONLY === 'armour') { await armourPreparationScenarios(browser); return; }
  if (!process.env.UI_ONLY) await armourPreparationScenarios(browser);
  if (process.env.UI_ONLY === 'market-preparation') { await marketPreparationScenarios(browser); return; }
  if (!process.env.UI_ONLY) await marketPreparationScenarios(browser);
  if (process.env.UI_ONLY === 'date-proof') { await dateFreeSettingsScenarios(browser); return; }
  if (!process.env.UI_ONLY) await dateFreeSettingsScenarios(browser);
  if (process.env.UI_ONLY === 'tool-proof') { await toolProofScenarios(browser); return; }
  if (!process.env.UI_ONLY) await toolProofScenarios(browser);
  if (process.env.UI_ONLY === 'sync-proof') { await accountSyncProofScenarios(browser); return; }
  if (!process.env.UI_ONLY) await accountSyncProofScenarios(browser);
  if (process.env.UI_ONLY === 'item-food') { await retainedCombatFoodScenario(browser); return; }
  if (process.env.UI_ONLY === 'magic-funding') { await magicFundingScenarios(browser); return; }
  if (process.env.UI_ONLY === 'magic-route') { await magicRouteScenarios(browser); return; }
  if (!process.env.UI_ONLY) await magicRouteScenarios(browser);
  if (process.env.UI_ONLY === 'consumer-dependencies') { await consumerDependencyScenarios(browser); return; }
  if (!process.env.UI_ONLY) await magicFundingScenarios(browser);
  if (process.env.UI_ONLY === 'stock-certainty') { await combatRouteScenarios(browser); return; }
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
  {
    const { page, errors } = await open(browser, 1280, { offline: true, fileWriteFailure: true, progress: progressBefore('S2-07'), zen: true }, '#/step/S2-07');
    expect((await text(page, '.progress-storage-warning')).includes('desktop file could not be written'), 'save failure: working browser storage does not hide a failed desktop write');
    await page.evaluate(() => { const w = window as unknown as Record<string, unknown>; w.__fileWriteFailure = false; w.__holdSave = true; });
    await page.getByRole('button', { name: /^(Done|Mark as done|Mark as manually completed)/ }).first().click();
    await page.waitForTimeout(200);
    await page.evaluate(() => { (window as unknown as Record<string, unknown>).__holdSave = false; });
    // A second edit has a newer successful acknowledgement than the first edit's delayed failure.
    await page.getByRole('button', { name: /^(Done|Mark as done|Mark as manually completed)/ }).first().click();
    await page.waitForTimeout(400);
    await page.evaluate(() => { ((window as unknown as { __releaseSave?: () => void }).__releaseSave)?.(); });
    await page.waitForTimeout(200);
    expect(await page.locator('.progress-storage-warning').count() === 0, 'save retry: an old delayed failure cannot overwrite the newer successful write');
    expect(await noOverflow(page) && !errors.length, 'save failure/retry: no overflow or console errors');
    await page.context().close();
  }
  {
    const damaged = '{"active":"alt","list":[null]}';
    const { page, errors } = await open(browser, 1280, {
      offline: true, localStorage: { 'osrs-put:profiles': damaged },
      profileFile: { active: 'main', list: [{ id: 'main', name: 'Main' }, { id: 'alt', name: 'Recovered alt', player: 'Alt tester' }] },
    }, '#/settings');
    await page.getByRole('tab', { name: 'Progress and copies', exact: true }).click();
    const names = await page.locator('.profile-list strong').allInnerTexts();
    expect(names.includes('Recovered alt'), 'profile recovery: a valid native alternate profile survives damaged browser rows');
    expect(await page.evaluate(() => (window as unknown as { __savedProfiles?: string }).__savedProfiles === undefined), 'profile recovery: reading the damaged source does not mirror a default over the native file');
    expect(await page.evaluate(() => localStorage.getItem('osrs-put:profiles:recovery')) === damaged, 'profile recovery: damaged browser rows are retained');
    expect(await noOverflow(page) && !errors.length, 'profile recovery: no overflow or console errors');
    await page.context().close();
  }
  for (const width of [1280]) {
    const profiles = { active: 'main', list: [{ id: 'main', name: 'Main', player: 'Profile test' }] };
    const { page, errors } = await open(browser, width, {
      profileFile: { version: 99, list: [] },
      localStorage: { 'osrs-put:profiles': JSON.stringify(profiles) },
      progress: progressBefore('S3-08', { levels: { attack: 30 } }),
      status: { protocol: 6, player: 'Profile test', stats: { attack: 99 } },
      events: [{ type: 'STATS', stats: { attack: 99 } }],
    }, '#/settings');
    expect(await page.locator('.profile-storage-warning').count() === 1, `profile protection (${width}): one actionable recovery warning`);
    await page.getByRole('tab', { name: 'Progress and copies', exact: true }).click();
    expect(await page.getByRole('textbox', { name: 'New profile name', exact: true }).isDisabled(), `profile protection (${width}): unsafe profile edits are disabled`);
    expect(await page.evaluate(() => (window as unknown as { __savedProfiles?: string }).__savedProfiles === undefined), `profile protection (${width}): the valid browser source does not overwrite the unknown native format`);
    expect(await page.evaluate(() => JSON.parse((window as unknown as { __saved?: string }).__saved ?? localStorage.getItem('osrs-put:progress') ?? '{}').levels?.attack !== 99), `profile protection (${width}): game levels are not imported into a protected profile`);
    expect(await noOverflow(page) && !errors.length, `profile protection (${width}): no overflow or console errors`);
    if (process.env.UI_ONLY === 'stabilization') await page.screenshot({ path: `audit-temp/profile-protected-${width}.png` });
    await page.context().close();
  }
  for (const width of [1280]) {
    const browserProfiles = { active: 'main', list: [{ id: 'main', name: 'Main', player: 'Profile test' }] };
    const nativeProfiles = { ...browserProfiles, list: [...browserProfiles.list, { id: 'alt', name: 'Native only', player: 'Other hero' }] };
    const { page, errors } = await open(browser, width, {
      profileFile: nativeProfiles,
      localStorage: { 'osrs-put:profiles': JSON.stringify(browserProfiles) },
      progress: progressBefore('S3-08', { levels: { attack: 30 } }),
      status: { protocol: 6, player: 'Profile test', stats: { attack: 99 } },
      events: [{ type: 'STATS', stats: { attack: 99 } }],
    }, '#/settings');
    expect(await page.locator('.profile-storage-warning').count() === 1 && (await text(page, '.profile-storage-warning')).includes('saved profile lists disagree'), `profile conflict (${width}): one warning explains the conflict between supported lists`);
    await page.getByRole('tab', { name: 'Progress and copies', exact: true }).click();
    expect(await page.getByRole('textbox', { name: 'New profile name', exact: true }).isDisabled(), `profile conflict (${width}): profile edits stay paused`);
    expect(await page.evaluate(() => (window as unknown as { __savedProfiles?: string }).__savedProfiles === undefined), `profile conflict (${width}): no supported list overwrites the other`);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:profiles:recovery:file')!).list.some((p: { id: string }) => p.id === 'alt')), `profile conflict (${width}): the native-only character is preserved`);
    expect(await page.evaluate(() => JSON.parse((window as unknown as { __saved?: string }).__saved ?? localStorage.getItem('osrs-put:progress') ?? '{}').levels?.attack !== 99), `profile conflict (${width}): game levels cannot write into an unresolved account`);
    expect(await noOverflow(page) && !errors.length, `profile conflict (${width}): no overflow or console errors`);
    if (process.env.UI_ONLY === 'stabilization') await page.screenshot({ path: `audit-temp/profile-conflict-${width}.png` });
    await page.context().close();
  }
  for (const width of [1280]) {
    const profiles = { active: 'main', list: [{ id: 'main', name: 'Main' }] };
    const { page, errors } = await open(browser, width, {
      offline: true, profileFile: profiles, profileWriteFailure: true,
      localStorage: { 'osrs-put:profiles': JSON.stringify(profiles) },
    }, '#/settings');
    await page.getByRole('tab', { name: 'Progress and copies', exact: true }).click();
    await page.getByRole('textbox', { name: 'New profile name', exact: true }).fill('Unsaved alt');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    expect(await page.locator('.profile-write-warning').count() === 1 && (await page.locator('.profile-list strong').allInnerTexts()).length === 1, `profile write (${width}): failed native create shows one warning without accepting or switching the profile`);
    expect(await page.getByRole('textbox', { name: 'New profile name', exact: true }).inputValue() === 'Unsaved alt', `profile write (${width}): failed creation retains the player's input`);
    await page.evaluate(() => { (window as unknown as Record<string, unknown>).__profileWriteFailure = false; });
    await page.getByRole('button', { name: 'Retry profile save', exact: true }).click();
    expect(await page.locator('.profile-write-warning').count() === 0 && (await page.locator('.profile-list strong').allInnerTexts()).includes('Unsaved alt'), `profile write (${width}): retry confirms and publishes the intended profile`);
    expect(await noOverflow(page) && !errors.length, `profile write (${width}): no overflow or console errors`);
    if (process.env.UI_ONLY === 'stabilization') await page.screenshot({ path: `audit-temp/profile-write-retry-${width}.png` });
    await page.context().close();
  }
  if (process.env.UI_ONLY === 'stabilization') return;
  for (const width of [1280]) {
    const equipment = [[1329, 'Mithril scimitar', 'weapon'], [1153, 'Iron full helm', 'head'], [1115, 'Iron platebody', 'body'], [1081, 'Iron plateskirt', 'legs'], [1191, 'Iron kiteshield', 'shield']]
      .map(([id, name, slot]) => ({ id, name, slot }));
    const stats = { attack: 22, strength: 16, defence: 1, hitpoints: 22 };
    const gear = { equipment, inventory: [{ id: 330, name: 'Salmon', count: 40, noted: true }], coins: 500, bankCoins: 3000 };
    const { page, errors } = await open(browser, width, {
      // The route's own plan, chosen: noted Salmon is what is tested here, not which spot needs the least food (2.75: the monks need none).
      zen: true, progress: progressBefore('S3-08'), localStorage: { 'osrs-put:active-step': 'S3-08', 'osrs-put:combat-plans:main:-': '{"S3-08":{"key":"route","at":1,"by":"player"}}' },
      status: { protocol: 6, ...gear, stats, activeStepId: 'S3-08' },
      events: [{ type: 'STATS', stats }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Salmon', carried: 0, noted: 40, bank: 0, exactCarried: 0, exactNoted: 40, exactBank: 0 }] }],
    }, '#/step/S3-08');
    await reveal(page, 'text=/Bank: unnote/i');
    await page.getByText(/Bank: unnote/i).first().waitFor({ timeout: 8000 });
    expect((await page.locator('main').innerText()).includes('Unnote at bank'), `notes (${width}): notes are an action, not ready-to-eat food`);
    expect(await page.evaluate(() => (window as unknown as { __posts: { path: string; body?: { plan?: { lines: { name: string; unnote?: number }[] } } }[] }).__posts.some((p) => p.path === '/prep-plan' && p.body?.plan?.lines.some((l) => l.name === 'Salmon' && (l.unnote ?? 0) > 0))), `notes (${width}): the actual game snapshot carries the unnote action`);
    expect(await noOverflow(page) && !errors.length, `notes (${width}): no overflow or console errors`);
    await page.evaluate(() => (window as unknown as { __emit: (e: unknown) => void }).__emit({ type: 'OWNED', bankSeen: true, items: [{ name: 'Salmon', carried: 26, noted: 14, bank: 0, exactCarried: 26, exactNoted: 14, exactBank: 0 }] }));
    await page.waitForTimeout(800);
    expect(!(await page.locator('main').innerText()).includes('Unnote at bank'), `notes (${width}): unnoting clears the action after the live ownership update`);
    await page.evaluate(() => (window as unknown as { __emit: (e: unknown) => void }).__emit({ type: 'OWNED', bankSeen: true, items: [{ name: 'Salmon', carried: 0, noted: 0 }] }));
    await page.waitForTimeout(800);
    const unreported = await page.evaluate(() => {
      const posts = (window as unknown as { __posts: { path: string; body?: { plan?: { lines: { name: string; where: string; action?: string }[] } } }[] }).__posts;
      return posts.filter(p => p.path === '/prep-plan').at(-1)?.body?.plan?.lines.find(l => l.name === 'Salmon');
    });
    expect(unreported?.where === 'UNKNOWN' && !/^(Buy|Withdraw) /i.test(unreported.action ?? ''), `bank quantity (${width}): an unreported bank count stays unknown in the game payload`);
    expect(await noOverflow(page) && !errors.length, `bank quantity (${width}): no overflow or console errors`);
    await page.context().close();
  }
  if (process.env.UI_ONLY === 'items') return;
  for (const width of [1280]) {
    const { page, errors } = await open(browser, width, {
      progress: progressBefore('S6-02', { gameMode: 'f2p', levels: { fishing: 45 } }),
      localStorage: { 'osrs-put:features': JSON.stringify({ efficient: true }) },
      status: { protocol: 6, stats: { fishing: 45 } }, events: [{ type: 'STATS', stats: { fishing: 45 } }],
    }, '#/skills/FI');
    await waitFor(page, '.training', 5000);
    const recommendation = await page.locator('.training-method .training-now').innerText();
    const content = await page.locator('.training').innerText();
    expect(recommendation.includes('fly fishing'), `skill bracket (${width}): an unlocked faster method remains selectable after its suggested range`);
    expect(/\bto 50\b/.test(content) && !content.includes('to level 40') && !/≈ 0 more/.test(content), `skill bracket (${width}): the card retains the future route goal without an expired action target`);
    expect(await noOverflow(page) && !errors.length, `skill bracket (${width}): no overflow or console errors`);
    await page.evaluate(() => { location.hash = '#/step/S6-02'; });
    await page.waitForTimeout(800);
    expect(!(await page.locator('.spot-switch').allTextContents()).join(' ').includes('Musa Point'), `method map (${width}): the current method does not offer a future climb spot`);
    await (await stepButton(page, '🧭 Show in the game')).first().click();
    await page.waitForTimeout(800);
    const target = await page.evaluate(() => {
      const posts = (window as unknown as { __posts: { path: string; body?: { step?: { worldPoint?: { x: number; y: number }; groundTiles?: { x: number; y: number }[] } } }[] }).__posts;
      return posts.filter(p => p.path === '/prep-plan').at(-1)?.body?.step;
    });
    // The gathering engine's spot (skilling.json): the wiki spawn tile of the Barbarian Village fly fishing spots, not the area's label point.
    const fly = (JSON.parse(readFileSync(new URL('../src/data/skilling.json', import.meta.url), 'utf8')) as { spots: { resource: string; label: string; place: { x: number; y: number } }[] }).spots
      .find((sp) => sp.resource === 'fly' && sp.label === 'Barbarian Village')!.place;
    expect(target?.worldPoint?.x === fly.x && target.worldPoint.y === fly.y && target.groundTiles?.length === 1 && target.groundTiles[0].y === fly.y, `method map (${width}): the actual game target and single ground tile agree on Barbarian Village`);
    expect(await noOverflow(page) && !errors.length, `method map (${width}): no overflow or console errors`);
    await page.context().close();
  }
  if (process.env.UI_ONLY === 'skills') return;
  {
    const stats = { crafting: 31, woodcutting: 36, magic: 13, hitpoints: 31, attack: 40, strength: 40, defence: 33 };
    const { page, errors } = await open(browser, 1280, {
      zen: true, progress: progressBefore('S9-01', { gameMode: 'members', levels: stats }),
      localStorage: { 'osrs-put:active-step': 'S9-01' }, status: { protocol: 6, inGame: true, player: 'Entrana Test', stats, activeStepId: 'S9-01', questInstruction: { stepId: 'S9-01', stageAt: 2, lineIndex: 0, peeking: false } },
      events: [{ type: 'STATS', stats }, { type: 'OWNED', bankSeen: true, items: [
        { name: 'Knife', carried: 1, noted: 0, bank: 0 }, { name: 'Bronze axe', carried: 0, noted: 0, bank: 1 },
        ...['Tuna', 'Trout', 'Salmon', 'Lobster'].map(name => ({ name, carried: 0, noted: 0, bank: name === 'Salmon' ? 5 : 0 })),
      ] }],
    }, '#/step/S9-01');
    await page.waitForFunction(() => (window as unknown as { __posts: { path: string; body?: { plan?: { stepId?: string } } }[] }).__posts
      .some(p => p.path === '/prep-plan' && p.body?.plan?.stepId === 'S9-01'), null, { timeout: 10000 });
    const plan = await page.evaluate(() => {
      const posts = (window as unknown as { __posts: { path: string; body?: { plan?: {
        lines: { name: string; timing: string; action?: string }[]; bankWithdrawals?: { itemName: string }[];
      } } }[] }).__posts;
      return posts.filter(p => p.path === '/prep-plan').at(-1)?.body?.plan;
    });
    expect(plan?.lines.find(l => l.name === 'Bronze axe')?.timing === 'IN_STEP', 'Entrana: the game snapshot keeps the dungeon axe as an acquired-during-quest item');
    expect(!plan?.bankWithdrawals?.some(l => l.itemName === 'Bronze axe'), 'Entrana: departure withdrawals do not tell the player to take the banked axe');
    expect(Boolean(plan?.bankWithdrawals?.some(l => l.itemName === 'Salmon')), 'Entrana: the confirmed entry sends the physical Salmon alternative to the game');
    await page.evaluate(() => {
      const w = window as unknown as { __status: unknown; __emit: (e: unknown) => void };
      w.__status = { questInstruction: { stepId: 'S9-01', stageAt: 2, lineIndex: 2, peeking: false } };
      w.__emit({ type: 'STATUS', inGame: true, player: 'Entrana Test' });
    });
    await page.waitForFunction(() => {
      const posts = (window as unknown as { __posts: { path: string; body?: { plan?: { stepId?: string; lines?: { name: string }[] } } }[] }).__posts;
      const plan = posts.filter(p => p.path === '/prep-plan').at(-1)?.body?.plan;
      return plan?.stepId === 'S9-01' && !plan.lines?.some(l => l.name === 'Tuna');
    }, null, { timeout: 10000 });
    expect(true, 'Entrana: after entry the guide stops demanding the entry food buffer');
    expect(await noOverflow(page) && !errors.length, 'Entrana: no overflow or console errors');
    await page.context().close();
  }
  if (process.env.UI_ONLY === 'entrana') return;
  {
    const { page, errors } = await open(browser, 1280, {
      zen: true, progress: progressBefore('S8-02'),
      status: { protocol: 6, questsDone: [], questPoints: 60 },
      events: [{ type: 'QUESTS', done: [] }],
    }, '#/step/S8-02');
    expect((await page.locator('.step-blocked').allInnerTexts()).some(t => t.includes('S8-01')), 'prerequisites: live unfinished quest overrides an old route done mark');
    await reveal(page, '.requires .step-ref[href="#/step/S8-01"]');
    expect(await page.locator('.requires .step-ref.is-met[href="#/step/S8-01"]').count() === 0, 'prerequisites: a contradicted done mark is not shown as met');
    await page.keyboard.press('Escape');
    await page.evaluate(() => (window as unknown as { __emit: (e: unknown) => void }).__emit({ type: 'QUESTS', done: ['Priest in Peril', 'The Restless Ghost'] }));
    await page.waitForTimeout(500);
    expect(await page.locator('.step-blocked').count() === 0, 'prerequisites: live completion clears the hard blocker without changing route marks');
    await reveal(page, '.requires .step-ref[href="#/step/S8-01"]');
    expect(await page.locator('.requires .step-ref.is-met[href="#/step/S8-01"]').count() === 1, 'prerequisites: the dependency label follows the same live proof as its blocker');
    await page.keyboard.press('Escape');
    expect(await noOverflow(page) && !errors.length, 'prerequisites: no overflow or page errors');
    await page.context().close();
  }
  for (const width of [1280]) {
    const progress = progressBefore('S7-05', { gameMode: 'members', levels: { agility: 24 } });
    progress.steps['S7-04'] = 'skipped';
    const { page, errors } = await open(browser, width, {
      progress, status: { protocol: 6, stats: { agility: 24 } }, events: [{ type: 'STATS', stats: { agility: 24 } }],
    }, '#/step/S7-05');
    await page.getByRole('tab', { name: 'Preparation', exact: true }).click(); // the readiness verdict is on the Preparation ribbon
    expect((await page.locator('main').innerText()).includes('First S7-04'), `skill dependency (${width}): skipping below the goal does not unlock the quest`);
    await reveal(page, '.requires .step-ref[href="#/step/S7-04"]');
    expect(await page.locator('.requires .step-ref.is-met[href="#/step/S7-04"]').count() === 0, `skill dependency (${width}): a skipped training step is not labelled met`);
    await page.keyboard.press('Escape');
    await page.evaluate(() => (window as unknown as { __emit: (e: unknown) => void }).__emit({ type: 'STATS', stats: { agility: 25 } }));
    await page.waitForTimeout(900);
    expect(!(await page.locator('main').innerText()).includes('First S7-04'), `skill dependency (${width}): reaching the actual level removes the redundant training blocker`);
    await reveal(page, '.requires .step-ref[href="#/step/S7-04"]');
    expect(await page.locator('.requires .step-ref.is-met[href="#/step/S7-04"]').count() === 1, `skill dependency (${width}): reached levels satisfy the displayed dependency without rewriting the skip`);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:progress') ?? '{}').steps?.['S7-04']) === 'skipped', `skill dependency (${width}): the original skip mark is preserved`);
    expect(await noOverflow(page) && !errors.length, `skill dependency (${width}): no overflow or console errors`);
    await page.context().close();
  }
  await consumerDependencyScenarios(browser);
  if (process.env.UI_ONLY === 'prerequisites') return;
  {
    const oldGear = { equipment: [{ id: 1329, name: 'Mithril scimitar', slot: 'weapon' }], inventory: [], coins: 100, bankCoins: 200 };
    const newGear = { ...oldGear, equipment: [{ id: 1331, name: 'Adamant scimitar', slot: 'weapon' }] };
    const { page, errors } = await open(browser, 1280, {
      zen: true, progress: progressBefore('S3-08'),
      status: { protocol: 6, player: 'Session Test', stats: { attack: 22, strength: 20, defence: 1 }, ...oldGear },
    }, '#/gear');
    await page.getByRole('region', { name: 'Worn now', exact: true }).waitFor();
    await page.evaluate((gear) => {
      const w = window as unknown as { __holdStatus: boolean; __emit: (e: unknown) => void };
      w.__holdStatus = true;
      w.__emit({ type: 'STATUS', inGame: true, player: 'Session Test' });
      w.__emit({ type: 'STATS', stats: { attack: 30, strength: 20, defence: 1 } });
      w.__emit({ type: 'GEAR', gear });
    }, newGear);
    await page.evaluate(() => (window as unknown as { __releaseStatus: () => void }).__releaseStatus());
    await page.waitForTimeout(700);
    expect((await page.getByRole('region', { name: 'Worn now', exact: true }).innerText()).includes('Adamant scimitar') && (await page.locator('.gear-context').innerText()).includes('Attack 30'), 'session: a delayed status cannot overwrite newer gear or skill events');
    await page.evaluate(() => {
      const w = window as unknown as { __emit: (e: unknown) => void; __status: unknown; __releaseStatus: () => void; __releaseOldStatus: () => void };
      w.__emit({ type: 'STATUS', inGame: true, player: 'Session Test' });
      w.__releaseOldStatus = w.__releaseStatus;
      w.__status = { inGame: false, player: null };
      w.__emit({ type: 'STATUS', inGame: false, player: 'Session Test' });
      w.__emit({ type: 'GEAR', gear: { equipment: [{ id: 1331, name: 'Adamant scimitar', slot: 'weapon' }], inventory: [], coins: 999 } });
    });
    await page.waitForTimeout(500);
    expect(await page.getByRole('region', { name: 'Worn now', exact: true }).count() === 0 && (await page.locator('.gear-page').innerText()).includes('Waiting for your character'), 'session: logout with SSE open clears live equipment and ignores post-logout gear');
    await page.evaluate(() => (window as unknown as { __releaseOldStatus: () => void }).__releaseOldStatus());
    await page.waitForTimeout(400);
    expect(await page.getByRole('region', { name: 'Worn now', exact: true }).count() === 0, 'session: an old in-game reply cannot restore a logged-out character');
    await page.evaluate((gear) => {
      const w = window as unknown as { __emit: (e: unknown) => void };
      w.__emit({ type: 'STATUS', inGame: true, player: 'Other Hero' });
      w.__emit({ type: 'STATS', stats: { attack: 99, strength: 99, defence: 99 } });
      w.__emit({ type: 'GEAR', gear });
      w.__emit({ type: 'STEP_AUTO_COMPLETED', stepId: 'S3-08' });
    }, newGear);
    await page.waitForTimeout(600);
    expect(await page.getByRole('region', { name: 'Worn now', exact: true }).count() === 0, 'session: another character is not presented as the active profile live loadout');
    expect(await page.evaluate(() => {
      const p = JSON.parse((window as unknown as { __saved: string }).__saved);
      return p.levels.attack !== 99 && p.steps['S3-08'] !== 'done';
    }), 'session: same-batch stats and auto-completion from a different character cannot overwrite this profile');
    expect(await noOverflow(page) && !errors.length, 'session: async changes do not crash or overflow the interface');
    await page.context().close();
  }
  if (process.env.UI_ONLY === 'session') return;
  {
    const p = progressBefore('S2-07');
    p.steps['S2-06'] = 'skipped';
    const gear = { equipment: [], inventory: [{ id: 290, name: 'Research package', count: 1 }], coins: 100, bankCoins: 0 };
    const { page, errors } = await open(browser, 1280, {
      progress: p, status: { protocol: 6, player: 'Reserve Test', questsDone: [], accountType: 'normal', ...gear },
      events: [{ type: 'GEAR', gear }, { type: 'QUESTS', done: [] }], market: true,
    }, '#/shopping');
    await page.locator('.shop-cleanup > summary').click();
    const row = page.locator('.cleanup-row').filter({ hasText: 'Research package' });
    await row.waitFor();
    expect(await row.locator('.act-review').count() === 1 && await row.locator('.act-drop').count() === 0, 'cleanup: skipping a quest cannot authorize destruction of its quest item');
    await page.evaluate(() => (window as unknown as { __emit: (e: unknown) => void }).__emit({ type: 'QUESTS', done: ['Rune Mysteries'] }));
    await page.waitForTimeout(600);
    expect(await row.locator('.act-drop').count() === 1 && (await row.innerText()).includes('Destroy'), 'cleanup: verified game completion can release the obsolete item');
    expect(await noOverflow(page) && !errors.length, 'cleanup reserves: no overflow or console errors');
    await page.context().close();
  }
  if (process.env.UI_ONLY === 'reserves') return;
  {
    const id = 'S7-01';
    const gear = { equipment: [], inventory: [{ id: 294, name: "Glarial's pebble", count: 1 }], coins: 1000, bankCoins: 0 };
    const { page, errors } = await open(browser, 1280, {
      progress: progressBefore(id), localStorage: { 'osrs-put:active-step': id },
      status: { protocol: 6, inGame: true, activeStepId: id, player: 'Phase Test', ...gear, questInstruction: { stepId: id, stageAt: 3, lineIndex: 4, peeking: false } },
      events: [{ type: 'GEAR', ...gear }, { type: 'OWNED', bankSeen: true, items: ['Rope', 'Air rune', 'Earth rune', 'Water rune', "Glarial's pebble"].map(name => ({ name, carried: name.includes('pebble') ? 1 : 0, noted: 0, bank: 0 })) }],
    }, '#/step/S7-01');
    await page.getByRole('tab', { name: 'Preparation', exact: true }).click();
    expect((await text(page, '.loadout.is-current')).includes("Glarial's Tomb"), 'phase: confirmed tomb cursor selects the tomb inventory');
    const timing = () => page.evaluate(() => {
      const posts = (window as unknown as { __posts: { path: string; body: any }[] }).__posts.filter(p => p.path === '/prep-plan');
      const plan = posts.at(-1)?.body?.plan;
      return plan?.lines?.find((l: { name: string }) => l.name === 'Air rune')?.timing ?? (plan?.later?.some((l: string) => l.includes('Air rune')) ? 'LATER' : undefined);
    });
    await page.waitForTimeout(800);
    expect(await timing() === 'LATER', 'phase: rune supplies are sent to the game as later, not required inside the tomb');
    const move = async (peeking: boolean) => {
      await page.evaluate(({ id, peeking }) => {
        const w = window as unknown as { __status: unknown; __emit: (e: unknown) => void };
        w.__status = { questInstruction: { stepId: id, stageAt: 3, lineIndex: 7, peeking } };
        w.__emit({ type: 'STATUS', inGame: true, player: 'Phase Test' });
      }, { id, peeking });
      await page.waitForTimeout(1200);
    };
    await move(true);
    expect((await text(page, '.loadout.is-current')).includes("Glarial's Tomb") && await timing() === 'LATER', 'phase: manually viewing the future dungeon does not change current preparation');
    await move(false);
    expect((await text(page, '.loadout.is-current')).includes('Waterfall dungeon') && await timing() === 'NOW', 'phase: a confirmed within-stage transition makes the rune supply current in the app and game payload');
    await page.evaluate(() => {
      const w = window as unknown as { __status: unknown; __emit: (e: unknown) => void };
      w.__status = { questInstruction: null };
      w.__emit({ type: 'STATUS', inGame: true, player: 'Phase Test' });
    });
    await page.waitForTimeout(1200);
    expect(await page.locator('.loadout.is-current').count() === 0, 'phase: an authoritative cleared cursor removes the confirmed phase badge');
    expect(await noOverflow(page) && !errors.length, 'phase: no overflow or console errors');
    await page.context().close();
  }
  if (process.env.UI_ONLY === 'phase') return;
  if (process.env.UI_ONLY === 'funding') { await fundingScenarios(browser); return; }
  if (process.env.UI_ONLY === 'combat') { await combatRouteScenarios(browser); await xpOnlyCombatScenario(browser); await retainedCombatFoodScenario(browser); return; }
  if (process.env.UI_ONLY === 'shopping') { await shoppingScenarios(browser); return; }
  if (process.env.UI_ONLY === 'gear') { await gearScenarios(browser); return; }
  if (process.env.UI_ONLY === 'money') { await moneyScenarios(browser); return; }
  for (const width of [1100]) {
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
      expect(await page.getByRole('tablist', { name: 'Step views' }).getByRole('tab').count() === 5, 'Zen: the step views are five ribbons: Steps, Preparation, Route & game, Details, Wiki');
      await page.getByRole('tablist', { name: 'Step views' }).getByRole('tab', { name: /Preparation/i }).click();
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
      const btn = off.page.locator('.la-hud .launch-runelite');
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
      expect(await on.page.locator('.la-hud .launch-runelite').count() === 0, `header (${width} px): no launch button once the plugin is connected`);
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

    // Explicitly choose the written Minotaur route to retain its food/variant coverage.
    // Automatic trainer selection is exercised separately in combatRouteScenarios.
    {
      const equipment = [[1329, 'Mithril scimitar', 'weapon'], [1153, 'Iron full helm', 'head'], [1115, 'Iron platebody', 'body'], [1081, 'Iron plateskirt', 'legs'], [1191, 'Iron kiteshield', 'shield']]
        .map(([id, name, slot]) => ({ id, name, slot }));
      const gear = { equipment, inventory: [], coins: 500, bankCoins: 3000 };
      const stats = { attack: 22, strength: 16, defence: 1, hitpoints: 22 };
      const xp = { attack: 5624, strength: 2746, defence: 0, hitpoints: 2400 };
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S3-08'),
        localStorage: { 'osrs-put:active-step': 'S3-08', 'osrs-put:combat-plans:main:-': '{"S3-08":{"key":"route","at":1,"by":"player"}}' },
        status: { protocol: 5, ...gear, stats, xp, activeStepId: 'S3-08' },
        events: [{ type: 'STATS', stats }, { type: 'XP', xp }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items: [
          { name: 'Salmon', carried: 0, noted: 0, bank: 13 },
          ...['Trout', 'Tuna', 'Lobster', 'Swordfish'].map(name => ({ name, carried: 0, noted: 0, bank: 0 })),
        ] }],
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
        localStorage: { 'osrs-put:active-step': 'S3-08', 'osrs-put:combat-plans:main:-': '{"S3-08":{"key":"route","at":1,"by":"player"}}' },
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
      await zen.page.getByRole('tablist', { name: 'Step views' }).getByRole('tab', { name: /Preparation/i }).click();
      await zen.page.waitForTimeout(300);
      if (process.env.UI_SHOTS) await zen.page.screenshot({ path: `${process.env.UI_SHOTS}/zen-s308-prep-${width}.png`, fullPage: true }).catch(() => {});
      const prep = await zen.page.locator('body').innerText();
      expect(prep.includes('Salmon ×26') && !prep.includes('Salmon ×110'), 'food plan (Zen): Preparation asks for one bag (26), not the whole goal');
      // The readiness verdict (2.62.0): the status, the bank first (13 Salmon owned), then what to buy; both Minotaur versions; the weapon judged.
      const verdict = await text(zen.page, '.readiness-verdict');
      expect(verdict.includes('Preparation needed') && verdict.includes('Bank: withdraw 13 Salmon') && verdict.includes('Then buy about 13 Salmon'),
        `readiness (Zen): the next action names the bank and the purchase (${verdict.replace(/\s+/g, ' ').slice(0, 200)})`);
      expect(verdict.includes('Minotaur (level 12) suits your current kit best') && verdict.includes('Minotaur (level 27):'), 'readiness (Zen): both Minotaur versions are compared');
      // Preparation opens on its ribbon: its own card is the one in the step view's panel.
      await zen.page.locator('#step-view-panel .readiness-verdict summary').first().click();
      const why = await text(zen.page, '#step-view-panel .readiness-verdict');
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

    // 2.42/2.70: the leveling roadmap is in the skill's Training guide (2.74.13: in place, not a drawer from the Skills page), the priority changes the path,
    // "Follow this plan" pins the skill to the Path card and
    // "Back to the quest route" stops it. A group's label covers its steps (no "Levels 30–40" over "Lvl 30 → 60").
    {
      const { page, errors } = await open(browser, width, { progress: progressBefore('S9-01') }, '#/skills');
      await page.locator('.skill-tile a').first().click();
      expect(await page.getByRole('tab', { name: 'Train', exact: true }).getAttribute('aria-selected') === 'true', 'roadmap: the skill opens on its compact recommendation');
      await page.getByRole('tab', { name: 'Plan', exact: true }).click();
      await waitFor(page, '.skill-guide-roadmap .skill-timeline', 5000);
      expect(await page.getByRole('tab', { name: 'Plan', exact: true }).getAttribute('aria-selected') === 'true', 'roadmap: the full plan has its own view');
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
      await ok.page.getByRole('tab', { name: 'Reference', exact: true }).click();
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
      expect(t.includes('Only a completed sale') && t.includes('runes you already own are not deducted') && !t.includes('twice as fast'), 'S2-04: comparison assumptions are explicit and future hides are not coins');
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
        // The surface token where the select stands: the Ledger's pages define their own (parchment).
        el.parentElement!.appendChild(probe);
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
  for (const width of [1280]) {
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
    expect(await page.locator('.la-dock .dock-panel').count() === 0, 'dossier: nothing pinned by default');
    await page.getByRole('tablist', { name: 'Step views' }).getByRole('tab', { name: /Details/i }).click();
    await page.locator('.npc-name').first().click();
    await page.waitForSelector('dialog.drawer[open]', { timeout: 5000 });
    expect(await page.getByRole('button', { name: 'Pin to the side' }).count() === 1, 'dossier: the drawer offers to pin it');
    await page.getByRole('button', { name: 'Pin to the side' }).click();
    await page.waitForSelector('.la-dock .dock-panel', { timeout: 5000 });
    expect(await page.locator('dialog.drawer[open][aria-label="OSRS Wiki inspector"]').count() === 0, 'dossier: pinning closes the drawer and keeps the dossier on its ribbon');
    await page.reload();
    await page.waitForTimeout(1500);
    await page.getByRole('tablist', { name: 'Step views' }).getByRole('tab', { name: /Wiki/i }).click();
    const dock = await text(page, '.la-dock');
    expect(await page.locator('.la-dock .dock-panel').count() === 1, 'dossier: the pin is remembered after a reload');
    expect(/your current target/i.test(dock) && dock.includes('Keli') && !dock.includes('Click an item or NPC'), 'dossier: pinned with nothing chosen it shows the target NPC instead of an empty hint');
    if (process.env.UI_SHOTS) await page.screenshot({ path: `${process.env.UI_SHOTS}/cockpit-1280.png` }).catch(() => {});
    await page.getByRole('button', { name: 'Unpin from the side' }).click();
    await page.waitForTimeout(300);
    expect(await page.locator('.la-dock .dock-panel').count() === 0, 'dossier: unpinning returns the on-demand drawer');
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
    // On the step page the action keeps a readable measure (not squeezed into a sliver) and stays within four lines.
    expect(!!actionBox && actionBox.width >= 420 && actionBox.height < 180,'modern Path: the main action has readable desktop width');
    expect(await page.locator('#step-view-panel .overview').isVisible(),'cockpit: the walkthrough is open without a click');
    expect((await text(page,'.overview')).includes('In the game now'),'current instruction: the canonical walkthrough identifies the confirmed line');
    expect(/checked|Ready to set off/.test(await text(page,'.la-plaque .status-line')) && !(await text(page,'.la-plaque .status-line')).includes('Missing'),'cockpit: the verdict follows the stage too');
    await page.keyboard.press('p');
    await page.waitForTimeout(300);
    expect(await page.locator('#step-view-prep[aria-selected="true"]').count() === 1 && await page.locator('#step-view-panel .quest-preparation').count() === 1 && await page.locator('#step-view-panel .one-trip').count() === 1,'cockpit: P opens the Preparation ribbon with the stage list and the whole plan');
    const need = await text(page,'#step-view-panel .quest-preparation');
    // The last fight asks for a pickaxe and food; the meat, bread, knife and beer of stage 15 are used up and folded away.
    expect(need.includes('Needed for this stage') && need.includes('Used earlier in this quest') && need.includes('Bronze pickaxe') && !need.includes('Missing')
      && !need.includes('Cooked meat') && !need.includes('Bread') && !need.includes('Knife') && !need.includes('Beer'),'cockpit: the quest items the stage no longer asks for are folded away, not listed as missing');
    expect(await page.locator('.manual-complete').isVisible(),'cockpit: manual completion stays accessible');
    await page.keyboard.press('t');
    await page.waitForTimeout(300);
    expect(await page.locator('#step-view-travel[aria-selected="true"]').count() === 1,'cockpit: T opens the Route & game ribbon');
    await page.keyboard.press('Escape');
    expect(errors.length === 0 && await noOverflow(page),'modern Path: no runtime errors or horizontal overflow');
    await page.context().close();
  }

  // The companion strip (compact view): four tabs of the same step, the same stage-aware list, Done and Skip, a way back to the full workspace.
  {
    const questData = JSON.parse(readFileSync(new URL('../src/data/questStages.json', import.meta.url),'utf8')).quests['S3-04'];
    const stage = questData.stages.find((s: {do: {t:string;k?:string}[]}) => s.do.some(l => l.k === 'defeatGuardian'));
    const lineIndex = stage.do.findIndex((l: {t:string;k?:string}) => l.k === 'defeatGuardian');
    const {page, errors} = await open(browser, 1000, {
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
  for (const scale of [1, 1.5]) for (const width of [900, 1280, 1920]) {
    const { page } = await open(browser, width, {progress:progressBefore('S3-03'),localStorage:{'osrs-put:text-scale':String(scale)}}, '#/');
    expect(await noOverflow(page), `the header at ${width} px and ${scale*100}% text without horizontal scrolling`);
    if (width >= 1000) expect(await page.locator('.la-spine').evaluate(el => el.scrollWidth <= el.clientWidth), `spine at ${width} px and ${scale*100}% text without internal horizontal scrolling`);
    if (width >= 1000) expect(await page.evaluate(() => [...document.querySelectorAll('.la-spine a')].length === 6
      && [...document.querySelectorAll('.la-spine a')].every((a) => a.getBoundingClientRect().bottom <= innerHeight + 1)), `spine at ${width} px and ${scale*100}% text: all six sections are on screen`);
    await page.context().close();
  }

  // The local strip of a section shows every link: the first one used to take the whole width and push the rest out of view.
  console.log('Section strip');
  // Shopping (2.67) and Gear (2.68) have no strip: one short page each.
  for (const [hash, least, links] of [['#/journal', 2, '.journal-views a'], ['#/reference', 3, '.reference-index .nav-list a']] as [string, number, string][]) {
    for (const width of [1000, 1440]) {
      const { page } = await open(browser, width, { progress: progressBefore('S3-03') }, hash);
      const seen = await page.evaluate((links) => {
        const nav = document.querySelector(links)?.closest('.la-pg');
        if (!nav) return -1;
        const box = nav.getBoundingClientRect();
        return [...nav.querySelectorAll(links)].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.left >= box.left - 1 && r.right <= box.right + 1;
        }).length;
      }, links);
      expect(seen >= least, `section strip ${hash} at ${width} px: ${seen} links in view (at least ${least})`);
      await page.context().close();
    }
  }

  await f2pSkillsScenarios(browser);

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
  for (const width of [1440]) {
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
  await xpOnlyCombatScenario(browser);
  await retainedCombatFoodScenario(browser);
  await shoppingScenarios(browser);
  await gearScenarios(browser);
  await moneyScenarios(browser);
}

// Raising coins for training: a character with no coins and an empty bank is short of food. The card says so in one line with one button;
// Start sets an arrow and a status line, Cancel takes both away and the route step is untouched.
async function fundingScenarios(browser: Browser) {
  console.log('funding');
  const equipment = ([[1331, 'Adamant scimitar', 'weapon'], [1153, 'Iron full helm', 'head'], [1115, 'Iron platebody', 'body'], [1081, 'Iron plateskirt', 'legs'], [1191, 'Iron kiteshield', 'shield']] as [number, string, string][])
    .map(([id, name, slot]) => ({ id, name, slot }));
  const gear = { equipment, inventory: [], coins: 0, bankCoins: 0 };
  // The plugin reports every item the route asks about, zero included; what is worn counts as carried.
  const all = JSON.parse(readFileSync(new URL('../src/data/steps.json', import.meta.url), 'utf8')) as { id: string; itemsRequired?: { nameEn: string; anyOf?: string[] }[] }[];
  const from = all.findIndex((x) => x.id === 'S4-03');
  const worn = new Set(equipment.map((e) => e.name));
  const asked = [...new Set(all.slice(from, from + 8).flatMap((x) => (x.itemsRequired ?? []).flatMap((i) => [i.nameEn, ...(i.anyOf ?? [])])))];
  const owned = asked.map((name) => ({ name, carried: worn.has(name) ? 1 : 0, noted: 0, bank: 0 }));
  for (const width of [1440]) {
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
    expect(/Your coins: 0 gp/.test(await text(page, '.funding-card')), `funding (${width} px): the details state the coins`);
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
    expect((await text(page, '.status-funding')).includes(String(sentPlan?.action ?? '\u0000')), `funding (${width} px): the app and the game say the same sentence`);
    expect(await page.locator('.funding-card.is-running').count() === 1, `funding (${width} px): the card shows the step in hand`);
    const saved = await page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('osrs-put:funding-plan')).map(([, v]) => JSON.parse(v)));
    expect(saved.length === 1 && saved[0].sourceStepId === 'S4-03' && saved[0].character === 'Funding Test', `funding (${width} px): the plan is saved for this character`);
    if (process.env.UI_SHOTS) await page.locator('.funding-card').screenshot({ path: `${process.env.UI_SHOTS}/funding-running-${width}.png` }).catch(() => {});
    await page.locator('.funding-card.is-running').getByRole('button', { name: 'Cancel', exact: true }).click();
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
  const all = JSON.parse(readFileSync(new URL('../src/data/steps.json', import.meta.url), 'utf8')) as { id: string; itemsRequired?: { nameEn: string; anyOf?: string[] }[] }[];
  const from = all.findIndex((x) => x.id === 'S4-03');
  const worn = new Set(equipment.map((e) => e.name));
  const asked = [...new Set(all.slice(from, from + 8).flatMap((x) => (x.itemsRequired ?? []).flatMap((i) => [i.nameEn, ...(i.anyOf ?? [])])))];
  const stats = { attack: 30, strength: 21, defence: 1, hitpoints: 24 };
  const hero = (o: { bankSeen?: boolean; offline?: boolean; coins?: number } = {}): Mock => {
    const gear = { equipment, inventory: [], coins: o.coins ?? 400, bankCoins: o.bankSeen === false ? null : 0 };
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

  for (const width of [1440]) {
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
    expect(/Ranked by the time to make [\d,]+ more coins/.test(await page.locator('.money-context').innerText()), `money (${width} px): an already funded step does not invent a shortfall`);
    const rows = page.locator('.money-row');
    expect(await rows.count() >= 3 && await rows.count() <= 6, `money (${width} px): a compact list, ${await rows.count()} rows before "Show more"`);
    expect(await page.locator('.money-row .money-details').count() === 0, `money (${width} px): the details are folded`);
    const facts = await page.locator('.money-row-facts').allInnerTexts();
    expect(facts.every((t) => /gp\/h net|Estimate unavailable/.test(t) && /gp to start|No coins needed/.test(t)), `money (${width} px): every row says net an hour (or "Estimate unavailable") and the coins to start`);
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
    expect(await goal.count() === 1 && /more coins/.test(await goal.innerText()) && !/S4-03 is short/.test(await goal.innerText()), `money (${width} px): Start offers a savings goal without a fake step shortfall`);
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
    const { page, errors } = await open(browser, 1440, hero({ coins: 0 }), '#/step/S4-03');
    await reveal(page, '.one-trip');
    await page.waitForTimeout(1500);
    const card = (await page.locator('.funding-card .funding-line').first().innerText()).trim();
    expect(await page.locator('.funding-card a.funding-browse[href="#/money"]').count() === 1, 'money: the coin card links to "Browse earning methods"');
    await page.locator('.funding-card a.funding-browse').click();
    await page.waitForTimeout(1500);
    const best = (await page.locator('.money-reco-head strong').innerText()).trim();
    expect(card === best, `money: the coin card and the Money section recommend the same method (${card} / ${best})`);
    await page.locator('.money-reco').getByRole('button', { name: 'Start…' }).click();
    expect(/Cover the [\d,]+ gp S4-03 is short/.test(await page.locator('.money-reco .money-goal').innerText()), 'money: the zero-coin account still gets its real step-shortfall goal');
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
  const requirements = (JSON.parse(readFileSync(new URL('../src/data/steps.json', import.meta.url), 'utf8')) as { id: string; itemsRequired?: { anyOf?: string[] }[] }[])
    .find(step => step.id === 'S3-08')!.itemsRequired ?? [];
  const absentAlternatives = [...new Set(requirements.flatMap(item => item.anyOf ?? []))].map(name => ({ name, carried: 0, noted: 0, bank: 0 }));
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
  for (const width of [1440]) {
    // Real shortages: the purchases, the money short, the way to the coin plan, the exchange list.
    {
      const { page, errors } = await open(browser, width, base({ items: [...absentAlternatives, { name: 'Mithril scimitar', carried: 0, noted: 0, bank: 0 }, { name: 'Salmon', carried: 0, noted: 0, bank: 5 }] }), '#/shopping');
      await page.waitForTimeout(1200);
      const body = await text(page, '.shop-page');
      expect(/Buy (at the Grand Exchange|in shops) · [12]/.test(body) && /Salmon[^]*×15/.test(body) && /5 more in the bank/.test(body), `shopping (${width} px): the buy list with the bank stock named`);
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
      expect(/Take from the bank · 1/.test(body) && /Take 20 from the bank/.test(body) && !/Buy (at the Grand Exchange|in shops) · /.test(body), `shopping bank (${width} px): a withdrawal, not a purchase`);
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
  const all = JSON.parse(readFileSync(new URL('../src/data/steps.json', import.meta.url), 'utf8')) as { id: string; itemsRequired?: { nameEn: string; anyOf?: string[] }[] }[];
  const from = all.findIndex((x) => x.id === 'S4-03');
  const worn = new Set(equipment.map((e) => e.name));
  const asked = [...new Set(all.slice(from, from + 8).flatMap((x) => (x.itemsRequired ?? []).flatMap((i) => [i.nameEn, ...(i.anyOf ?? [])])))];
  const owned = asked.map((name) => ({ name, carried: worn.has(name) ? 1 : 0, noted: 0, bank: 0 }));
  const COWS = 'The cow field east of Lumbridge';
  for (const width of [1440]) {
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
    expect(!/Another way|Use this plan/.test(await page.locator('body').innerText()), `combat route (${width} px): no manual optimization switch`);
    const step = await lastStep();
    expect(step?.stepId === 'S4-03' && step.pacing?.targetExp > 0, `combat route (${width} px): the recommended training reaches the bridge`);
    expect(!step?.completionTrigger?.items?.length && step?.completionTrigger?.levels?.[0]?.level === 40, `combat route (${width} px): Attack 40 alone, no forced bone quota`);
    expect(!/Collect 50 Big bones/.test(await page.locator('body').innerText()), `combat route (${width} px): removed collection cannot return`);
    const saved = await savedPlans();
    expect(saved.length <= 1 && (!saved.length || saved[0]['S4-03']?.by === 'auto'), `combat route (${width} px): the guide chooses automatically`);
    const done = await page.evaluate(() => { const j = (window as unknown as { __saved?: string }).__saved; return j ? JSON.parse(j) : null; });
    expect(!done || !done.steps || done.steps['S4-03'] === undefined, `combat route (${width} px): the route step is still open`);
    if (process.env.UI_SHOTS) await page.locator('.status-combat-route').screenshot({ path: `${process.env.UI_SHOTS}/combat-route-line-${width}.png` }).catch(() => {});
    // "Why this plan?": the comparison, folded, and any plan can be chosen from it.
    await reveal(page, '.combat-route');
    const fold = page.locator('.combat-route details');
    expect(await fold.count() === 1 && !(await fold.evaluate((d) => (d as HTMLDetailsElement).open)), `combat route (${width} px): the comparison is folded under "Why this plan?"`);
    // 2.75: the status line always says where and why ("go here, because"), the route's own plan too, whenever other plans were compared.
    expect(await page.locator('.status-combat-route:visible').count() > 0, `combat route (${width} px): the status line names the plan and why`);
    // The status line's link opens the comparison itself, not only the view it is in (2.72). The view opened above is closed first, as a player would.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.locator('.status-combat-route:visible').getByRole('button', { name: 'Why this plan?' }).first().click();
    await page.waitForTimeout(600);
    expect(await fold.evaluate((d) => (d as HTMLDetailsElement).open), `combat route (${width} px): the status line's "Why this plan?" opens the comparison itself`);
    // A few rows, not a table of everything: the plan in use, the best, the route's own and the next best; the rest is one line.
    const rows = await page.locator('.combat-plan-row').count();
    const all = await text(page, '.combat-route');
    expect(rows >= 3 && rows <= 4 && await page.locator('.combat-plan-row', { hasText: '(the route)' }).count() === 1 && !/Defence 10 first/.test(all),
      `combat route (${width} px): three or four rows with the route's own; the common Defence 10 preparation is not a plan of its own (${rows})`);
    expect(!/Big bones bank quantity is not checked/.test(all), `combat route (${width} px): an unreported item quantity is disclosed even when the bank was opened`);
    const verdictText = await text(page, '.combat-verdict');
    expect(/Not priced/.test(all) && verdictText.trim().length > 0, `combat route (${width} px): unchecked armour stays unpriced and the recommendation still explains its tradeoff`);
    expect(/Also compared: .*(Cows|Monks|Barbarians)/.test(all), `combat route (${width} px): it says what else was compared`);
    expect(await page.locator('.combat-plan-row.is-now .cpr-figs').count() === 1, `combat route (${width} px): the plan in use has its time, food and coins`);
    const netFigures = await page.locator('.combat-plan-row .cpr-figs > span:last-child').allTextContents();
    expect(netFigures.length === rows && netFigures.every(t => /gp net$|^Not priced$/.test(t.trim())), `combat route (${width} px): every comparison shows net proceeds or an unknown cost, never gross loot`);
    if (process.env.UI_SHOTS) await page.locator('.combat-route').screenshot({ path: `${process.env.UI_SHOTS}/combat-route-open-${width}.png` }).catch(() => {});
    // A trainer choice cannot bypass common preparation: Defence 10 still comes before the armour and Attack phase.
    const other = page.locator('.combat-plan-row:not(.is-now)', { has: page.getByRole('button', { name: 'Use' }) }).first();
    const otherName = await other.locator('.cpr-name').innerText();
    await other.getByRole('button', { name: 'Use' }).click();
    await page.waitForTimeout(1500);
    const back = await lastStep();
    expect(back?.npcNames?.[0] === 'Cow' && back?.pacing?.skill === 'defence' && back?.pacing?.targetLevel === 10 && back?.worldPoint?.plane === 0,
      `combat route (${width} px): another plan keeps the Defence 10 preparation on surface cows first (${otherName})`);
    const mine = await text(page, '.status-combat-route');
    expect(/Your plan: /.test(mine), `combat route (${width} px): the player's choice is named as theirs`);
    expect((await savedPlans())[0]['S4-03']?.by === 'player', `combat route (${width} px): the player's choice is saved as theirs`);
    // Any plan from the list, and a Defence plan says what the route gives later.
    if (!(await fold.evaluate((d) => (d as HTMLDetailsElement).open))) await page.locator('.combat-route details > summary').click();
    const d20 = page.locator('.combat-plan-row', { hasText: 'Defence 20 first' });
    if (await d20.count()) {
      await d20.getByRole('button', { name: 'Use' }).click();
      await page.waitForTimeout(1500);
      if (!(await fold.evaluate((d) => (d as HTMLDetailsElement).open))) await page.locator('.combat-route details > summary').click();
      // Its note is shown once it is the plan in use: what the route gives later.
      expect(/S5-09 .Triumph at Oziach. gives 18,650 Defence XP/.test(await page.locator('.combat-plan-row.is-now').innerText()), `combat route (${width} px): a Defence plan names the Defence the route gives later`);
      const dstep = await lastStep();
      expect(dstep?.worldPoint?.label === COWS && dstep.pacing?.skill === 'defence', `combat route (${width} px): a plan picked from the list leads the game (Defence on the cows)`);
    } else expect(/Defence 20 first/.test(await text(page, '.combat-route')), `combat route (${width} px): Defence 20 first is compared`);
    // Back to the recommendation.
    if (!(await fold.evaluate((d) => (d as HTMLDetailsElement).open))) await page.locator('.combat-route details > summary').click();
    await page.getByRole('button', { name: 'Follow the recommendation' }).click();
    await page.waitForTimeout(1500);
    const again = await lastStep();
    expect(!again?.completionTrigger?.items?.length && (await savedPlans())[0]?.['S4-03']?.by !== 'player', `combat route (${width} px): "Follow the recommendation" hands the plan back to the guide`);
    await page.evaluate(items => {
      const emit = (window as unknown as { __emit: (e: unknown) => void }).__emit;
      emit({ type: 'XP', xp: { attack: 20363, strength: 2000, defence: 0, hitpoints: 3500 } });
      emit({ type: 'OWNED', bankSeen: true, items: [...items.filter(i => i.name !== 'Big bones'), { name: 'Big bones', carried: 0, noted: 0, bank: 50 }] });
    }, owned);
    await page.waitForTimeout(1500);
    const trained = await lastStep();
    expect(trained?.pacing?.targetExp > 0 && !trained?.completionTrigger?.items?.length, `combat route (${width} px): observed banked bones move to remaining XP without recollecting them`);
    expect(await noOverflow(page), `combat route (${width} px): no horizontal scroll`);
    expect(errors.length === 0, `combat route (${width} px): no console errors ${errors.join('; ')}`);
    await page.context().close();
  }
}

// An XP-only step must also adopt the better trainer without a manual mode switch.
async function retainedCombatFoodScenario(browser: Browser) {
  const equipment = ([[1331, 'Adamant scimitar', 'weapon'], [1153, 'Iron full helm', 'head'], [1115, 'Iron platebody', 'body'], [1081, 'Iron plateskirt', 'legs'], [1191, 'Iron kiteshield', 'shield']] as [number, string, string][])
    .map(([id, name, slot]) => ({ id, name, slot }));
  const gear = { equipment, inventory: [], coins: 5000, bankCoins: 0 };
  const stats = { attack: 30, strength: 21, defence: 1, hitpoints: 24 };
  const xp = { attack: 13363, strength: 5018, defence: 0, hitpoints: 7842 };
  const items = ['Salmon', 'Trout', 'Tuna', 'Lobster', 'Swordfish', 'Big bones'].map(name => ({ name, carried: 0, noted: 0, bank: 0 }));
  for (const width of [1280]) {
    const { page, errors } = await open(browser, width, {
      progress: progressBefore('S4-03', { gameMode: 'f2p', levels: stats }),
      localStorage: { 'osrs-put:active-step': 'S4-03', 'osrs-put:features': JSON.stringify({ keepDefenceOne: true }) },
      status: { protocol: 6, inGame: true, activeStepId: 'S4-03', ...gear, stats, xp },
      events: [{ type: 'STATS', stats }, { type: 'XP', xp }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items }],
    }, '#/step/S4-03');
    await page.waitForTimeout(1200);
    await reveal(page, '.combat-plan');
    const body = await page.locator('.combat-plan').allInnerTexts();
    expect(body.some(t => t.includes('whole goal')), `retained combat (${width}): food remains budgeted for fifty kills after Attack 40`);
    const snapshot = await page.evaluate(() => {
      const posts = (window as unknown as { __posts: { path: string; body?: { step?: { completionTrigger?: { levels?: { skill: string; level: number }[]; items?: { count: number }[] } }; plan?: { lines: { name: string; need: number }[] } } }[] }).__posts;
      return posts.filter(p => p.path === '/prep-plan').at(-1)?.body;
    });
    expect((snapshot?.plan?.lines.find(l => l.name === 'Salmon')?.need ?? 0) > 25, `retained combat (${width}): the game receives the personal carried-food requirement`);
    expect(snapshot?.step?.completionTrigger?.levels?.[0]?.level === 40 && !snapshot.step.completionTrigger.items?.length, `retained combat (${width}): completion stays Attack 40 and fifty bones`);
    await page.evaluate(nextItems => (window as unknown as { __emit: (e: unknown) => void }).__emit({ type: 'OWNED', bankSeen: true, items: nextItems }), items.filter(i => i.name !== 'Lobster').map(i => i.name === 'Salmon' ? { ...i, bank: 13 } : i));
    await page.waitForTimeout(800);
    const partialFood = await page.locator('.combat-plan').innerText();
    expect(partialFood.includes('Confirmed food: 13 Salmon') && partialFood.includes('check the remaining quantities') && !partialFood.includes('buy about'), `retained combat (${width}): incomplete food counts show confirmed stock without an invented purchase or bag location`);
    if (process.env.UI_SHOTS) await page.locator('.combat-plan').screenshot({ path: `${process.env.UI_SHOTS}/food-unknown-${width}.png` });
    await page.evaluate(nextItems => (window as unknown as { __emit: (e: unknown) => void }).__emit({ type: 'OWNED', bankSeen: true, items: nextItems }), items.map(i => i.name === 'Big bones' ? { ...i, bank: 30 } : i));
    await page.waitForTimeout(1000);
    expect((await page.locator('.combat-plan').allInnerTexts()).some(t => t.includes('whole goal') && !t.includes('20 kills')), `retained combat (${width}): the live stock update reduces collection to twenty kills`);
    expect(await noOverflow(page) && !errors.length, `retained combat (${width}): no overflow or console errors`);
    await page.context().close();
  }
}

async function xpOnlyCombatScenario(browser: Browser) {
  const stats = { attack: 22, strength: 16, defence: 1, hitpoints: 22 };
  const xp = { attack: 5624, strength: 2746, defence: 0, hitpoints: 2400 };
  const gear = { equipment: [
    { id: 1329, name: 'Mithril scimitar', slot: 'weapon' }, { id: 1153, name: 'Iron full helm', slot: 'head' },
    { id: 1115, name: 'Iron platebody', slot: 'body' }, { id: 1081, name: 'Iron plateskirt', slot: 'legs' }, { id: 1191, name: 'Iron kiteshield', slot: 'shield' },
  ], inventory: [], coins: 3500, bankCoins: 0 };
  const { page, errors } = await open(browser, 1280, {
    progress: progressBefore('S3-08', { gameMode: 'f2p' }), localStorage: { 'osrs-put:active-step': 'S3-08' }, market: true,
    status: { protocol: 6, player: 'XP Test', activeStepId: 'S3-08', ...gear, stats, xp },
    events: [{ type: 'XP', xp }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Salmon', carried: 0, noted: 0, bank: 13 }] }],
  }, '#/step/S3-08');
  await page.waitForTimeout(1500);
  const snapshots = await page.evaluate(() => (window as unknown as { __posts: { path: string; body: any }[] }).__posts.filter(p => p.path === '/prep-plan'));
  const step = snapshots.at(-1)?.body?.step;
  // Whichever spot wins (2.75 compares every spot of the registry), the line names it and the game gets its NPC.
  const trainers = (JSON.parse(readFileSync(new URL('../src/data/trainers.json', import.meta.url), 'utf8')) as { trainers: { name: string; foe: string }[] }).trainers;
  const named = /Plan: Train on ([^.]+)\./.exec(await text(page, '.status-combat-route'))?.[1];
  const spot = trainers.find((t) => t.name === named);
  expect(!!spot && step?.npcNames?.[0] === spot.foe, `XP-only training: the default trainer is adopted in the app and game payload (${named})`);
  expect(step?.pacing?.skill === 'strength' && step?.pacing?.targetExp === 4470 && JSON.stringify(step?.completionTrigger).includes('"attack"'), 'XP-only training: training order and the original combined completion goals are retained');
  expect(await noOverflow(page) && !errors.length, 'XP-only training: no overflow or console errors');
  await page.context().close();
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
  for (const width of [1440]) {
    // What is owned beats a purchase: the Mithril scimitar in the bank is the one recommendation, the rest folded.
    {
      const { page, errors } = await open(browser, width, live([BRONZE], { attack: 20, strength: 20, defence: 1, hitpoints: 25 }, 5000, [{ name: 'Mithril scimitar', bank: 1 }]), '#/gear');
      await page.waitForTimeout(1200);
      const head = await text(page, '.gear-page .page-head');
      const reco = await text(page, '.gear-reco');
      // The opponent of the plan in effect (2.69): for this character the guide selects the cows first, and Gear judges against them.
      expect(/For S4-03: (Cow|Hill Giant|Giant frog), attacks with crush/.test(head), `gear (${width} px): the context names the fight in the plan in effect and the style that hits`);
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
    // Offline with a snapshot: keep the character and stale-state disclosure, without rendering its internal timestamp.
    {
      const at = Date.now() - 3 * 3600_000;
      const snap = { byPlayer: { 'gear test': { at, player: 'Gear Test', gear: { equipment: [RUNE, STRENGTH], inventory: [], coins: 120, bankCoins: 4000 } } } };
      const { page, errors } = await open(browser, width, { offline: true, progress: progressBefore('S4-03'), localStorage: { 'osrs-put:active-step': 'S4-03', 'osrs-put:last-gear': JSON.stringify(snap) } }, '#/gear');
      await page.waitForTimeout(1200);
      const now = await text(page, '.gear-now');
      expect(/Last known/.test(now) && /Gear Test/.test(now) && /Rune scimitar/.test(now) && /Amulet of strength/.test(now), `gear offline (${width} px): the last known gear is named`);
      expect(!/\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(now), `gear offline (${width} px): the snapshot date is not rendered`);
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

async function consumerDependencyScenarios(browser: Browser) {
  for (const width of [1280]) {
    const stats = { crafting: 30, woodcutting: 36, ranged: 1, slayer: 1, cooking: 1 };
    const progress = progressBefore('S9-01', { gameMode: 'members', levels: stats });
    progress.steps['S8-04'] = 'skipped';
    const { page, errors } = await open(browser, width, {
      progress, localStorage: { 'osrs-put:active-step': 'S9-01' },
      status: { protocol: 6, inGame: true, stats }, events: [{ type: 'STATS', stats }],
    }, '#/step/S9-01');
    await page.getByRole('tab', { name: 'Preparation', exact: true }).click(); // the readiness verdict is on the Preparation ribbon
    expect((await page.locator('main').innerText()).includes('First S8-04'), `consumer skills (${width}): a missing actual entry skill retains the blocker`);
    await page.evaluate(next => (window as unknown as { __emit: (e: unknown) => void }).__emit({ type: 'STATS', stats: next }), { ...stats, crafting: 31 });
    await page.waitForTimeout(900);
    expect(!(await page.locator('main').innerText()).includes('First S8-04'), `consumer skills (${width}): reached Lost City skills do not demand unrelated Ranged/Slayer/Cooking`);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:progress') ?? '{}').steps?.['S8-04']) === 'skipped', `consumer skills (${width}): the producer remains skipped, not completed`);
    expect(await noOverflow(page) && !errors.length, `consumer skills (${width}): no overflow or console errors`);
    await page.context().close();
  }
}

async function magicRouteScenarios(browser: Browser) {
  for (const width of [1280]) {
    const names = ['Mind rune', 'Air rune', 'Water rune', 'Earth rune', 'Fire rune', 'Nature rune', 'Iron ore', 'Staff of air', 'Staff of water', 'Staff of earth', 'Staff of fire', 'Trout', 'Salmon', 'Tuna', 'Lobster', 'Swordfish'];
    const stock = (counts: Record<string, number>) => names.map(name => ({ name, carried: counts[name] ?? 0, noted: 0, bank: 0 }));
    const stats = { magic: 1, smithing: 15 };
    const gear = { equipment: [], inventory: [], coins: 0, bankCoins: 0 };
    const { page, errors } = await open(browser, width, {
      market: true, progress: progressBefore('S6-04', { gameMode: 'f2p', levels: stats }),
      localStorage: { 'osrs-put:active-step': 'S6-04' },
      status: { protocol: 6, inGame: true, activeStepId: 'S6-04', player: 'Magic Supplies', stats, ...gear },
      events: [{ type: 'STATS', stats }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items: stock({}) }],
    }, '#/step/S6-04');
    const snapshot = () => page.evaluate(() => (window as unknown as { __posts: { path: string; body: any }[] }).__posts.filter(p => p.path === '/prep-plan').at(-1)?.body);
    const initial = await snapshot();
    expect(initial?.step?.checklist?.some((r: any) => r.name === 'Mind rune' && r.count === 100) && !initial.step.checklist.some((r: any) => r.name === 'Nature rune'), `magic (${width}): a beginner gets actual Strike inputs instead of a nature-only placeholder`);
    const nextStats = { magic: 43, smithing: 15 };
    await page.evaluate(({ stats, items }) => { const w = window as unknown as { __status: Record<string, unknown>; __emit: (e: unknown) => void }; w.__status = { ...w.__status, stats }; w.__emit({ type: 'STATS', stats }); w.__emit({ type: 'OWNED', bankSeen: true, items }); }, { stats: nextStats, items: stock({ 'Nature rune': 25, 'Iron ore': 25, 'Fire rune': 100 }) });
    await page.waitForTimeout(1500);
    const utility = await snapshot();
    expect(utility?.step?.checklist?.some((r: any) => r.name === 'Iron ore' && r.count === 25) && utility.step.checklist.some((r: any) => r.name === 'Fire rune' && r.count === 100) && !(utility.step.npcNames?.length), `magic (${width}): an unlocked supplied Superheat batch replaces the combat inputs and NPCs`);
    const staffGear = { ...gear, equipment: [{ id: 1387, name: 'Staff of fire', slot: 'weapon', count: 1 }] };
    await page.evaluate(({ gear, items }) => { const w = window as unknown as { __status: Record<string, unknown>; __emit: (e: unknown) => void }; w.__status = { ...w.__status, ...gear }; w.__emit({ type: 'GEAR', gear }); w.__emit({ type: 'OWNED', bankSeen: true, items }); }, { gear: staffGear, items: stock({ 'Nature rune': 24, 'Iron ore': 24, 'Staff of fire': 1 }) });
    await page.waitForTimeout(1500);
    const remaining = await snapshot();
    expect(remaining?.step?.checklist?.some((r: any) => r.name === 'Staff of fire' && r.equip) && remaining.step.checklist.some((r: any) => r.name === 'Iron ore' && r.count === 24) && !remaining.step.checklist.some((r: any) => r.name === 'Fire rune'), `magic (${width}): worn staff substitution and the remaining castable bag reach one snapshot`);
    await reveal(page, '.training:visible');
    expect((await text(page, '.training:visible')).includes('Superheat Item') && !(await text(page, '.training-recommendation')).includes('Alchemy'), `magic (${width}): desktop and game share the usable method`);
    expect(Boolean((await page.locator('.training details').textContent())?.includes('manual setup')), `magic (${width}): unverified alternatives remain disclosed behind details`);
    expect(await noOverflow(page) && !errors.length, `magic (${width}): no overflow or runtime errors`);
    await page.context().close();
  }
}

async function magicFundingScenarios(browser: Browser) {
  const prices = { 556: 6, 558: 3, 555: 6, 557: 6, 554: 6, 563: 120, 1381: 1542, 1383: 1500, 1385: 1500, 1387: 940, 1739: 125 };
  for (const width of [1280]) for (const sale of ['restricted', 'unknown', 'lifted']) {
    const gear = { equipment: [], inventory: [], coins: sale === 'lifted' ? 100000 : 50, bankCoins: sale === 'restricted' ? null : 0 };
    const stats = { magic: 10 };
    const { page, errors } = await open(browser, width, {
      progress: progressBefore('S2-04', { gameMode: 'f2p', ...(sale === 'lifted' ? { sellRestrictions: 'lifted' } : {}) }), prices,
      status: { protocol: 6, inGame: true, stats, ...gear, questPoints: sale === 'restricted' ? 1 : 30, totalLevel: sale === 'restricted' ? 20 : 150 },
      events: [{ type: 'GEAR', gear }, { type: 'STATS', stats }, { type: 'XP', xp: { magic: 1200 } }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Staff of fire', carried: 0, noted: 0, bank: 1 }] }],
    }, '#/step/S2-04');
    await reveal(page, '.magic-plan');
    await page.locator('.magic-plan table').waitFor();
    expect(await page.locator('.gear-banner').count() === 0, `Magic (${width}, ${sale}): the current spell-training page does not borrow a future melee purchase banner`);
    const body = await page.locator('.magic-plan').innerText();
    expect(body.includes('Cast XP only') && body.includes('Full rune replacement cost') && !/fastest|twice as fast|buy it with the first hides/i.test(body), `Magic (${width}, ${sale}): the comparison does not claim measured speed or guaranteed loot funding`);
    expect(body.includes(sale === 'restricted' ? 'cannot fund rune purchases' : sale === 'unknown' ? 'Cowhide sales are unconfirmed' : 'Only a completed sale'), `Magic (${width}, ${sale}): funding follows the shared sale eligibility state`);
    const fireRow = page.locator('.magic-plan tbody tr').filter({ hasText: 'The best strike + Staff of fire' });
    expect((await fireRow.locator('td').nth(3).innerText()) === '—' && body.includes('You already own it'), `Magic (${width}, ${sale}): the confirmed banked staff is not bought again`);
    expect(body.includes(sale === 'restricted' ? 'Check the bank before judging affordability' : sale === 'lifted' ? 'That covers the lowest full cost' : 'not a deficit after owned supplies'), `Magic (${width}, ${sale}): partial coins are not a definite funding shortfall`);
    expect(await noOverflow(page) && !errors.length, `Magic (${width}, ${sale}): no overflow or console errors`);
    if (process.env.UI_SHOTS && sale === 'restricted') await page.locator('.magic-plan').screenshot({ path: `${process.env.UI_SHOTS}/magic-funding-${width}.png` });
    await page.context().close();
  }
}

async function dateFreeSettingsScenarios(browser: Browser) {
  for (const width of [1280]) {
    const progress = { version: 3, steps: { 'S1-01': 'done' }, levels: {}, notes: { 'S1-01': 'Keep this note' }, updatedAt: '2001-02-03T04:05:06.000Z', gameMode: 'f2p' };
    const { page, errors } = await open(browser, width, { offline: true, progress, localStorage: { 'osrs-put-settings-tab': 'progress' } }, '#/settings');
    const transfer = page.locator('section').filter({ has: page.getByRole('button', { name: 'Export progress', exact: true }) });
    expect(!/2001|changed \d/.test(await transfer.innerText()), `dates (${width}): the normal progress view omits its saved date`);
    await page.locator('input[type="file"]').setInputFiles({ name: 'progress.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'osrs-put', ...progress })) });
    const preview = page.locator('.notice').filter({ hasText: 'In the file:' });
    await preview.waitFor();
    expect((await preview.innerText()).includes('1 done') && !/2001|saved \d/.test(await preview.innerText()), `dates (${width}): import still previews contents without exposing its date`);
    await preview.getByRole('button', { name: 'Cancel', exact: true }).click();
    const saved = await page.evaluate(() => JSON.parse((window as unknown as { __saved: string }).__saved));
    expect(saved.updatedAt === progress.updatedAt && saved.notes['S1-01'] === 'Keep this note', `dates (${width}): internal save ordering metadata and notes remain intact`);
    expect(await noOverflow(page) && !errors.length, `dates (${width}): no overflow or console errors`);
    await page.context().close();
  }
}

async function marketPreparationScenarios(browser: Browser) {
  for (const width of [1280]) for (const unavailable of [false, true]) {
    const { page, errors } = await open(browser, width, {
      zen: true, market: true, marketUnavailable: unavailable,
      progress: progressBefore('S4-04', { gameMode: 'f2p' }),
      localStorage: { 'osrs-put:active-step': 'S4-04' },
      status: { protocol: 6, activeStepId: 'S4-04', coins: 10000, bankCoins: 0 },
      events: [{ type: 'OWNED', bankSeen: true, items: [{ name: 'Lobster', carried: 0, noted: 0, bank: 0 }] }],
    }, '#/step/S4-04');
    // The quest's items are on the Preparation ribbon.
    await reveal(page, '.quest-supply-list');
    const supplies = page.locator('.quest-supply-list');
    await supplies.getByText(unavailable ? 'Price unavailable' : 'GE estimate: ≈ 2,060 gp (103 each)', { exact: true }).waitFor({ timeout: 6000 });
    expect(await supplies.getByText(unavailable ? 'Price unavailable' : 'GE estimate: ≈ 2,060 gp (103 each)', { exact: true }).count() === 1,
      'market preparation (' + width + ', unavailable=' + unavailable + '): one supporting estimate, multiplied from the current quote');
    await page.waitForTimeout(800);
    const price = await page.evaluate(() => {
      const w = window as unknown as { __posts: { path: string; body?: { plan?: { lines: { name: string; price?: string }[] } } }[] };
      return w.__posts.filter(p => p.path === '/prep-plan').at(-1)?.body?.plan?.lines.find(l => l.name === 'Lobster')?.price;
    });
    expect(unavailable ? price === 'Price unavailable' : !!price?.startsWith('GE estimate: ≈ 2,060 gp'),
      'market preparation (' + width + ', unavailable=' + unavailable + '): the game receives the same estimate or honest absence');
    expect(!(await page.locator('main').innerText()).includes('26 Sep 2026'), 'market preparation (' + width + '): no historical route price date');
    expect(await noOverflow(page) && !errors.length, 'market preparation (' + width + '): no overflow or console errors');
    await page.context().close();
  }
}

async function toolProofScenarios(browser: Browser) {
  for (const width of [1280]) {
    const rows = PICKAXES.map(name => ({ name, carried: 0, noted: 0, bank: 0, exactCarried: 0, exactNoted: 0, exactBank: 0 }));
    const { page, errors } = await open(browser, width, {
      zen: true, progress: progressBefore('S1-12', { gameMode: 'f2p' }),
      localStorage: { 'osrs-put:active-step': 'S1-12' },
      status: { protocol: 6, stats: { mining: 6 }, activeStepId: 'S1-12' },
      events: [{ type: 'STATS', stats: { mining: 6 } }, { type: 'OWNED', bankSeen: true, items: [rows[0]] }],
    }, '#/step/S1-12');
    const line = () => page.evaluate(() => {
      const posts = (window as unknown as { __posts: { path: string; body?: { plan?: { lines: { name: string; where: string; action?: string }[] } } }[] }).__posts;
      return posts.filter(p => p.path === '/prep-plan').at(-1)?.body?.plan?.lines.find(l => l.name === 'Bronze pickaxe');
    });
    await page.waitForTimeout(900);
    const unreported = await line();
    if (!unreported) console.log('tool proof: missing snapshot line', await page.evaluate(() => (window as unknown as { __posts: unknown[] }).__posts.slice(-8)));
    expect(unreported?.where === 'UNKNOWN' && !/^(Buy|Withdraw) /i.test(unreported.action ?? ''), `tool proof (${width}): an absent bronze tier cannot invent a purchase while another usable tier is unread`);
    const banked = [rows[0], { ...rows[1], bank: 1, exactBank: 1 }];
    await page.evaluate(items => (window as unknown as { __emit: (e: unknown) => void }).__emit({ type: 'OWNED', bankSeen: true, items }), banked);
    await page.waitForTimeout(900);
    expect((await line())?.where === 'BANK', `tool proof (${width}): confirmed banked stock can cover the goal without checking every other tier`);
    await page.evaluate(items => (window as unknown as { __emit: (e: unknown) => void }).__emit({ type: 'OWNED', bankSeen: true, items }), rows);
    await page.waitForTimeout(900);
    expect((await line())?.where === 'MISSING', `tool proof (${width}): checking every eligible tier establishes a genuine shortage`);
    const held = rows.map(r => r.name === 'Iron pickaxe' ? { ...r, carried: 1, exactCarried: 1 } : r);
    await page.evaluate(items => (window as unknown as { __emit: (e: unknown) => void }).__emit({ type: 'OWNED', bankSeen: true, items }), held);
    await page.waitForTimeout(900);
    expect((await line())?.where === 'INVENTORY', `tool proof (${width}): the owned usable tier clears the preparation action`);
    expect(await noOverflow(page) && !errors.length, `tool proof (${width}): no overflow or console errors`);
    await page.context().close();
  }
}

async function armourPreparationScenarios(browser: Browser) {
  const pieces = ([[1165, 'Black full helm', 'head'], [1125, 'Black platebody', 'body'], [1077, 'Black platelegs', 'legs'], [1195, 'Black kiteshield', 'shield']] as [number, string, string][])
    .map(([id, name, slot]) => ({ id, name, slot }));
  const weapon = { id: 1331, name: 'Adamant scimitar', slot: 'weapon' };
  const stats = { attack: 30, strength: 21, defence: 10, hitpoints: 24 };
  const xp = { attack: 13363, strength: 2000, defence: 1154, hitpoints: 3500 };
  const items = [...pieces.map(p => ({ name: p.name, carried: 1, noted: 0, bank: 0 })), { name: 'Black plateskirt', carried: 0, noted: 0, bank: 0 }];
  const gear = { equipment: [weapon], inventory: pieces, coins: 10000, bankCoins: 0 };
  for (const width of [1280]) {
    const { page, errors } = await open(browser, width, {
      progress: progressBefore('S4-03', { gameMode: 'f2p', levels: stats }),
      localStorage: { 'osrs-put:active-step': 'S4-03' }, market: true,
      status: { protocol: 6, inGame: true, player: 'Armour Test', activeStepId: 'S4-03', stats, xp, ...gear },
      events: [{ type: 'STATS', stats }, { type: 'XP', xp }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items }],
    }, '#/step/S4-03');
    const snapshot = () => page.evaluate(() => (window as unknown as { __posts: { path: string; body: any }[] }).__posts.filter(p => p.path === '/prep-plan').at(-1)?.body);
    await page.waitForTimeout(1500);
    const prep = await snapshot();
    expect(prep?.step?.goal?.includes('10 Defence required') && prep.step.checklist?.length === 4 && prep.step.checklist.every((i: any) => i.equip),
      `armour (${width}): the same four-piece equip requirement and Defence level reach the game`);
    const currentArmour = prep?.plan?.lines?.filter((i: any) => i.equip && i.timing === 'NOW') ?? [];
    expect(currentArmour.length === 4 && currentArmour.every((i: any) => i.where === 'INVENTORY' && /^Equip /.test(i.action))
      && !prep.plan.bankWithdrawals?.some((i: any) => pieces.some(p => p.id === i.itemId)),
      `armour (${width}): carried armour requires equipping, with no duplicate purchase or withdrawal`);
    await reveal(page, '.quest-supply-state');
    expect(await page.locator('.quest-supply-state').filter({ hasText: /^↗ Equip$/ }).count() === 4, `armour (${width}): each current supply says Equip`);
    const worn = { ...gear, equipment: [weapon, ...pieces], inventory: [] };
    await page.evaluate(g => {
      const w = window as unknown as { __status: Record<string, unknown>; __emit: (e: unknown) => void };
      w.__status = { ...w.__status, ...g };
      w.__emit({ type: 'GEAR', gear: g });
    }, worn);
    await page.waitForTimeout(1500);
    const trained = await snapshot();
    expect(trained?.step?.pacing?.targetExp > 0 && !trained.step.checklist?.some((i: any) => i.equip), `armour (${width}): confirmed worn gear advances to training`);
    expect(trained?.step?.completionTrigger?.levels?.[0]?.level === 40 && !trained.step.completionTrigger?.items?.length, `armour (${width}): saved route completion remains Attack 40 only`);
    expect(await noOverflow(page) && !errors.length, `armour (${width}): no overflow or console errors`);
    await page.context().close();
  }
}

async function styleQuoteScenarios(browser: Browser) {
  for (const width of [1280]) for (const unavailable of [false, true]) {
    const stats = { magic: 10, attack: 1, defence: 1, ranged: 1 };
    const { page, errors } = await open(browser, width, {
      market: true, marketUnavailable: unavailable, progress: progressBefore('S2-04', { levels: stats }),
      marketQuotes: { 'Staff of fire': { id: 1387, price: 1500 }, 'Amulet of magic': { id: 1727, price: 700 } },
      status: { protocol: 6, inGame: true, stats, coins: 10000, bankCoins: 0, equipment: [], inventory: [] },
      events: [{ type: 'STATS', stats }],
    }, '#/step/S2-04');
    await reveal(page, '.style-gear summary');
    await page.locator('.style-gear summary').click();
    await page.waitForTimeout(800);
    const prices = await page.locator('.style-market-price').allTextContents();
    expect(prices.length > 0 && (unavailable ? prices.every(p => p.includes('Price unavailable')) : prices.some(p => p.includes('GE estimate:'))),
      `style quotes (${width}, unavailable=${unavailable}): shared market estimates or honest quote absence`);
    expect(!(await text(page, '.style-gear')).includes('not sold at the exchange'), `style quotes (${width}): an unavailable quote cannot invent trade restrictions`);
    expect((await text(page, '.magic-plan')).includes('Price unavailable for a complete option'), `Magic quotes (${width}, unavailable=${unavailable}): missing rune quotes keep the requirements visible`);
    expect(await noOverflow(page) && !errors.length, `style quotes (${width}): no overflow or console errors`);
    await page.context().close();
  }
}

async function skillHandoverScenarios(browser: Browser) {
  for (const width of [1280]) {
    const stats = { fishing: 49, cooking: 30 };
    const names = ['Small fishing net', 'Fishing rod', 'Fishing bait', 'Fly fishing rod', 'Feather', 'Lobster pot', 'Harpoon', 'Raw beef', 'Raw chicken', 'Raw trout', 'Raw tuna', 'Grapes', 'Jug of water'];
    const items = names.map(name => ({ name, carried: 0, noted: 0, bank: name === 'Raw tuna' ? 26 : name === 'Grapes' || name === 'Jug of water' ? 13 : 0 }));
    const { page, errors } = await open(browser, width, {
      market: true, progress: progressBefore('S6-02', { gameMode: 'f2p', levels: stats }),
      localStorage: { 'osrs-put:active-step': 'S6-02' },
      status: { protocol: 6, inGame: true, player: 'Skill Handover', activeStepId: 'S6-02', stats, coins: 1000, bankCoins: 0, equipment: [], inventory: [] },
      events: [{ type: 'STATS', stats }, { type: 'OWNED', bankSeen: true, items }],
    }, '#/step/S6-02');
    const snapshot = () => page.evaluate(() => (window as unknown as { __posts: { path: string; body: any }[] }).__posts.filter(p => p.path === '/prep-plan').at(-1)?.body);
    const setLevels = async (levels: Record<string, number>, destination: string) => {
      await page.evaluate(s => { const w = window as unknown as { __emit: (e: unknown) => void; __status: Record<string, unknown> }; w.__status = { ...w.__status, stats: s }; w.__emit({ type: 'STATS', stats: s }); }, levels);
      // The cold-start profile/bridge effects can finish after the old fixed delay. Wait for the actual projection; keep every assertion below.
      await page.waitForFunction(label => {
        const posts = (window as unknown as { __posts: { path: string; body: any }[] }).__posts;
        return posts.filter(p => p.path === '/prep-plan').at(-1)?.body?.step?.worldPoint?.label?.includes(label);
      }, destination, { timeout: 10000 });
    };
    await setLevels({ fishing: 50, cooking: 30 }, 'Cooking: Tuna');
    const cooking = await snapshot();
    expect(cooking?.step?.worldPoint?.label?.includes('Cooking: Tuna') && cooking.step.worldPoint.label.includes('Barbarian Village') && cooking.step.checklist?.some((r: any) => r.name === 'Raw tuna' && r.count === 26), `skill handover (${width}): completing Fishing projects Cooking supplies and destination into the game`);
    expect(!cooking?.step?.npcNames?.includes('Fishing spot') && !cooking?.step?.checklist?.some((r: any) => /fishing net|fishing rod|harpoon/i.test(r.name)), `skill handover (${width}): no obsolete Fishing targets or tools`);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:progress') ?? '{}'));
    expect(saved.steps?.['S6-02'] !== 'done', `skill handover (${width}): Fishing alone cannot complete the combined goal`);
    await reveal(page, '.training:visible');
    expect((await text(page, '.training:visible')).includes('Cooking'), `skill handover (${width}): the visible method follows the same remaining skill`);
    await setLevels({ fishing: 50, cooking: 35 }, 'Edgeville Bank');
    const wine = await snapshot();
    expect(wine?.step?.worldPoint?.label?.includes('Edgeville Bank') && wine.step.checklist?.some((r: any) => r.name === 'Grapes' && r.count === 13) && wine.step.checklist?.some((r: any) => r.name === 'Jug of water' && r.count === 13), `skill handover (${width}): wine uses actual ingredient pairs at a bank`);
    expect(await noOverflow(page) && !errors.length, `skill handover (${width}): no overflow or console errors`);
    await page.context().close();
    // A fresh low-level profile: do not simulate Cooking dropping from35 to1 on the admitted character.
    const low = { fishing: 50, cooking: 1 };
    const mixedItems = names.map(name => ({ name, carried: name === 'Raw beef' || name === 'Raw chicken' ? 13 : 0, noted: 0, bank: 0 }));
    const { page: materialPage, errors: materialErrors } = await open(browser, width, {
      market: true, progress: progressBefore('S6-02', { gameMode: 'f2p', levels: low }),
      localStorage: { 'osrs-put:active-step': 'S6-02' },
      status: { protocol: 6, inGame: true, player: 'Material Handover', activeStepId: 'S6-02', stats: low, coins: 1000, bankCoins: 0, equipment: [], inventory: [] },
      events: [{ type: 'STATS', stats: low }, { type: 'OWNED', bankSeen: true, items: mixedItems }],
    }, '#/step/S6-02');
    await materialPage.waitForFunction(() => (window as unknown as { __posts: { path: string; body: any }[] }).__posts.filter(p => p.path === '/prep-plan').at(-1)?.body?.plan?.lines?.some((r: any) => r.name === 'Raw beef' && r.where === 'INVENTORY' && r.need === 26));
    const mixed = await materialPage.evaluate(() => (window as unknown as { __posts: { path: string; body: any }[] }).__posts.filter(p => p.path === '/prep-plan').at(-1)?.body);
    expect(mixed.plan.lines.some((r: any) => r.name === 'Raw beef' && r.where === 'INVENTORY' && r.need === 26), `skill handover (${width}): mixed beef/chicken covers one bag without buying duplicate beef`);
    await materialPage.evaluate(items => (window as unknown as { __emit: (e: unknown) => void }).__emit({ type: 'OWNED', bankSeen: true, items }),
      names.map(name => ({ name, carried: 0, noted: 0, bank: name === 'Raw chicken' ? 26 : 0 })));
    await materialPage.waitForFunction(() => (window as unknown as { __posts: { path: string; body: any }[] }).__posts.filter(p => p.path === '/prep-plan').at(-1)?.body?.plan?.bankWithdrawals?.some((w: any) => w.itemName === 'Raw chicken' && w.quantity === 26));
    const banked = await materialPage.evaluate(() => (window as unknown as { __posts: { path: string; body: any }[] }).__posts.filter(p => p.path === '/prep-plan').at(-1)?.body);
    expect(banked.plan.lines.find((r: any) => r.name === 'Raw beef')?.where === 'BANK', `skill handover (${width}): banked chicken projects the actual alternative withdrawal`);
    expect(await noOverflow(materialPage) && !materialErrors.length, `skill handover (${width}): mixed-material preparation has no overflow or console errors`);
    await materialPage.context().close();
  }
}

async function miningHandoverScenarios(browser: Browser) {
  for (const width of [1280]) {
    const stats = { mining: 59, woodcutting: 1 };
    const names = ['Bronze pickaxe', 'Iron pickaxe', 'Steel pickaxe', 'Mithril pickaxe', 'Adamant pickaxe', 'Rune pickaxe', 'Bronze axe', 'Iron axe', 'Steel axe', 'Mithril axe', 'Adamant axe', 'Rune axe'];
    const items = names.map(name => ({ name, carried: name === 'Rune pickaxe' ? 1 : 0, noted: 0, bank: name === 'Bronze axe' ? 1 : 0 }));
    const { page, errors } = await open(browser, width, {
      market: true, progress: progressBefore('S6-03', { gameMode: 'f2p', levels: stats }),
      localStorage: { 'osrs-put:active-step': 'S6-03' },
      status: { protocol: 6, inGame: true, player: 'Mining Handover', activeStepId: 'S6-03', stats, coins: 1000, bankCoins: 0, equipment: [], inventory: [] },
      events: [{ type: 'STATS', stats }, { type: 'OWNED', bankSeen: true, items }],
    }, '#/step/S6-03');
    const snapshot = () => page.evaluate(() => (window as unknown as { __posts: { path: string; body: any }[] }).__posts.filter(p => p.path === '/prep-plan').at(-1)?.body);
    const mining = await snapshot();
    expect(mining?.step?.worldPoint?.label?.includes('South-east Varrock mine') && JSON.stringify(mining.step.objectNames) === JSON.stringify(['Iron rocks']), `Mining handover (${width}): current Mining task has only iron scenery`);
    for (const [level, object, place] of [[1, 'Tree', 'Lumbridge'], [15, 'Oak tree', 'Draynor Bank'], [30, 'Willow tree', 'Port Sarim']] as const) {
      await page.evaluate(s => { const w = window as unknown as { __emit: (e: unknown) => void; __status: Record<string, unknown> }; w.__status = { ...w.__status, stats: s }; w.__emit({ type: 'STATS', stats: s }); }, { mining: 60, woodcutting: level });
      await page.waitForTimeout(1300);
      const current = await snapshot();
      expect(current?.step?.worldPoint?.label?.includes(place) && JSON.stringify(current.step.objectNames) === JSON.stringify([object]), `Mining handover (${width}, WC${level}): one current Woodcutting scene and destination`);
      expect(current?.step?.checklist?.length === 1 && current.step.checklist[0].name === 'Bronze axe', `Mining handover (${width}, WC${level}): axe replaces pickaxe preparation`);
      expect(current?.step?.completionTrigger?.levels?.some((r: any) => r.skill === 'mining' && r.level === 60) && current.step.completionTrigger.levels.some((r: any) => r.skill === 'woodcutting' && r.level === 60), `Mining handover (${width}, WC${level}): both original goals remain`);
    }
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:progress') ?? '{}'));
    expect(saved.steps?.['S6-03'] !== 'done', `Mining handover (${width}): Mining alone cannot complete this step`);
    await reveal(page, '.training:visible');
    expect((await text(page, '.training:visible')).includes('Woodcutting'), `Mining handover (${width}): desktop method and game payload agree`);
    expect(await noOverflow(page) && !errors.length, `Mining handover (${width}): no overflow or console errors`);
    await page.context().close();
  }
}

async function rangedPreparationScenarios(browser: Browser) {
  for (const width of [1280]) {
    const stats = { ranged: 1, defence: 1, hitpoints: 30 };
    const weapon = { id: 841, name: 'Shortbow', slot: 'weapon', count: 1 };
    const arrow = { id: 882, name: 'Bronze arrow', slot: 'ammo', count: 1 };
    const clothes = ['Leather cowl', 'Leather body', 'Leather chaps', 'Leather vambraces', 'Leather boots'].map((name, i) => ({ id: 50000 + i, name, slot: ['head', 'body', 'legs', 'hands', 'feet'][i], count: 1 }));
    const gear = { equipment: [weapon, arrow], inventory: [], coins: 1000, bankCoins: 0 };
    const names = ['Maple shortbow', 'Maple longbow', 'Willow shortbow', 'Willow longbow', 'Oak shortbow', 'Oak longbow', 'Shortbow', 'Longbow', 'Adamant arrow', 'Mithril arrow', 'Steel arrow', 'Iron arrow', 'Bronze arrow', 'Salmon', 'Tuna', 'Lobster', 'Swordfish', ...clothes.map(c => c.name), 'Coif', 'Studded body', 'Studded chaps', "Green d'hide body", "Green d'hide chaps", "Green d'hide vambraces", 'Amulet of power', 'Amulet of accuracy'];
    const items = names.map(name => ({ name, carried: name === 'Shortbow' ? 1 : name === 'Bronze arrow' ? 100 : 0, noted: 0, bank: name === 'Salmon' ? 10 : clothes.some(c => c.name === name) ? 1 : 0 }));
    const { page, errors } = await open(browser, width, {
      market: true, progress: progressBefore('S6-01', { gameMode: 'f2p', levels: stats }),
      localStorage: { 'osrs-put:active-step': 'S6-01' },
      status: { protocol: 6, inGame: true, player: 'Ranged Preparation', activeStepId: 'S6-01', stats, ...gear },
      events: [{ type: 'STATS', stats }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items }],
    }, '#/step/S6-01');
    const snapshot = () => page.evaluate(() => (window as unknown as { __posts: { path: string; body: any }[] }).__posts.filter(p => p.path === '/prep-plan').at(-1)?.body);
    const initial = await snapshot();
    expect(initial?.step?.npcNames?.includes('Seagull') && initial.step.worldPoint?.label?.includes('Port Sarim'), `ranged (${width}): a beginner gets the current surface trainer, not ogresses`);
    expect(initial?.step?.checklist?.some((r: any) => r.name === 'Bronze arrow' && r.count === 100 && r.equip) && initial.plan?.lines?.find((r: any) => r.name === 'Bronze arrow')?.where !== 'EQUIPPED', `ranged (${width}): one worn arrow cannot satisfy the starter stack`);
    expect(clothes.every(c => initial?.step?.checklist?.some((r: any) => r.name === c.name && r.equip) && initial.plan?.lines?.find((r: any) => r.name === c.name)?.where === 'BANK'), `ranged (${width}): the whole owned ranged outfit is prepared from the bank`);
    const equipped = { ...gear, equipment: [weapon, { ...arrow, count: 100 }, ...clothes] };
    await page.evaluate(g => { const w = window as unknown as { __status: Record<string, unknown>; __emit: (e: unknown) => void }; w.__status = { ...w.__status, ...g }; w.__emit({ type: 'GEAR', gear: g }); }, equipped);
    await page.waitForTimeout(1500);
    const ready = await snapshot();
    expect(ready?.plan?.lines?.find((r: any) => r.name === 'Bronze arrow')?.where === 'EQUIPPED', `ranged (${width}): a GEAR-only quantity update reaches the canonical preparation snapshot`);
    expect(clothes.every(c => ready?.plan?.lines?.find((r: any) => r.name === c.name)?.where === 'EQUIPPED'), `ranged (${width}): actual equipped outfit clears its preparation lines`);
    // Known HP/Defence are needed for personalized recovery; prices and owned food make the frog kit practical.
    for (const [level, npc] of [[20, 'Giant frog'], [26, 'Giant frog']] as const) {
      await page.evaluate(s => { const w = window as unknown as { __status: Record<string, unknown>; __emit: (e: unknown) => void }; w.__status = { ...w.__status, stats: s }; w.__emit({ type: 'STATS', stats: s }); }, { ranged: level, defence: 1, hitpoints: 30 });
      await page.waitForTimeout(1500);
      const current = await snapshot();
      expect(JSON.stringify(current?.step?.npcNames) === JSON.stringify([npc]) && !current?.step?.worldPoint?.label?.includes('Corsair'), `ranged (${width}, level${level}): method, scenery and destination advance together`);
      if (level === 26) expect(current?.step?.checklist?.some((r: any) => r.name === 'Salmon' && r.count === 10) && current.plan?.lines?.find((r: any) => r.name === 'Salmon')?.where === 'BANK', `ranged (${width}): the later combat method asks for owned banked food`);
    }
    await reveal(page, '.training:visible');
    expect((await text(page, '.training:visible')).includes('Giant frogs'), `ranged (${width}): the visible desktop advice matches the game target`);
    await page.screenshot({ path: `audit-temp/ranged-kit-${width}.png` });
    expect(await noOverflow(page) && !errors.length, `ranged (${width}): no overflow or runtime errors`);
    await page.context().close();
  }
}

async function shoppingQuoteScenarios(browser: Browser) {
  for (const width of [1280]) for (const state of ['current', 'cached', 'missing']) {
    const { page, errors } = await open(browser, width, {
      market: true, marketUnavailable: state === 'missing', marketAgeMinutes: state === 'cached' ? 120 : undefined,
      progress: progressBefore('S4-04'), localStorage: { 'osrs-put:active-step': 'S4-04', 'osrs-put:shopping-scope': 'step' },
      status: { protocol: 6, inGame: true, player: 'Shopping Quotes', activeStepId: 'S4-04', coins: 100000, bankCoins: 0, equipment: [], inventory: [] },
      events: [{ type: 'OWNED', bankSeen: true, items: [{ name: 'Lobster', carried: 0, noted: 0, bank: 0 }] }],
    }, '#/shopping');
    const row = page.locator('.shop-item-row').filter({ has: page.getByText('Lobster', { exact: true }) }).first();
    await row.waitFor({ state: 'visible' });
    await page.waitForTimeout(700);
    const quote = await row.locator('.shop-cost').innerText();
    expect(state === 'missing' ? quote === 'Price unavailable' : quote.includes(state === 'cached' ? 'Cached GE estimate' : 'GE estimate'), `shopping quotes (${width}, ${state}): quantities use labelled market costs`);
    if (state === 'missing') expect((await text(page, '.shop-page')).includes('without a price'), `shopping quotes (${width}): excluded costs are disclosed`);
    expect(await noOverflow(page) && !errors.length, `shopping quotes (${width}, ${state}): no overflow or console errors`);
    await page.context().close();
  }
}

async function journalQuoteScenarios(browser: Browser) {
  for (const width of [1280]) for (const state of ['current', 'cached', 'missing']) {
    const stamp = Date.now() - 60_000;
    const rows = [{ name: 'Cowhide', quantityDelta: 10, reason: 'LOOT', timestamp: stamp, estimatedGpValue: 99999 }];
    const { page, errors } = await open(browser, width, {
      market: true, marketUnavailable: state === 'missing', marketAgeMinutes: state === 'cached' ? 120 : undefined,
      localStorage: { 'osrs-put:profiles': JSON.stringify({ active: 'main', list: [{ id: 'main', name: 'Main', player: 'Alpha One' }] }),
        'osrs-put:ledger:main:alpha one': JSON.stringify(rows) },
      status: { protocol: 6, inGame: true, player: 'Alpha One' },
    }, '#/journal/session');
    await page.locator('.ledger-block').waitFor();
    await page.waitForTimeout(700);
    const body = await text(page, '.ledger-block');
    expect(state === 'missing' ? body.includes('Price unavailable') && !body.includes('loot ≈') : body.includes('loot ≈') && body.includes('GE sell estimates'), `journal quotes (${width}, ${state}): quote certainty and no saved-value fallback`);
    if (state === 'cached') expect(body.includes('cached'), `journal quotes (${width}): old side certainty is visible`);
    expect(!/\d{2}:\d{2}|99,999/.test(body), `journal quotes (${width}, ${state}): no quote clock or stale recorded value`);
    expect(await noOverflow(page) && !errors.length, `journal quotes (${width}, ${state}): no overflow or console errors`);
    await page.context().close();
  }
}

async function dossierQuoteScenarios(browser: Browser) {
  for (const width of [1280]) for (const quoteState of ['current', 'cached', 'missing']) {
    const unavailable = quoteState === 'missing';
    const { page, errors } = await open(browser, width, {
      market: true, marketUnavailable: unavailable, marketAgeMinutes: quoteState === 'cached' ? 120 : undefined, progress: progressBefore('S4-04'),
    }, '#/step/S4-04');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.locator('.search-input').fill('Lobster');
    const row = page.locator('.search-hit.is-item').filter({ has: page.getByText('Lobster', { exact: true }) }).first();
    await row.waitFor({ state: 'visible' });
    const searchQuote = await row.locator('.search-hit-price').innerText();
    expect(await row.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `search quotes (${width}, ${quoteState}): labels fit inside the result row`);
    expect(unavailable ? searchQuote.includes('Price unavailable') : searchQuote.includes('GE estimate'), `search quotes (${width}, unavailable=${unavailable}): shared quote certainty`);
    if (quoteState === 'cached') expect(searchQuote.includes('Cached GE estimate'), `search quotes (${width}): old sides are explicitly cached`);
    await row.click();
    const drawer = page.locator('dialog.drawer[open]');
    await drawer.waitFor({ timeout: 6000 });
    await page.waitForTimeout(700);
    const quote = await drawer.locator('.tile-ge').innerText();
    expect(unavailable ? quote.includes('Price unavailable') && !quote.includes(' gp') : quote.includes('GE estimate') && quote.includes('GE sell estimate'),
      `dossier quotes (${width}, unavailable=${unavailable}): current sides or quote absence, never a database fallback`);
    expect(!quote.includes('Not sold on the exchange'), `dossier quotes (${width}): no invented trade restriction`);
    if (quoteState === 'cached') expect(quote.includes('Cached GE estimate') && quote.includes('Cached GE sell estimate'), `dossier quotes (${width}): cached buy and sell labels`);
    if (unavailable) expect(await drawer.locator('.alch-margin').count() === 0, `dossier quotes (${width}): no alchemy margin without the input prices`);
    expect(await noOverflow(page) && !errors.length, `dossier quotes (${width}): no overflow or console errors`);
    await page.context().close();
  }
}

async function accountSyncProofScenarios(browser: Browser) {
  for (const width of [1280]) {
    const { page, errors } = await open(browser, width, {
      progress: { version: 3, steps: { 'S1-04': 'skipped' }, levels: {}, notes: { 'S1-01': 'Keep this note' }, gameMode: 'f2p' },
      localStorage: { 'osrs-put-settings-tab': 'progress' },
      status: { protocol: 6, inGame: true, player: 'Sync Proof', questsDone: ['Goblin Diplomacy'] },
      events: [{ type: 'QUESTS', done: ['Goblin Diplomacy'] }],
    }, '#/settings');
    await page.waitForTimeout(900);
    const card = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Account sync', exact: true }) });
    const automatic = await card.locator(':scope > ul > li code').allTextContents();
    expect(automatic.join(',') === 'S2-12', `sync proof (${width}): only the observed quest is game-confirmed`);
    const manual = await card.locator('details ul').textContent();
    expect(!!manual?.includes('S2-01') && !manual?.includes('S2-10'), `sync proof (${width}): shopping stays unverified and the contradicted quest is excluded`);
    await card.getByRole('button', { name: /^Mark \d+ steps$/ }).click();
    await page.waitForTimeout(500);
    const saved = await page.evaluate(() => JSON.parse((window as unknown as { __saved: string }).__saved));
    expect(saved.steps['S2-12'] === 'done' && !saved.steps['S2-10'] && !saved.steps['S2-01'], `sync proof (${width}): applying sync cannot mark inferred ancestors`);
    expect(saved.steps['S1-04'] === 'skipped' && saved.notes['S1-01'] === 'Keep this note', `sync proof (${width}): existing skips and notes remain intact`);
    expect(await noOverflow(page) && !errors.length, `sync proof (${width}): no overflow or console errors`);
    await page.context().close();
  }
}

try {
  await startServer();
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    await run(browser);
  } finally {
    await browser.close();
  }
} finally {
  stopServer();
}
console.log(failures.length ? `\nTotal: ${failures.length} failed` : '\nTotal: everything passed');
process.exit(failures.length ? 1 : 0);

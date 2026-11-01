// The browser-suite harness: the stub desktop app and RuneLite bridge (Mock), the preview server, open() and settle(), and the checks.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { Browser, Page } from 'playwright';


const PORT = 4179;
export const BASE = `http://127.0.0.1:${PORT}/`;
export const steps = JSON.parse(readFileSync(new URL('../../../src/data/authored/steps.json', import.meta.url), 'utf8')) as { id: string }[];

export interface Mock {
  progress?: unknown;
  /** The native profile list, independent of a damaged browser list. */
  profileFile?: unknown;
  status?: Record<string, unknown>;
  events?: unknown[];
  localStorage?: Record<string, string>;
  /** The exchange prices by item ID: they stand in for the prices.runescape.wiki reply (without them the network to the wiki is closed). */
  prices?: Record<number, number>;
  /** The exchange as captured on 2026-10-18 (tests/funding/fixtures), with its times moved to now: latest, hourly and the item reference. */
  market?: boolean;
  /** The item catalogue is available but market quotes are missing. */
  marketUnavailable?: boolean;
  /** Scenario-specific quotes added to the recorded market fixture. */
  marketQuotes?: Record<string, { id: number; price: number; limit?: number }>;
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
export function progressBefore(id: string, extra: Record<string, unknown> = {}) {
  const ids = steps.map((s) => s.id);
  const done = Object.fromEntries(ids.slice(0, ids.indexOf(id)).map((s) => [s, 'done']));
  return { version: 3, steps: done, levels: {}, notes: {}, updatedAt: '2026-09-27T10:00:00.000Z', gameMode: 'members', ...extra };
}

export async function open(browser: Browser, width: number, mock: Mock, hash: string): Promise<{ page: Page; errors: string[] }> {
  const ctx = await browser.newContext({
    viewport: { width, height: mock.scale ? Math.round(1040 / mock.scale) : 900 }, colorScheme: mock.theme ?? 'dark',
    ...(mock.scale ? { deviceScaleFactor: mock.scale } : {}),
  });
  await ctx.addInitScript((m: Mock) => {
    // settle() needs to know when the page is busy: short timers (debounces, mock event delivery) and requests in flight.
    const busy = new Set<number>();
    const later = window.setTimeout.bind(window), cancel = window.clearTimeout.bind(window), get = window.fetch.bind(window);
    let requests = 0;
    window.setTimeout = ((fn: TimerHandler, ms?: number, ...args: unknown[]) => {
      const id = later(() => { busy.delete(id); if (typeof fn === 'function') fn(...args); }, ms);
      if ((ms ?? 0) <= 1500) busy.add(id);
      return id;
    }) as typeof window.setTimeout;
    window.clearTimeout = ((id?: number) => { if (id !== undefined) busy.delete(id); cancel(id); }) as typeof window.clearTimeout;
    window.fetch = (...args: Parameters<typeof fetch>) => { requests++; return get(...args).finally(() => { requests--; }); };
    // React schedules renders and effects through a MessageChannel: a message posted and not yet handled is work to come.
    let queued = 0;
    const Channel = window.MessageChannel;
    window.MessageChannel = function () {
      const ch = new Channel();
      const send = ch.port2.postMessage.bind(ch.port2);
      ch.port2.postMessage = ((...args: Parameters<MessagePort['postMessage']>) => { queued++; send(...args); }) as MessagePort['postMessage'];
      let handler: ((e: MessageEvent) => void) | null = null;
      ch.port1.onmessage = (e) => { try { handler?.(e); } finally { queued--; } };
      Object.defineProperty(ch.port1, 'onmessage', { get: () => handler, set: (fn: ((e: MessageEvent) => void) | null) => { handler = fn; } });
      return ch;
    } as unknown as typeof MessageChannel;
    (window as unknown as { __busy: () => number }).__busy = () => busy.size + requests + queued;
    for (const [k, v] of Object.entries(m.localStorage ?? {})) localStorage.setItem(k, v);
    const w = window as unknown as Record<string, unknown>;
    const posts: unknown[] = [];
    w.__posts = posts;
    w.__fileWriteFailure = !!m.fileWriteFailure;
    w.__profileWriteFailure = !!m.profileWriteFailure;
    let progress = m.progress ? JSON.stringify(m.progress) : null;
    w.osrsDesktop = {
      getWindowPrefs: async () => ({ alwaysOnTop: false }),
      setAlwaysOnTop() {},
      updates: {
        get: async () => ({ state: 'current', current: 'test', latest: null, notes: '', progress: 0, error: null, auto: true }),
        check: async () => { w.__updateChecks = Number(w.__updateChecks ?? 0) + 1; return { state: 'current', current: 'test', latest: null, notes: '', progress: 0, error: null, auto: true }; },
        download: async () => ({ state: 'current', current: 'test', latest: null, notes: '', progress: 0, error: null, auto: true }),
        install: async () => false, setAuto() {}, onState: () => () => {},
      },
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
          w.__eventsDelivered = false;
          setTimeout(() => { onState('open'); for (const e of m.events ?? []) onEvent(JSON.stringify(e)); w.__eventsDelivered = true; }, 50);
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
    const rows = (JSON.parse(readFileSync(new URL('../../../tests/funding/fixtures/market-2026-10-18.json', import.meta.url), 'utf8')) as { items: Record<string, Row> }).items;
    for (const [name, quote] of Object.entries(mock.marketQuotes ?? {})) rows[name] = {
      id: quote.id, limit: quote.limit ?? 100, high: quote.price, low: quote.price, avgHigh: quote.price, avgLow: quote.price, highVolume: 1000, lowVolume: 1000,
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
  // Ready instead of a fixed 1.2 s: the app shell attached, the mock events delivered, fonts loaded and two frames committed.
  await page.waitForSelector('.la-root, main', { state: 'attached', timeout: 15000 }).catch(() => {});
  await page.waitForFunction(() => (window as unknown as { __eventsDelivered?: boolean }).__eventsDelivered !== false && document.fonts.status === 'loaded', null, { timeout: 5000 }).catch(() => {});
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
  return { page, errors };
}

/** Instead of a fixed sleep: wait until no short timer or request is pending (at most `timeout`), then two frames. */
export async function settle(page: Page, timeout = 5000) {
  await page.waitForFunction(() => ((window as unknown as { __busy?: () => number }).__busy?.() ?? 0) === 0, null, { timeout, polling: 'raf' }).catch(() => { settleTimeouts++; });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
}
export let settleTimeouts = 0;

// The address is set explicitly: without --host the server on some machines (GitHub CI) listens on IPv6 ::1 only, and 127.0.0.1 does not answer.
// On the release runner the preview server has twice died mid-run (every later page: ERR_CONNECTION_FAILED): open() starts it again once and says
// what the server printed, instead of failing every scenario after it.
let server: ReturnType<typeof spawn> | null = null;
let serverLog = '';
export async function startServer() {
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
export function stopServer() { server?.kill(); }
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

export const failures: string[] = [];
export function expect(cond: boolean, what: string) {
  if (cond) console.log(`  ✓ ${what}`);
  else { console.log(`  ✗ ${what}`); failures.push(what); }
}
export async function noOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 0);
}
/**
 * A step is one workspace with four views (Steps, Preparation, Travel, Details). Opens the view whose content matches the selector, so the
 * scenarios keep asking "is this on the page" without caring which tab holds it. Nothing happens off the Path page, or when it is already shown.
 */
export async function reveal(page: Page, sel: string) {
  if (await page.locator(sel).count()) return;
  // The Ledger's step page: Steps, Preparation, Route & game, Details and Wiki are ribbons.
  const openers = [page.getByRole('tablist', { name: 'Step views' }).getByRole('tab')];
  for (const group of openers) {
    const n = await group.count();
    for (let i = 0; i < n; i++) {
      await group.nth(i).click();
      await settle(page);
      if (await page.locator(sel).count()) return;
      await page.keyboard.press('Escape');
    }
  }
}
/** waitForSelector for something that may live in another workspace tab. */
export async function waitFor(page: Page, sel: string, timeout: number) {
  await reveal(page, sel);
  await page.waitForSelector(sel, { timeout });
}

/** A button of the step workspace, found in whichever tab holds it. */
export async function stepButton(page: Page, name: string | RegExp, role: 'button' | 'radio' = 'button') {
  // A button of the open ribbon; the last one is the one in front.
  const find = () => page.getByRole(role, { name }).last();
  if (await find().count()) return find();
  const openers = [page.getByRole('tablist', { name: 'Step views' }).getByRole('tab')];
  for (const group of openers) {
    const total = await group.count();
    for (let i = 0; i < total; i++) {
      await group.nth(i).click();
      await settle(page);
      if (await find().count()) return find();
      await page.keyboard.press('Escape');
    }
  }
  return find();
}
export const text = async (page: Page, sel: string) => {
  await reveal(page, sel);
  return page.locator(sel).allInnerTexts().then((t) => t.join('\n'));
};

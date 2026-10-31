// Read-only performance and visual harness for a built OSRS Path page (no repo writes); results go to stdout as JSON.
// Usage: AUDIT_OUT=<dir> npm run perf -- <repoRoot> <distDir> <port> <timing|switches|shots|selprobe|fonts>
//   timing: cold start, page switches and per-update script time; run twice per build and compare with scripts/perf-compare.mjs.
//   switches: page switches only (SWITCH_IDLE=2500). shots: screenshots to $AUDIT_OUT/shots-$SHOTS_LABEL for scripts/pixeldiff.mjs
//   (SHOT_W, SHOT_S, SHOT_R narrow widths, scales, routes). selprobe: do the selectors in $AUDIT_OUT/removed-selectors.json match anything.
//   fonts: font files requested and the families text renders in.
// Needs: npm ci in <root>, a build in <distDir>, Chromium (CHROMIUM_PATH or Playwright default). Avoid ports on the Fetch bad-port list (e.g. 4190).
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
const [,, ROOT, DIST, PORT, MODE = 'timing'] = process.argv;
const require = createRequire(ROOT + '/package.json');
const { chromium } = require('playwright');
const BASE = `http://127.0.0.1:${PORT}/`;
const OUT = process.env.AUDIT_OUT || process.cwd();
const steps = JSON.parse(readFileSync(`${ROOT}/src/data/steps.json`, 'utf8'));
const progressBefore = (id, extra = {}) => { const ids = steps.map(s => s.id); return { version: 3, steps: Object.fromEntries(ids.slice(0, ids.indexOf(id)).map(s => [s, 'done'])), levels: {}, notes: {}, updatedAt: '2026-09-27T10:00:00.000Z', gameMode: 'f2p', ...extra }; };
const stats = { attack: 40, strength: 44, defence: 44, hitpoints: 40, ranged: 12, magic: 25, prayer: 15, woodcutting: 30, fishing: 30, cooking: 30, mining: 30, smithing: 20, crafting: 20, firemaking: 30, runecraft: 10 };
const equipment = [[1329, 'Mithril scimitar', 'weapon'], [1153, 'Iron full helm', 'head'], [1115, 'Iron platebody', 'body'], [1081, 'Iron plateskirt', 'legs'], [1191, 'Iron kiteshield', 'shield']].map(([id, name, slot]) => ({ id, name, slot, count: 1 }));
const inventory = [{ id: 1351, name: 'Bronze axe', count: 1 }, { id: 1265, name: 'Bronze pickaxe', count: 1 }, { id: 379, name: 'Lobster', count: 10 }];
const gear = { equipment, inventory, coins: 120000, bankCoins: 50000 };
const owned = [['Bronze axe', 1, 0, 0], ['Bronze pickaxe', 1, 0, 0], ['Lobster', 10, 0, 40], ['Coins', 120000, 0, 50000], ['Iron ore', 0, 0, 100], ['Coal', 0, 0, 50], ['Air rune', 0, 0, 500], ['Mind rune', 0, 0, 300]].map(([name, carried, noted, bank]) => ({ name, carried, noted, bank }));
const mock = {
  progress: progressBefore('S6-01', { levels: stats }),
  status: { status: 'ok', inGame: true, protocol: 6, player: 'Perf fixture', activeStepId: 'S6-01', shortestPath: true, stats, ...gear },
  events: [{ type: 'STATS', stats }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items: owned }],
};
const market = JSON.parse(readFileSync(`${ROOT}/tests/funding/fixtures/market-2026-10-18.json`, 'utf8')).items;
function initScript(m) {
  const w = window; let progress = JSON.stringify(m.progress); w.__posts = [];
  w.osrsDesktop = {
    getWindowPrefs: async () => ({ alwaysOnTop: false }), setAlwaysOnTop() {},
    updates: { get: async () => ({ state: 'current', current: 'test', latest: null, notes: '', progress: 0, error: null, auto: true }), check: async () => ({ state: 'current' }), download: async () => ({ state: 'current' }), install: async () => false, setAuto() {}, onState: () => () => {} },
    loadProgressFile: () => progress, loadProfilesFile: () => null, saveProfilesFile() {}, saveProfilesFileChecked: () => ({ ok: true, error: null }),
    saveProgressFile: (j) => { progress = j; }, saveProgressFileChecked: async (j) => { progress = j; w.__saves = (w.__saves || 0) + 1; return { ok: true, error: null }; },
    dataDir: () => 'C:/OSRS', isPortable: () => true,
    runelite: { check: async () => ({ ok: true, problems: [], clientVersion: '1.12.39', credentials: true }), launch: async () => ({ ok: true, state: 'started' }) },
    bridge: {
      request: async (method, path, body) => { w.__posts.push({ method, path, size: body ? JSON.stringify(body).length : 0, t: performance.now() }); if (path === '/status') return { ok: true, status: 200, data: m.status }; return { ok: true, status: 200, data: { ok: true } }; },
      openEvents: (onEvent, onState) => { w.__emit = (e) => onEvent(JSON.stringify(e)); setTimeout(() => { onState('open'); for (const e of m.events) onEvent(JSON.stringify(e)); }, 50); return () => {}; },
    },
  };
  new PerformanceObserver((l) => { w.__long = (w.__long || []).concat(l.getEntries().map(e => ({ s: e.startTime, d: e.duration }))); }).observe({ type: 'longtask', buffered: true });
}
async function routeNet(page) {
  await page.route(/runescape\.wiki\/(?!.*prices)/, r => r.abort());
  await page.route(/maps\.runescape\.wiki/, r => r.abort());
  await page.route(/prices\.runescape\.wiki\/api\/v[12]\/osrs\/(latest|1h|mapping)/, (r) => {
    const kind = /\/osrs\/(latest|1h|mapping)/.exec(r.request().url())[1]; const now = Math.floor(Date.now() / 1000);
    if (kind === 'mapping') return r.fulfill({ json: Object.entries(market).map(([name, x]) => ({ id: x.id, name, limit: x.limit ?? undefined, members: false })) });
    if (kind === 'latest') return r.fulfill({ json: { data: Object.fromEntries(Object.values(market).map(x => [x.id, { high: x.high, highTime: now - 90, low: x.low, lowTime: now - 90 }])) } });
    return r.fulfill({ json: { timestamp: now, data: Object.fromEntries(Object.values(market).map(x => [x.id, { avgHighPrice: x.avgHigh, highPriceVolume: x.highVolume, avgLowPrice: x.avgLow, lowPriceVolume: x.lowVolume }])) } });
  });
}
async function startServer() {
  const s = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', DIST, '--host', '127.0.0.1', '--port', PORT, '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 400; i++) { if (await fetch(BASE).then(r => r.ok).catch(() => false)) return s; await new Promise(r => setTimeout(r, 150)); }
  throw new Error('server down');
}
const metrics = async (cdp) => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const ROUTES = ['#/path', '#/skills', '#/skills/RA/ranged', '#/gear', '#/shopping', '#/journal', '#/money', '#/reference', '#/settings'];
const server = await startServer();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', ...(opts.bypassCSP ? { bypassCSP: true } : {}) });
  await ctx.addInitScript(initScript, mock);
  const page = await ctx.newPage(); await routeNet(page);
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  const cdp = await ctx.newCDPSession(page); await cdp.send('Performance.enable');
  return { ctx, page, cdp, errors };
}
const idle = (page, ms = 1500) => page.waitForTimeout(ms);
const out = {};
if (MODE === 'timing') {
  // 1) Cold start per route, 5 runs each (fresh context = no HTTP cache, like a first app start).
  out.cold = {};
  for (const r of ['#/path', '#/shopping', '#/skills/RA/ranged']) {
    const runs = [];
    for (let i = 0; i < 5; i++) {
      const { ctx, page, cdp } = await newPage();
      const reqs = []; page.on('requestfinished', async (q) => { try { const s = await q.sizes(); reqs.push({ url: q.url().replace(BASE, ''), bytes: s.responseBodySize }); } catch {} });
      await page.goto(BASE + r, { waitUntil: 'load' });
      await page.waitForSelector('main, .la-root', { timeout: 15000 });
      await idle(page, 2500);
      const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; const fcp = performance.getEntriesByName('first-contentful-paint')[0]; return { dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd, fcp: fcp?.startTime ?? null, long: (window.__long || []), heap: performance.memory?.usedJSHeapSize }; });
      const m = await metrics(cdp);
      runs.push({ dcl: nav.dcl, load: nav.load, fcp: nav.fcp, longSum: nav.long.reduce((s, x) => s + x.d, 0), longMax: Math.max(0, ...nav.long.map(x => x.d)), tbt: nav.long.reduce((s, x) => s + Math.max(0, x.d - 50), 0), script: m.ScriptDuration * 1000, layout: m.LayoutDuration * 1000, style: m.RecalcStyleDuration * 1000, task: m.TaskDuration * 1000, heapMB: m.JSHeapUsedSize / 1048576, reqs });
      await ctx.close();
    }
    const k = (f) => +med(runs.map(f)).toFixed(1);
    out.cold[r] = { dcl: k(x => x.dcl), load: k(x => x.load), fcp: k(x => x.fcp), longSum: k(x => x.longSum), longMax: k(x => x.longMax), tbt: k(x => x.tbt), scriptMs: k(x => x.script), layoutMs: k(x => x.layout), styleMs: k(x => x.style), taskMs: k(x => x.task), heapMB: k(x => x.heapMB) };
    if (r === '#/path') out.requests = runs[0].reqs.filter(q => !/prices/.test(q.url)).sort((a, b) => b.bytes - a.bytes).slice(0, 15);
  }
  // 2) In-session page switches (warm), 3 rounds; cost = main-thread task time until idle.
  const { ctx, page, cdp, errors } = await newPage();
  await page.goto(BASE + '#/path', { waitUntil: 'load' }); await idle(page, 3000);
  out.switch = {};
  for (let round = 0; round < 3; round++) for (const r of ROUTES) {
    await page.evaluate(() => { window.__long = []; });
    const a = await metrics(cdp); const t0 = Date.now();
    await page.evaluate((h) => { location.hash = h; }, r); await idle(page, 1200);
    const b = await metrics(cdp); const long = await page.evaluate(() => window.__long || []);
    (out.switch[r] ||= []).push({ task: (b.TaskDuration - a.TaskDuration) * 1000, script: (b.ScriptDuration - a.ScriptDuration) * 1000, style: (b.RecalcStyleDuration - a.RecalcStyleDuration) * 1000, layout: (b.LayoutDuration - a.LayoutDuration) * 1000, longMax: Math.max(0, ...long.map(x => x.d)) });
  }
  for (const r of ROUTES) { const xs = out.switch[r]; out.switch[r] = { taskMs: +med(xs.map(x => x.task)).toFixed(1), scriptMs: +med(xs.map(x => x.script)).toFixed(1), styleMs: +med(xs.map(x => x.style)).toFixed(1), layoutMs: +med(xs.map(x => x.layout)).toFixed(1), longMaxMs: +med(xs.map(x => x.longMax)).toFixed(1) }; }
  // 3) Per game-event cost on representative pages: alternate coins (GEAR) and a stats change; 8 events each.
  out.events = {};
  for (const r of ['#/path', '#/shopping', '#/gear', '#/skills/RA/ranged']) {
    await page.evaluate((h) => { location.hash = h; }, r); await idle(page, 1500);
    for (const kind of ['XP', 'GEAR', 'STATS', 'OWNED']) {
      const xs = [];
      for (let i = 0; i < 8; i++) {
        const before = await page.evaluate(() => window.__posts.length);
        const a = await metrics(cdp);
        await page.evaluate(({ kind, i, gear, stats, owned }) => {
          const e = kind === 'XP' ? { type: 'XP', xp: { woodcutting: 13363 + i * 25, attack: 37224, strength: 50339, defence: 50339, hitpoints: 37224 } } : kind === 'GEAR' ? { type: 'GEAR', gear: { ...gear, coins: gear.coins + (i % 2 ? 1000 : -1000) } }
            : kind === 'STATS' ? { type: 'STATS', stats: { ...stats, woodcutting: stats.woodcutting + (i % 2) } }
            : { type: 'OWNED', bankSeen: true, items: owned.map(o => o.name === 'Lobster' ? { ...o, bank: o.bank + (i % 2 ? 1 : -1) } : o) };
          window.__emit(e);
        }, { kind, i, gear, stats, owned });
        await idle(page, 700);
        const b = await metrics(cdp);
        const posts = await page.evaluate((n) => window.__posts.slice(n).map(p => p.path + ':' + p.size), before);
        xs.push({ task: (b.TaskDuration - a.TaskDuration) * 1000, script: (b.ScriptDuration - a.ScriptDuration) * 1000, posts });
      }
      out.events[`${r} ${kind}`] = { taskMs: +med(xs.map(x => x.task)).toFixed(1), scriptMs: +med(xs.map(x => x.script)).toFixed(1), bridgePostsPerEvent: med(xs.map(x => x.posts.length)), samplePosts: xs[3].posts.slice(0, 8) };
    }
  }
  // 4) Idle cost: 10 s with no input (polling/timers), and bridge requests during it.
  await page.evaluate(() => { location.hash = '#/path'; }); await idle(page, 2000);
  { const n0 = await page.evaluate(() => window.__posts.length); const a = await metrics(cdp); await idle(page, 10000); const b = await metrics(cdp);
    const posts = await page.evaluate((n) => window.__posts.slice(n).map(p => p.method + ' ' + p.path), n0);
    const byPath = {}; for (const p of posts) byPath[p] = (byPath[p] || 0) + 1;
    out.idle10s = { taskMs: +((b.TaskDuration - a.TaskDuration) * 1000).toFixed(1), scriptMs: +((b.ScriptDuration - a.ScriptDuration) * 1000).toFixed(1), bridgeRequests: byPath, saves: await page.evaluate(() => window.__saves || 0) }; }
  out.errors = errors.slice(0, 5);
  await ctx.close();
}

if (MODE === 'fonts') {
  const { ctx, page } = await newPage();
  const fontReqs = new Set(); page.on('request', (q) => { if (/\.(ttf|woff2?|otf)(\?|$)/.test(q.url())) fontReqs.add(q.url().replace(BASE, '')); });
  const fams = {};
  await page.goto(BASE + '#/path', { waitUntil: 'load' }); await idle(page, 2500);
  for (const r of ROUTES) {
    await page.evaluate((h) => { location.hash = h; }, r); await idle(page, 1500);
    const f = await page.evaluate(() => { const c = {}; for (const el of document.querySelectorAll('body *')) { if (!el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue; const ff = getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim(); c[ff] = (c[ff] || 0) + 1; } return c; });
    for (const [k, v] of Object.entries(f)) fams[k] = (fams[k] || 0) + v;
  }
  // Dialogs too: the wiki dossier drawer and the full world map (fonts inside dialogs and form controls).
  const famsOf = () => page.evaluate(() => { const c = {}; for (const el of document.querySelectorAll('dialog[open] *, input, select, textarea, button')) { const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) || /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName); if (!own) continue; const ff = getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim(); c[ff] = (c[ff] || 0) + 1; } return c; });
  const dialogs = {};
  try {
    await page.evaluate(() => { location.hash = '#/step/S2-10'; }); await idle(page, 1500);
    await page.getByRole('tablist', { name: 'Step views' }).getByRole('tab', { name: /Details/i }).click({ timeout: 3000 });
    await page.locator('.npc-name').first().click({ timeout: 3000 }); await page.waitForSelector('dialog.drawer[open]', { timeout: 5000 });
    dialogs.dossier = await famsOf(); await page.keyboard.press('Escape'); await idle(page, 500);
  } catch (e) { dialogs.dossier = 'not opened: ' + String(e).slice(0, 80); }
  try {
    await page.getByRole('button', { name: /World map/i }).first().click({ timeout: 3000 }); await page.waitForSelector('dialog.map-modal[open]', { timeout: 5000 });
    dialogs.worldMap = await famsOf(); await page.keyboard.press('Escape'); await idle(page, 500);
  } catch (e) { dialogs.worldMap = 'not opened: ' + String(e).slice(0, 80); }
  try { await page.evaluate(() => { location.hash = '#/settings'; }); await idle(page, 1200); dialogs.settingsControls = await famsOf(); } catch (e) { dialogs.settingsControls = String(e).slice(0, 80); }
  const loaded = await page.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.style + ' ' + f.weight));
  out.dialogFonts = dialogs;
  out.fonts = { requested: [...fontReqs], firstFamilyOfTextElements: fams, loadedFaces: loaded };
  await ctx.close();
}

if (MODE === 'shots') {
  // V1: deterministic screenshots of every route at 2 widths x 2 scales, animations off, fonts loaded. Writes $AUDIT_OUT/shots-<SHOTS_LABEL>/.
  const { mkdirSync } = await import('node:fs');
  const dir = `${OUT}/shots-${process.env.SHOTS_LABEL || 'run'}`; mkdirSync(dir, { recursive: true }); let n = 0;
  for (const width of (process.env.SHOT_W ? [Number(process.env.SHOT_W)] : [1000, 1440])) for (const scale of (process.env.SHOT_S ? [Number(process.env.SHOT_S)] : [1, 1.25])) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: scale, colorScheme: 'dark', reducedMotion: 'reduce' });
    await ctx.addInitScript(initScript, mock); const page = await ctx.newPage(); await routeNet(page);
    await page.goto(BASE + '#/path', { waitUntil: 'load' }); await idle(page, 2500);
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
    for (const r of (process.env.SHOT_R ? process.env.SHOT_R.split(',') : ROUTES)) {
      await page.evaluate((h) => { location.hash = h; }, r); await idle(page, 1500); await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `${dir}/${r.replace(/[#/]/g, '_')}-${width}-${scale}.png`, fullPage: true }); n++;
    }
    await ctx.close();
  }
  out.shots = { dir, count: n };
}

if (MODE === 'selprobe') {
  // Which of the selectors in $AUDIT_OUT/removed-selectors.json match anything on any route (false "dead" CSS).
  const sels = JSON.parse(readFileSync(`${OUT}/removed-selectors.json`, 'utf8')); const hit = new Map();
  const { ctx, page } = await newPage();
  await page.goto(BASE + '#/path', { waitUntil: 'load' }); await idle(page, 2500);
  for (const r of ['#/path', ...ROUTES]) { await page.evaluate((h) => { location.hash = h; }, r); await idle(page, 1500);
    const m = await page.evaluate((ss) => ss.filter((s) => { try { return document.querySelector(s.replace(/::?(before|after|placeholder|marker|selection|-webkit-[\w-]+)/g, '')) !== null; } catch { return false; } }), sels);
    for (const s of m) hit.set(s, (hit.get(s) || new Set()).add(r)); }
  out.selprobe = { tested: sels.length, matching: hit.size, examples: [...hit.keys()].slice(0, 25) };
  await ctx.close();
}

if (MODE === 'switches') {
  // Warm page switches only: 6 rounds over all routes; median task/script/style/layout ms per route.
  const { ctx, page, cdp } = await newPage();
  await page.goto(BASE + '#/path', { waitUntil: 'load' }); await idle(page, 3000);
  const acc = {};
  for (let round = 0; round < 6; round++) for (const r of ROUTES) {
    const a = await metrics(cdp); await page.evaluate((h) => { location.hash = h; }, r); await idle(page, +(process.env.SWITCH_IDLE || 1000)); const b = await metrics(cdp);
    (acc[r] ||= []).push({ task: (b.TaskDuration - a.TaskDuration) * 1000, script: (b.ScriptDuration - a.ScriptDuration) * 1000, style: (b.RecalcStyleDuration - a.RecalcStyleDuration) * 1000, layout: (b.LayoutDuration - a.LayoutDuration) * 1000 });
  }
  out.switches = Object.fromEntries(Object.entries(acc).map(([r, xs]) => [r, { task: +med(xs.map((x) => x.task)).toFixed(1), script: +med(xs.map((x) => x.script)).toFixed(1), style: +med(xs.map((x) => x.style)).toFixed(1), layout: +med(xs.map((x) => x.layout)).toFixed(1) }]));
  await ctx.close();
}
await browser.close(); server.kill();
console.log(JSON.stringify(out, null, 1));

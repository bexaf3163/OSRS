import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4180', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1000, height: 1500 } });
const prices = { 556: 6, 558: 3, 555: 6, 557: 6, 554: 6, 563: 120, 1381: 1542, 1383: 1500, 1385: 1500, 1387: 940, 1739: 125 };
await ctx.addInitScript(() => {
  const w = window;
  w.osrsDesktop = { getZoom: async () => ({ zoom: 1, autoZoom: false, effective: 1, alwaysOnTop: false }), setZoom() {}, setAlwaysOnTop() {}, onZoom: () => () => {}, loadProgressFile: () => null, saveProgressFile() {}, dataDir: () => 'C:/OSRS', isPortable: () => true,
    runelite: { check: async () => ({ ok: true, problems: [] }), launch: async () => ({ ok: true }) },
    bridge: { request: async () => ({ ok: true, status: 200, data: { status: 'ok', inGame: true, protocol: 5, pluginVersion: '2.12.1', stats: { magic: 10, attack: 5, strength: 5, defence: 5, woodcutting: 15, mining: 12 }, xp: { magic: 1200 }, coins: 2300, bankCoins: 0, equipment: [], inventory: [] } }), openEvents: (e, s) => { setTimeout(() => s('open'), 50); return () => {}; } } };
});
const page = await ctx.newPage();
await page.route(/runescape\.wiki/, (r) => r.abort());
const data = Object.fromEntries(Object.entries(prices).map(([id, p]) => [id, { high: p, highTime: 1, low: p, lowTime: 1 }]));
await page.route(/prices\.runescape\.wiki\/api\/v1\/osrs\/latest/, (r) => r.fulfill({ json: { data } }));
await page.goto('http://127.0.0.1:4180/#/step/S2-04');
await page.waitForTimeout(1500);
await page.locator('.money-plan summary').click();
await page.locator('.money-plan').scrollIntoViewIfNeeded();
await page.screenshot({ path: 'zz_shot.png' });
await b.close(); server.kill();

// An end-to-end check of the real Electron: the window opens, the bridge answers, the progress is written to disk as a file.
// Run: npm run build && npm run test:e2e (a display is needed — it does not run on CI; locally on Windows/Mac/Linux).
//
// Safety: the data and "AppData" are in a temporary folder, RuneLite is not started (LOCALAPPDATA is empty), and the app's bridge
// looks at a stub on a free port (OSRS_PUT_BRIDGE_PORT) — it does not go to the player's real plugin.

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const electronPath = require('electron') as unknown as string;
const root = fileURLToPath(new URL('..', import.meta.url));
const failures: string[] = [];
const expect = (cond: boolean, what: string) => {
  if (cond) console.log(`  ✓ ${what}`);
  else { console.log(`  ✗ ${what}`); failures.push(what); }
};

// --- The plugin stub ---
const status = {
  status: 'ok', inGame: true, protocol: 6, pluginVersion: '2.48.3', shortestPath: false, player: 'E2E Tester',
  stats: { magic: 10, woodcutting: 15, attack: 5, strength: 5, defence: 5 }, xp: { magic: 1200 }, questsDone: ['Rune Mysteries'],
  pos: { x: 3222, y: 3218, plane: 0 }, coins: 500, equipment: [], inventory: [],
};
const posts: string[] = [];
const bridge = http.createServer((req, res) => {
  if (req.headers['x-osrs-path'] !== '1') { res.writeHead(403).end(); return; }
  if (req.url === '/status') { res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(status)); return; }
  if (req.url === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    res.write(`data: ${JSON.stringify({ type: 'STATUS', inGame: true, player: status.player })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'STATS', stats: status.stats })}\n\n`);
    return;
  }
  posts.push(`${req.method} ${req.url}`);
  res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
});
await new Promise<void>((r) => bridge.listen(0, '127.0.0.1', r));
const bridgePort = (bridge.address() as { port: number }).port;

// --- Launch ---
const home = mkdtempSync(join(tmpdir(), 'osrs-put-e2e-'));
const probe = http.createServer();
await new Promise<void>(r => probe.listen(0, '127.0.0.1', r));
const cdpPort = (probe.address() as { port:number }).port;
await new Promise<void>(r => probe.close(() => r()));
const app: ChildProcess = spawn(electronPath, ['.', `--remote-debugging-port=${cdpPort}`], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, USERPROFILE: home, HOME: home, APPDATA: join(home, 'appdata'), LOCALAPPDATA: home, OSRS_PUT_E2E_ROOT: home, PORTABLE_EXECUTABLE_DIR: home, OSRS_PUT_BRIDGE_PORT: String(bridgePort) },
});
let startupLog = '';
app.stdout?.on('data', data => { startupLog += String(data); });
app.stderr?.on('data', data => { startupLog += String(data); });

function stop() {
  try {
    if (process.platform === 'win32' && app.pid && app.exitCode === null) spawnSync('taskkill', ['/T', '/F', '/PID', String(app.pid)]);
    else app.kill('SIGKILL');
  } catch { /* already closed */ }
  bridge.close();
  if (dirname(resolve(home)) !== resolve(tmpdir()) || !home.startsWith(join(tmpdir(), 'osrs-put-e2e-'))) throw new Error('Unsafe temporary cleanup path');
  try { rmSync(home, { recursive: true, force: true }); } catch { /* busy — not a problem */ }
}

try {
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    try { up = (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).ok; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  if (!up) throw new Error(`Electron did not come up (exit ${app.exitCode}): ${startupLog.slice(-4000)}`);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
  const page = browser.contexts()[0].pages()[0];
  await page.waitForURL(url => url.href.startsWith(pathToFileURL(join(root, 'dist', 'index.html')).href));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errors.push(m.text()); });
  await page.waitForLoadState('load');
  await page.waitForTimeout(2500);

  expect((await page.title()).includes('OSRS Path'), 'window: the title "OSRS Path"');
  const api = await page.evaluate(() => Object.keys((window as unknown as { osrsDesktop?: object }).osrsDesktop ?? {}).sort());
  expect(['backup', 'bridge', 'loadProgressFile', 'saveProgressFile'].every((k) => api.includes(k)), `window: the shell API is in place (${api.length} methods)`);
  const localFont = await page.evaluate(async () => {
    const faces = await document.fonts.load('16px Inter');
    return faces.some(face => face.family === 'Inter' && face.status === 'loaded');
  });
  expect(localFont, 'window: the bundled Inter font loads from the local build');
  for (const route of ['skills', 'gear', 'shopping', 'journal', 'reference', 'settings']) {
    await page.evaluate(route => { location.hash = `#/${route}`; }, route);
    await page.waitForTimeout(400);
    expect((await page.locator('main').innerText()).trim().length > 0, `workspace: ${route} opens in the real desktop shell`);
  }

  // The bridge: the current protocol and an isolated test character.
  await page.evaluate(() => { location.hash = '#/settings'; });
  await page.waitForTimeout(1500);
  await page.getByRole('tab', { name: 'RuneLite', exact: true }).click();
  const settings = await page.locator('main').innerText();
  expect(settings.includes('E2E Tester'), 'bridge: the character name from the plugin is visible in the settings');
  await page.getByRole('tab', { name: 'Progress and copies', exact:true }).click();
  expect((await page.locator('main').innerText()).includes('Character profiles'), 'settings: character profiles are accessible');
  await page.getByRole('tab', { name:'App', exact:true }).click();
  expect((await page.locator('main').innerText()).includes('Diagnostics'), 'settings: diagnostics are accessible');

  // The progress: a step mark goes into progress.json with an atomic write.
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForTimeout(1000);
  // The wide layout has a "Done" button on the open step; the narrow list has a checkbox on every step.
  await page.getByRole('button', { name: /^(Done|Mark as done|Mark as manually completed)/ }).first().click();
  await page.waitForTimeout(2500);
  const file = join(home, 'OSRS-Put-data', 'progress.json');
  expect(existsSync(file), 'progress: progress.json was created in the data folder');
  const saved = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { steps?: Record<string, string> }) : {};
  expect(Object.values(saved.steps ?? {}).includes('done'), 'progress: the marked step is in the file');
  expect(!existsSync(`${file}.tmp`), 'progress: no temporary write file is left');

  expect(!errors.length, `console: no errors ${errors.join('; ')}`);
  await browser.close();
} catch (e) {
  failures.push(`run failure: ${(e as Error).message}`);
  console.log(`  ✗ run failure: ${(e as Error).message}`);
} finally {
  stop();
}

console.log(failures.length ? `\nFailed: ${failures.length}` : '\nTotal: everything passed');
process.exit(failures.length ? 1 : 0);

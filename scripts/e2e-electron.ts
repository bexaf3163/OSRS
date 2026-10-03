// Сквозная проверка настоящего Electron: окно открывается, мост отвечает, прогресс пишется файлом на диск.
// Запуск: npm run build && npm run test:e2e (нужен дисплей — на CI не запускается; локально Windows/Mac/Linux).
//
// Безопасность: данные и «AppData» — во временной папке, RuneLite не запускается (LOCALAPPDATA пуст), а мост
// программы смотрит на заглушку на свободном порту (OSRS_PUT_BRIDGE_PORT) — к настоящему плагину игрока не ходит.

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const electronPath = require('electron') as unknown as string;
const root = fileURLToPath(new URL('..', import.meta.url));
const failures: string[] = [];
const expect = (cond: boolean, what: string) => {
  if (cond) console.log(`  ✓ ${what}`);
  else { console.log(`  ✗ ${what}`); failures.push(what); }
};

// --- Заглушка плагина ---
const status = {
  status: 'ok', inGame: true, protocol: 5, pluginVersion: '2.14.1', shortestPath: false, player: 'E2E Tester',
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

// --- Запуск ---
const home = mkdtempSync(join(tmpdir(), 'osrs-put-e2e-'));
const cdpPort = 9400 + Math.floor(Math.random() * 400);
const app: ChildProcess = spawn(electronPath, ['.', `--remote-debugging-port=${cdpPort}`], {
  cwd: root, stdio: 'ignore',
  env: { ...process.env, LOCALAPPDATA: home, PORTABLE_EXECUTABLE_DIR: home, OSRS_PUT_BRIDGE_PORT: String(bridgePort) },
});

function stop() {
  try {
    if (process.platform === 'win32' && app.pid) spawnSync('taskkill', ['/T', '/F', '/PID', String(app.pid)]);
    else app.kill('SIGKILL');
  } catch { /* уже закрыт */ }
  bridge.close();
  try { rmSync(home, { recursive: true, force: true }); } catch { /* занят — не страшно */ }
}

try {
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    try { up = (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).ok; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  if (!up) throw new Error('Electron не поднялся');
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
  const page = browser.contexts()[0].pages()[0];
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errors.push(m.text()); });
  await page.waitForLoadState('load');
  await page.waitForTimeout(2500);

  expect((await page.title()).includes('OSRS Путь'), 'окно: заголовок «OSRS Путь»');
  const api = await page.evaluate(() => Object.keys((window as unknown as { osrsDesktop?: object }).osrsDesktop ?? {}).sort());
  expect(['backup', 'bridge', 'loadProgressFile', 'saveProgressFile'].every((k) => api.includes(k)), `окно: API оболочки на месте (${api.length} методов)`);

  // Мост: заглушка видна как плагин 2.14.1, персонаж привязан.
  await page.evaluate(() => { location.hash = '#/settings'; });
  await page.waitForTimeout(1500);
  const settings = await page.locator('main').innerText();
  expect(settings.includes('E2E Tester'), 'мост: имя персонажа из плагина видно в настройках');
  expect(settings.includes('Профили персонажей') && settings.includes('Диагностика'), 'настройки: профили и диагностика на месте');

  // Прогресс: отметка шага уходит в progress.json атомарной записью.
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForTimeout(1000);
  await page.locator('.step input[type="checkbox"]').first().check();
  await page.waitForTimeout(2500);
  const file = join(home, 'OSRS-Put-data', 'progress.json');
  expect(existsSync(file), 'прогресс: progress.json создан в папке данных');
  const saved = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { steps?: Record<string, string> }) : {};
  expect(Object.values(saved.steps ?? {}).includes('done'), 'прогресс: отмеченный шаг лежит в файле');
  expect(!existsSync(`${file}.tmp`), 'прогресс: временного файла записи не осталось');

  expect(!errors.length, `консоль: ошибок нет ${errors.join('; ')}`);
  await browser.close();
} catch (e) {
  failures.push(`сбой прогона: ${(e as Error).message}`);
  console.log(`  ✗ сбой прогона: ${(e as Error).message}`);
} finally {
  stop();
}

console.log(failures.length ? `\nНе прошло: ${failures.length}` : '\nИтог: всё прошло');
process.exit(failures.length ? 1 : 0);

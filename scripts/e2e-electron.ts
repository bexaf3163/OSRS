// An end-to-end check of the real Electron: the window opens, the bridge answers, the progress is written to disk as a file.
// Run: npm run build && npm run test:e2e (a display is needed; Windows CI also checks the packaged EXE).
// A release candidate: E2E_EXE=<path to OSRS-Put-x.y.z-portable.exe> npm run test:e2e (the exe in a folder of its own).
//
// Safety: the data and "AppData" are in a temporary folder, RuneLite is not started (LOCALAPPDATA is empty), and the app's bridge
// looks at a stub on a free port (OSRS_PUT_BRIDGE_PORT) — it does not go to the player's real plugin.

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const electronPath = require('electron') as unknown as string;
const root = fileURLToPath(new URL('..', import.meta.url));
const packageVersion = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {version:string}).version;
const failures: string[] = [];
const expect = (cond: boolean, what: string) => {
  if (cond) console.log(`  ✓ ${what}`);
  else { console.log(`  ✗ ${what}`); failures.push(what); }
};

// --- A release candidate (E2E_EXE) ---
// The packaged portable exe instead of the source tree's Electron, with the same isolation. Its launcher always sets PORTABLE_EXECUTABLE_DIR to
// the exe's own folder, so the data goes next to the exe: the folder must hold nothing but the exe (never a player's download folder), and the
// data the run made there is removed afterwards. A fresh build only: a copy of the exe the player is running would unpack over its folder.
const exe = process.env.E2E_EXE ? resolve(process.env.E2E_EXE) : undefined;
if (exe) {
  const others = existsSync(exe) ? readdirSync(dirname(exe)).filter((name) => name.toLowerCase() !== basename(exe).toLowerCase()) : [];
  if (!existsSync(exe) || others.length) {
    console.log(existsSync(exe) ? `E2E_EXE must be alone in its folder (also there: ${others.join(', ')}): the run writes OSRS-Put-data next to it.` : `E2E_EXE not found: ${exe}`);
    process.exit(1);
  }
  console.log(`  (packaged: ${exe})`);
}

/** The processes a launcher started (Windows), with their exe paths: the portable exe runs the app from an unpacked copy in TEMP. */
function childProcs(pid: number): { pid: number; path: string }[] {
  const out = spawnSync('powershell.exe', ['-NoProfile', '-Command',
    `Get-CimInstance Win32_Process -Filter 'ParentProcessId=${pid}' | ForEach-Object { '{0}|{1}' -f $_.ProcessId, $_.ExecutablePath }`], { encoding: 'utf8' }).stdout ?? '';
  return out.split(/\r?\n/).map((line) => line.trim().split('|')).filter(([id, path]) => Number(id) > 0 && Boolean(path)).map(([id, path]) => ({ pid: Number(id), path }));
}

/** Removes a folder of this run. Processes ended by force hold their files for a moment after taskkill returns, and rmSync gives up on such a
 *  lock at once (EPERM), so it is tried again for up to ten seconds. */
function removeDir(dir: string) {
  for (let i = 1; ; i++) {
    try { rmSync(dir, { recursive: true, force: true }); return; } catch (e) {
      if (i === 20) { console.log(`  (left in place: ${(e as Error).message})`); return; }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    }
  }
}

/** Whether any process still runs from the folder: a copy something else runs is never removed. */
const runningFrom = (dir: string) =>
  (spawnSync('powershell.exe', ['-NoProfile', '-Command', `@(Get-Process | Where-Object { $_.Path -like '${dir}\*' }).Count`], { encoding: 'utf8' }).stdout ?? '').trim() !== '0';

// --- The plugin stub ---
const status = {
  status: 'ok', inGame: true, protocol: 6, pluginVersion: packageVersion, shortestPath: false, player: 'E2E Tester',
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
const dataDir = join(exe ? dirname(exe) : home, 'OSRS-Put-data');
const probe = http.createServer();
await new Promise<void>(r => probe.listen(0, '127.0.0.1', r));
const cdpPort = (probe.address() as { port:number }).port;
await new Promise<void>(r => probe.close(() => r()));
const app: ChildProcess = spawn(exe ?? electronPath, exe ? [`--remote-debugging-port=${cdpPort}`] : ['.', `--remote-debugging-port=${cdpPort}`], {
  cwd: exe ? dirname(exe) : root, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, USERPROFILE: home, HOME: home, APPDATA: join(home, 'appdata'), LOCALAPPDATA: home, OSRS_PUT_E2E_ROOT: home, PORTABLE_EXECUTABLE_DIR: home, OSRS_PUT_BRIDGE_PORT: String(bridgePort) },
});
let startupLog = '';
app.stdout?.on('data', data => { startupLog += String(data); });
app.stderr?.on('data', data => { startupLog += String(data); });

// The candidate's unpacked copy (TEMP\<build id>): the launcher removes it when the app ends; what is still locked then goes in stop().
let unpacked: string | undefined;

function stop() {
  try {
    if (process.platform === 'win32' && app.pid && app.exitCode === null) {
      // A portable exe: the app under the launcher is ended first, so the launcher removes its unpacked copy and temporary files itself
      // (ending the launcher leaves about 800 MB in TEMP).
      if (exe) {
        for (const p of childProcs(app.pid)) spawnSync('taskkill', ['/T', '/F', '/PID', String(p.pid)]);
        spawnSync('powershell.exe', ['-NoProfile', '-Command', `Wait-Process -Id ${app.pid} -Timeout 90 -ErrorAction SilentlyContinue`]);
      }
      spawnSync('taskkill', ['/T', '/F', '/PID', String(app.pid)]);
    } else app.kill('SIGKILL');
  } catch { /* already closed */ }
  bridge.close();
  if (dirname(resolve(home)) !== resolve(tmpdir()) || !home.startsWith(join(tmpdir(), 'osrs-put-e2e-'))) throw new Error('Unsafe temporary cleanup path');
  removeDir(home);
  // The candidate's folder held only the exe, so the data next to it is this run's.
  if (exe) removeDir(dataDir);
  if (unpacked && existsSync(join(unpacked, 'OSRS Path.exe')) && !runningFrom(unpacked)) removeDir(unpacked);
}

try {
  let up = false;
  // A portable exe first unpacks itself (about 100 MB): it gets two minutes, the source tree thirty seconds.
  for (let i = 0; i < (exe ? 240 : 60) && !up; i++) {
    try { up = (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).ok; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  if (!up) throw new Error(`Electron did not come up (exit ${app.exitCode}): ${startupLog.slice(-4000)}`);
  if (exe && app.pid) unpacked = childProcs(app.pid).map((p) => dirname(p.path)).find((dir) => dirname(resolve(dir)) === resolve(tmpdir()));
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
  const page = browser.contexts()[0].pages()[0];
  // The source tree serves its own dist/; a release candidate the dist/ inside its app.asar.
  await page.waitForURL(url => exe
    ? url.protocol === 'file:' && /\/resources\/app\.asar\/dist\/index\.html$/.test(url.pathname)
    : url.href.startsWith(pathToFileURL(join(root, 'dist', 'index.html')).href));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errors.push(m.text()); });
  await page.waitForLoadState('load');
  await page.waitForTimeout(2500);

  expect((await page.title()).includes('OSRS Path'), 'window: the title "OSRS Path"');
  const api = await page.evaluate(() => Object.keys((window as unknown as { osrsDesktop?: object }).osrsDesktop ?? {}).sort());
  expect(['backup', 'bridge', 'loadProgressFile', 'saveProgressFile', 'saveProgressFileChecked'].every((k) => api.includes(k)), `window: the shell API is in place (${api.length} methods)`);
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
  await page.waitForSelector('.bridge-indicator.is-online');
  expect((await page.locator('main').innerText()).includes('the plugin is connected'), 'bridge: the plugin connection is shown in RuneLite settings');
  await page.getByRole('tab', { name: 'Progress and copies', exact:true }).click();
  expect((await page.locator('main').innerText()).includes('Character profiles'), 'settings: character profiles are accessible');
  expect((await page.locator('main').innerText()).includes('E2E Tester'), 'bridge: the test character is shown in character profiles');
  await page.getByRole('tab', { name:'App', exact:true }).click();
  expect((await page.locator('main').innerText()).includes('Diagnostics'), 'settings: diagnostics are accessible');

  // The progress: a step mark goes into progress.json with an atomic write.
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForTimeout(1000);
  // The cockpit has the manual-completion button next to the open walkthrough, without a tab to open first.
  await page.getByRole('button', { name: /^(Done|Mark as done|Mark as manually completed)/ }).first().click();
  await page.waitForTimeout(2500);
  const file = join(dataDir, 'progress.json');
  expect(existsSync(file), 'progress: progress.json was created in the data folder');
  const saved = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { steps?: Record<string, string> }) : {};
  expect(Object.values(saved.steps ?? {}).includes('done'), 'progress: the marked step is in the file');
  expect(!existsSync(`${file}.tmp`), 'progress: no temporary write file is left');

  // Block only this isolated run's temporary path, never the player's save. A directory
  // cannot be written as a file; the actual writer must report failure and retain the old save.
  const priorText = readFileSync(file, 'utf8');
  mkdirSync(`${file}.tmp`);
  try {
    await page.getByRole('button', { name: /^(Done|Mark as done|Mark as manually completed)/ }).first().click();
    await page.waitForSelector('.progress-storage-warning');
    expect((await page.locator('.progress-storage-warning').innerText()).includes('desktop file could not be written'), 'progress write failure: the real IPC acknowledgement exposes a failed file write');
    expect(readFileSync(file, 'utf8') === priorText, 'progress write failure: the previous native save remains intact');
  } finally { rmdirSync(`${file}.tmp`); }
  await page.getByRole('button', { name: /^(Done|Mark as done|Mark as manually completed)/ }).first().click();
  await page.waitForFunction(() => !document.querySelector('.progress-storage-warning'));
  expect(readFileSync(file, 'utf8') !== priorText, 'progress write retry: a later successful write clears the warning and persists the latest state');

  // Exercise the recovery through the native preload/file reader, not only the browser transport stub.
  await page.evaluate(() => localStorage.setItem('osrs-put:progress', '{broken'));
  await page.reload();
  await page.waitForTimeout(2500);
  const recovered = JSON.parse(readFileSync(file, 'utf8')) as { steps?: Record<string, string> };
  expect(Object.entries(saved.steps ?? {}).every(([id, value]) => recovered.steps?.[id] === value), 'progress recovery: a damaged browser record cannot erase the native file marks');
  expect(await page.evaluate(() => localStorage.getItem('osrs-put:progress:recovery:local')) === '{broken', 'progress recovery: the damaged native browser record is preserved');
  expect(await page.locator('.progress-storage-warning').count() === 0, 'progress recovery: valid native file recovery leaves saving enabled');

  // Confirm a failed physical profile rename cannot be accepted by the actual preload.
  // Only this run's disposable temporary path is blocked.
  const profilesFile = join(dataDir, 'profiles.json');
  const priorProfiles = readFileSync(profilesFile, 'utf8');
  await page.evaluate(() => { location.hash = '#/settings'; });
  await page.getByRole('tab', { name: 'Progress and copies', exact: true }).click();
  mkdirSync(`${profilesFile}.tmp`);
  try {
    await page.locator('.profile-list').getByRole('button', { name: 'Rename', exact: true }).first().click();
    await page.getByRole('textbox', { name: 'Profile name', exact: true }).fill('Confirmed native profile');
    await page.locator('.profile-list').getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForSelector('.profile-write-warning');
    expect(readFileSync(profilesFile, 'utf8') === priorProfiles, 'profile write failure: physical refusal retains original native bytes');
    expect(await page.getByRole('textbox', { name: 'Profile name', exact: true }).count() === 1, 'profile write failure: the unsaved rename stays editable');
  } finally { rmdirSync(`${profilesFile}.tmp`); }
  await page.getByRole('button', { name: 'Retry profile save', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.profile-write-warning'));
  expect(JSON.parse(readFileSync(profilesFile, 'utf8')).list[0].name === 'Confirmed native profile', 'profile write retry: physical confirmation persists the intended rename');

  // A syntactically valid list with broken rows must not normalize into Main and overwrite
  // a valid native list containing another character. All paths belong to this disposable run.
  await page.evaluate(() => (window as unknown as { osrsDesktop: { loadProfilesFile(): string | null } }).osrsDesktop.loadProfilesFile());
  const profiles = { active: 'main', list: [
    { id: 'main', name: 'Main', player: 'E2E Tester' },
    { id: 'nativealt', name: 'Native recovery alt', player: 'Alt tester' },
  ] };
  writeFileSync(profilesFile, JSON.stringify(profiles), 'utf8');
  const damagedProfiles = '{"active":"nativealt","list":[null]}';
  await page.evaluate(raw => localStorage.setItem('osrs-put:profiles', raw), damagedProfiles);
  await page.reload();
  await page.waitForTimeout(2500);
  expect(JSON.stringify(JSON.parse(readFileSync(profilesFile, 'utf8'))) === JSON.stringify(profiles), 'profile recovery: damaged browser rows cannot overwrite the native alternate-character list');
  expect(await page.evaluate(() => localStorage.getItem('osrs-put:profiles:recovery')) === damagedProfiles, 'profile recovery: the damaged browser list is retained for recovery');

  // Native damage/future formats and valid conflicting lists survive mirroring and a normal live-status poll.
  // These are disposable native files; no installed profile or real plugin is contacted.
  status.stats.magic = 99;
  const conflictingProfiles = { ...profiles, list: [...profiles.list, { id: 'onlydisk', name: 'Disk-only character', player: 'Disk tester' }] };
  for (const raw of ['{"version":99,"list":[]}', '{broken native profiles', JSON.stringify(conflictingProfiles)]) {
    await page.evaluate(() => (window as unknown as { osrsDesktop: { loadProfilesFile(): string | null } }).osrsDesktop.loadProfilesFile());
    writeFileSync(profilesFile, raw, 'utf8');
    await page.evaluate(savedProfiles => localStorage.setItem('osrs-put:profiles', JSON.stringify(savedProfiles)), profiles);
    await page.reload();
    await page.waitForTimeout(2500);
    expect(readFileSync(profilesFile, 'utf8') === raw, 'profile protection: the native original survives browser mirroring and status sync');
    expect(await page.locator('.profile-storage-warning').count() === 1, 'profile protection: the actual EXE shows the recovery warning');
    expect(JSON.parse(readFileSync(join(dataDir, 'progress.json'), 'utf8')).levels?.magic !== 99, 'profile protection: live levels do not enter a protected character profile');
  }

  // An existing unreadable native source must not look like a fresh install. A directory
  // at the file path causes a real EISDIR on both CI platforms without altering user ACLs.
  // Every path below is inside this run's disposable data directory.
  status.stats.magic = 25;
  writeFileSync(profilesFile, JSON.stringify(profiles), 'utf8');
  await page.evaluate(savedProfiles => localStorage.setItem('osrs-put:profiles', JSON.stringify(savedProfiles)), profiles);
  await page.reload();
  await page.waitForTimeout(2500);
  for (const target of [file, profilesFile]) {
    const held = `${target}.read-test`;
    if (dirname(resolve(target)) !== resolve(dataDir) || existsSync(held)) throw new Error('Unsafe native read fixture path');
    await page.evaluate(() => (window as unknown as { osrsDesktop: { loadProgressFile(): string | null } }).osrsDesktop.loadProgressFile());
    const original = readFileSync(target, 'utf8');
    renameSync(target, held);
    mkdirSync(target);
    const marker = join(target, 'preserved.txt');
    writeFileSync(marker, 'Do not replace this unreadable source');
    try {
      await page.reload();
      await page.waitForTimeout(2500);
      const warning = target === file ? '.progress-storage-warning' : '.profile-storage-warning';
      expect(await page.locator(warning).count() === 1, `native read failure (${basename(target)}): the real shell pauses saving`);
      expect(readFileSync(marker, 'utf8') === 'Do not replace this unreadable source', `native read failure (${basename(target)}): the unreadable original is untouched`);
      expect(readFileSync(held, 'utf8') === original, `native read failure (${basename(target)}): the fixture preserves all saved bytes`);
      expect(!existsSync(`${target}.tmp`), `native read failure (${basename(target)}): no replacement write is attempted`);
    } finally {
      rmSync(marker);
      rmdirSync(target);
      renameSync(held, target);
    }
    await page.reload();
    await page.waitForTimeout(2500);
    expect(await page.locator('.progress-storage-warning, .profile-storage-warning').count() === 0, `native read recovery (${basename(target)}): readable sources resume normally after reload`);
  }

  expect(!errors.length, `console: no errors ${errors.join('; ')}`);
  if (exe) {
    // A normal close: the window closes, the app quits and the launcher exits by itself.
    await page.close();
    for (let i = 0; i < 120 && app.exitCode === null; i++) await new Promise((r) => setTimeout(r, 500));
    expect(app.exitCode !== null, 'release candidate: closing the window ends the app and its launcher');
  }
  await browser.close();
} catch (e) {
  failures.push(`run failure: ${(e as Error).message}`);
  console.log(`  ✗ run failure: ${(e as Error).message}`);
} finally {
  stop();
}

console.log(failures.length ? `\nFailed: ${failures.length}` : '\nTotal: everything passed');
process.exit(failures.length ? 1 : 0);

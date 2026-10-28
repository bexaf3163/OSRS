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
import { jarEntry } from './jarEntry.ts';

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
  // T15: the plugin RuneLite is launched with is the one inside this artifact; it must be this release's build, not a stale jar.
  if (exe) {
    const jar = unpacked ? join(unpacked, 'resources', 'runelite-bridge', 'osrs-path-bridge.jar') : null;
    const server = jar && existsSync(jar) ? jarEntry(jar, 'com/osrspath/bridge/BridgeServer.class') : null;
    expect(!!server && server.readUInt32BE(0) === 0xcafebabe && server.includes(Buffer.from(packageVersion)),
      `release: the bundled plugin jar is version ${packageVersion} (${jar ?? 'unpacked folder not found'})`);
  }
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

  // A live external replacement must be reviewed, not overwritten by the next ordinary UI edit.
  const externallyChanged = JSON.parse(readFileSync(file, 'utf8'));
  externallyChanged.notes = { ...externallyChanged.notes, 'S1-01': 'External source retained' };
  externallyChanged.updatedAt = new Date().toISOString();
  const externalBytes = JSON.stringify(externallyChanged);
  writeFileSync(file, externalBytes);
  await page.getByRole('button', { name: /^(Done|Mark as done|Mark as manually completed)/ }).first().click();
  await page.waitForSelector('.progress-storage-warning');
  expect((await page.locator('.progress-storage-warning').innerText()).includes('not overwritten'),
    'external save: the normal UI explains the protected external replacement');
  expect(readFileSync(file, 'utf8') === externalBytes, 'external save: an ordinary edit preserves the unseen native bytes');
  const browserEdits = await page.evaluate(() => localStorage.getItem('osrs-put:progress'));
  expect(Boolean(browserEdits && Object.values(JSON.parse(browserEdits).steps ?? {}).includes('done')),
    'external save: working edits remain in browser storage for export');
  await page.reload();
  await page.waitForTimeout(2500);
  expect(!await page.locator('.progress-storage-warning').count(), 'external save: an explicit reload reviews the new source and resumes normal saving');
  expect(readdirSync(dirname(file)).filter(n => n.startsWith('progress.external-')).some(n => readFileSync(join(dirname(file), n), 'utf8') === externalBytes),
    'external save: reload retains the external bytes separately before normal saving resumes');

  // Exercise the recovery through the native preload/file reader, not only the browser transport stub.
  await page.evaluate(() => localStorage.setItem('osrs-put:progress', '{broken'));
  await page.reload();
  await page.waitForTimeout(2500);
  const recovered = JSON.parse(readFileSync(file, 'utf8')) as { steps?: Record<string, string> };
  expect(Object.entries(saved.steps ?? {}).every(([id, value]) => recovered.steps?.[id] === value), 'progress recovery: a damaged browser record cannot erase the native file marks');
  expect(await page.evaluate(() => localStorage.getItem('osrs-put:progress:recovery:local')) === '{broken', 'progress recovery: the damaged native browser record is preserved');
  expect(await page.locator('.progress-storage-warning').count() === 0, 'progress recovery: valid native file recovery leaves saving enabled');

  // T01, the other native cases, all in this run's disposable data folder: a damaged file beside a valid browser copy, both damaged, and a save
  // from a newer version. Each ends with a valid file and browser copy again, so the checks below start from a clean save.
  const validText = readFileSync(file, 'utf8');
  const markedIds = Object.entries(recovered.steps ?? {}).filter(([, v]) => v === 'done').map(([id]) => id);
  const clearRecovery = () => page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('osrs-put:progress:recovery')) localStorage.removeItem(k);
  });
  const reloadWith = async (fileText: string, local: string) => {
    writeFileSync(file, fileText, 'utf8');
    await clearRecovery();
    await page.evaluate(raw => localStorage.setItem('osrs-put:progress', raw), local);
    await page.reload();
    await page.waitForTimeout(2500);
  };
  const doneButtons = page.getByRole('button', { name: /^(Done|Mark as done|Mark as manually completed)/ });
  const tryMark = async () => {
    await page.evaluate(() => { location.hash = '#/'; });
    await page.waitForTimeout(800);
    if (await doneButtons.count()) await doneButtons.first().click();
    await page.waitForTimeout(2500);
  };
  const warning = page.locator('.progress-storage-warning');

  await reloadWith('{broken native file', validText);
  expect(await page.evaluate(() => localStorage.getItem('osrs-put:progress:recovery:file')) === '{broken native file', 'progress recovery (damaged file): the damaged native file is kept as a recovery copy');
  expect(await warning.count() === 0, 'progress recovery (damaged file): the valid browser copy keeps saving enabled');
  expect(readdirSync(dataDir).some((n) => n.startsWith('progress.broken-') && readFileSync(join(dataDir, n), 'utf8') === '{broken native file'), 'progress recovery (damaged file): the native reader keeps the damaged bytes as progress.broken-<time>.json');
  await tryMark();
  let rewritten: { steps?: Record<string, string> } | null = null;
  try { rewritten = JSON.parse(readFileSync(file, 'utf8')) as { steps?: Record<string, string> }; } catch { rewritten = null; }
  expect(markedIds.length > 0 && !!rewritten && markedIds.every((id) => rewritten!.steps?.[id] === 'done'), 'progress recovery (damaged file): the next save writes a valid native file with the earlier marks');

  await reloadWith('{broken native file', '{broken browser copy');
  expect(await warning.count() === 1 && (await warning.innerText()).includes('Automatic saving is paused'), 'progress recovery (both damaged): saving is paused with a warning');
  const afterLoad = readFileSync(file, 'utf8');
  expect(afterLoad === '{broken native file', `progress recovery (both damaged): loading does not overwrite the damaged native file (got ${afterLoad.slice(0, 80)})`);
  await tryMark();
  const afterMark = readFileSync(file, 'utf8');
  expect(afterMark === '{broken native file', `progress recovery (both damaged): the damaged native file is not overwritten (got ${afterMark.slice(0, 80)}; files ${readdirSync(dataDir).join(', ')})`);
  expect(await page.evaluate(() => localStorage.getItem('osrs-put:progress:recovery:local')) === '{broken browser copy', 'progress recovery (both damaged): the damaged browser copy is kept');

  const future = JSON.stringify({ ...JSON.parse(validText), version: 99 });
  await reloadWith(future, validText);
  expect(await warning.count() === 1 && (await warning.innerText()).includes('not supported'), 'progress recovery (newer version): a save from a newer version is reported as not supported');
  await tryMark();
  expect(readFileSync(file, 'utf8') === future, 'progress recovery (newer version): the newer save is never migrated or overwritten');

  // Back to a clean, valid save for the rest of the run.
  await reloadWith(validText, validText);
  await page.waitForFunction(() => !document.querySelector('.progress-storage-warning'));
  expect(await warning.count() === 0, 'progress recovery: a valid save again clears the warning');

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
  const conflictingProfiles = { ...profiles, list: [...profiles.list, { id: 'onlydisk', name: 'Disk-only character', player: 'Disk tester' }] };
  writeFileSync(profilesFile, JSON.stringify(conflictingProfiles), 'utf8');
  await page.evaluate(savedProfiles => localStorage.setItem('osrs-put:profiles', JSON.stringify(savedProfiles)), profiles);
  await page.reload();
  const mergeButton = page.getByRole('button', { name: 'Merge both lists', exact: true });
  await mergeButton.waitFor({ state: 'visible' });
  expect(await mergeButton.isVisible(), 'profile conflict: the real shell offers the explicit merge action');
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), mergeButton.click()]);
  await page.waitForTimeout(1000);
  const mergedNative = JSON.parse(readFileSync(profilesFile, 'utf8'));
  const mergedBrowser = await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:profiles') ?? 'null'));
  expect(mergedNative.list.some((p: { id: string }) => p.id === 'onlydisk') && profiles.list.every(p => mergedNative.list.some((n: { id: string }) => n.id === p.id)),
    'profile conflict merge: every original character remains in the native file');
  expect(JSON.stringify(mergedBrowser) === JSON.stringify(mergedNative), 'profile conflict merge: browser and native lists agree after reload');
  const originals = await page.evaluate(() => ({ local: localStorage.getItem('osrs-put:profiles:recovery:local'), file: localStorage.getItem('osrs-put:profiles:recovery:file') }));
  expect(originals.local === JSON.stringify(profiles) && originals.file === JSON.stringify(conflictingProfiles),
    'profile conflict merge: both original lists remain as exact recovery copies');

  status.stats.magic = 99;
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

  // A secondary-copy failure must be visible on the next Settings query, while the primary save still succeeds.
  const copyDir = (await page.evaluate(() => (window as unknown as { osrsDesktop: { backup: { get(): Promise<{ autoDir: string | null }> } } }).osrsDesktop.backup.get())).autoDir;
  if (!copyDir || dirname(resolve(copyDir)) !== resolve(join(home, 'appdata', 'OSRS Path'))) throw new Error('Unsafe backup error fixture path');
  const heldCopies = `${copyDir}.backup-test`;
  if (existsSync(heldCopies)) throw new Error('Backup fixture already exists');
  mkdirSync(dirname(copyDir), { recursive: true });
  const hadCopies = existsSync(copyDir);
  if (hadCopies) renameSync(copyDir, heldCopies);
  writeFileSync(copyDir, 'This disposable file blocks only the test copy directory', { flag: 'wx' });
  try {
    const prior = readFileSync(file, 'utf8');
    const receipt = await page.evaluate(json => (window as unknown as { osrsDesktop: { saveProgressFileChecked(json: string): Promise<{ ok: boolean }> } }).osrsDesktop.saveProgressFileChecked(json), prior);
    expect(receipt.ok && readFileSync(file, 'utf8') === prior, 'backup failure: the physical primary save still succeeds and retains its bytes');
    const automatic = await page.evaluate(() => (window as unknown as { osrsDesktop: { backup: { get(): Promise<{ error: string | null }> } } }).osrsDesktop.backup.get());
    expect(Boolean(automatic.error), 'backup failure: an automatic copy error survives the Settings state query');
    const manual = await page.evaluate(() => (window as unknown as { osrsDesktop: { backup: { now(): Promise<{ error: string | null }> } } }).osrsDesktop.backup.now());
    const later = await page.evaluate(() => (window as unknown as { osrsDesktop: { backup: { get(): Promise<{ error: string | null }> } } }).osrsDesktop.backup.get());
    expect(Boolean(manual.error) && manual.error === later.error, 'backup failure: a manual error is not silently cleared by backup:get');
  } finally {
    rmSync(copyDir, { force: true });
    if (hadCopies) renameSync(heldCopies, copyDir);
  }
  const retried = await page.evaluate(() => (window as unknown as { osrsDesktop: { backup: { now(): Promise<{ error: string | null }>; get(): Promise<{ error: string | null }> } } }).osrsDesktop.backup.now());
  const afterRetry = await page.evaluate(() => (window as unknown as { osrsDesktop: { backup: { get(): Promise<{ error: string | null }> } } }).osrsDesktop.backup.get());
  expect(retried.error === null && afterRetry.error === null, 'backup recovery: a successful retry clears the copy error');

  // An unreadable individual profile must not be silently skipped or stop healthy profile copies.
  const badProfile = join(dirname(file), 'progress-copytest.json');
  if (existsSync(badProfile)) throw new Error('Per-profile backup fixture already exists');
  mkdirSync(badProfile);
  try {
    const prior = readFileSync(file, 'utf8');
    const receipt = await page.evaluate(json => (window as unknown as { osrsDesktop: { saveProgressFileChecked(json: string): Promise<{ ok: boolean }> } }).osrsDesktop.saveProgressFileChecked(json), prior);
    const automatic = await page.evaluate(() => (window as unknown as { osrsDesktop: { backup: { get(): Promise<{ error: string | null }> } } }).osrsDesktop.backup.get());
    expect(receipt.ok && automatic.error === 'COPY_INCOMPLETE', 'partial backup: unreadable profile is reported independently of primary save success');
    expect(readFileSync(join(copyDir, `osrs-put-${basename(file, '.json')}-latest.json`), 'utf8') === prior, 'partial backup: the readable active profile is still copied');
    const manual = await page.evaluate(() => (window as unknown as { osrsDesktop: { backup: { now(): Promise<{ error: string | null }> } } }).osrsDesktop.backup.now());
    expect(manual.error === 'COPY_INCOMPLETE', 'partial backup: a manual attempt does not report complete success');
  } finally {
    rmdirSync(badProfile);
  }
  const copiesRecovered = await page.evaluate(() => (window as unknown as { osrsDesktop: { backup: { now(): Promise<{ error: string | null }> } } }).osrsDesktop.backup.now());
  expect(copiesRecovered.error === null, 'partial backup recovery: restoring readable sources clears the failure');

  // Protected unknown records must be reported, while healthy character copies still complete.
  const futureProfile = join(dirname(file), 'progress-future.json');
  const futureRaw = '{"version":99,"steps":{}}';
  if (existsSync(futureProfile)) throw new Error('Skipped-copy fixture already exists');
  writeFileSync(futureProfile, futureRaw, { flag: 'wx' });
  try {
    const receipt = await page.evaluate(json => (window as unknown as { osrsDesktop: { saveProgressFileChecked(json: string): Promise<{ ok: boolean }> } }).osrsDesktop.saveProgressFileChecked(json), readFileSync(file, 'utf8'));
    const state = await page.evaluate(() => (window as unknown as { osrsDesktop: { backup: { get(): Promise<{ error: string | null }> } } }).osrsDesktop.backup.get());
    expect(receipt.ok && Boolean(state.error?.includes('progress-future.json') && state.error.includes('damaged or unsupported')),
      'skipped backup: primary save succeeds while Settings names the protected source');
    const manual = await page.evaluate(() => (window as unknown as { osrsDesktop: { backup: { now(): Promise<{ error: string | null }> } } }).osrsDesktop.backup.now());
    expect(Boolean(manual.error?.includes('progress-future.json')), 'skipped backup: manual copying does not falsely report success');
    expect(readFileSync(futureProfile, 'utf8') === futureRaw && readFileSync(join(copyDir, `osrs-put-${basename(file, '.json')}-latest.json`), 'utf8') === readFileSync(file, 'utf8'),
      'skipped backup: unsupported source is untouched and the healthy active character is copied');
  } finally {
    rmSync(futureProfile);
  }
  const skippedRecovered = await page.evaluate(() => (window as unknown as { osrsDesktop: { backup: { now(): Promise<{ error: string | null }> } } }).osrsDesktop.backup.now());
  expect(skippedRecovered.error === null, 'skipped backup: a complete retry clears the affected warning');

  // A failed ui.json write must not be remembered as successful persistence of copy diagnostics.
  const historySource = join(dirname(file), 'progress-history.json');
  const historyTemp = join(dirname(file), 'ui.json.tmp');
  if (existsSync(historySource) || existsSync(historyTemp)) throw new Error('Copy-history fixture already exists');
  writeFileSync(historySource, futureRaw, { flag: 'wx' });
  mkdirSync(historyTemp);
  try {
    const json = readFileSync(file, 'utf8');
    const receipt = await page.evaluate(raw => (window as unknown as { osrsDesktop: { saveProgressFileChecked(json: string): Promise<{ ok: boolean }> } }).osrsDesktop.saveProgressFileChecked(raw), json);
    const state = await page.evaluate(() => (window as unknown as { osrsDesktop: { backup: { get(): Promise<{ error: string | null }> } } }).osrsDesktop.backup.get());
    expect(receipt.ok && readFileSync(file, 'utf8') === json, 'copy-history failure: primary save acknowledgement remains truthful');
    expect(Boolean(state.error?.includes('progress-history.json') && state.error.includes('history could not be saved')),
      'copy-history failure: unpersisted warning history is disclosed');
    rmdirSync(historyTemp);
    await page.evaluate(raw => (window as unknown as { osrsDesktop: { saveProgressFileChecked(json: string): Promise<{ ok: boolean }> } }).osrsDesktop.saveProgressFileChecked(raw), json);
    const persisted = JSON.parse(readFileSync(join(dirname(file), 'ui.json'), 'utf8'));
    const retry = await page.evaluate(() => (window as unknown as { osrsDesktop: { backup: { get(): Promise<{ error: string | null }> } } }).osrsDesktop.backup.get());
    expect(JSON.stringify(persisted.copyErrors).includes('progress-history.json') && !retry.error?.includes('history could not be saved'),
      'copy-history retry: unchanged diagnostics retry persistence after the path becomes writable');
  } finally {
    if (existsSync(historyTemp)) rmdirSync(historyTemp);
    rmSync(historySource);
  }
  const historyRecovered = await page.evaluate(() => (window as unknown as { osrsDesktop: { backup: { now(): Promise<{ error: string | null }> } } }).osrsDesktop.backup.now());
  expect(historyRecovered.error === null, 'copy-history recovery: a complete copy clears the repaired diagnostic');

  // A new profile has not had its session-first copy yet. Block only that copy in the disposable data directory.
  const firstProfile = join(dirname(file), 'progress-firstbak.json');
  const firstCopy = join(dirname(file), 'progress-firstbak.bak.json');
  if (existsSync(firstProfile) || existsSync(firstCopy)) throw new Error('First-copy fixture already exists');
  const initialProfile = readFileSync(file, 'utf8');
  writeFileSync(firstProfile, initialProfile, { flag: 'wx' });
  mkdirSync(firstCopy);
  try {
    await page.evaluate(() => (window as unknown as { osrsDesktop: { loadProgressFile(profile: string): string | null } }).osrsDesktop.loadProgressFile('firstbak'));
    const receipt = await page.evaluate(json => (window as unknown as { osrsDesktop: {
      saveProgressFileChecked(json: string, profile: string): Promise<{ ok: boolean }>;
    } }).osrsDesktop.saveProgressFileChecked(json, 'firstbak'), initialProfile);
    expect(receipt.ok && readFileSync(firstProfile, 'utf8') === initialProfile,
      'first-write backup failure: a failed .bak copy does not falsely reject the successful primary save');
    const copyState = await page.evaluate(() => (window as unknown as { osrsDesktop: { backup: { get(): Promise<{ error: string | null }> } } }).osrsDesktop.backup.get());
    expect(Boolean(copyState.error?.includes('progress-firstbak.json') && copyState.error.includes('before the first save')),
      'first-write backup failure: Settings identifies the affected profile and copy');
    const uiState = JSON.parse(readFileSync(join(dirname(file), 'ui.json'), 'utf8'));
    expect(Boolean(uiState.copyErrors?.['first-write copy']?.['progress-firstbak.json']),
      'first-write backup failure: warning history is persisted to disk');
    await page.reload();
    await page.waitForFunction(() => Boolean((window as unknown as { osrsDesktop?: unknown }).osrsDesktop));
    const afterReload = await page.evaluate(() => (window as unknown as { osrsDesktop: { backup: { get(): Promise<{ error: string | null }> } } }).osrsDesktop.backup.get());
    expect(afterReload.error === copyState.error, 'first-write backup failure: reloading the renderer cannot hide the warning');
    const otherCopies = await page.evaluate(() => (window as unknown as { osrsDesktop: { backup: { now(): Promise<{ error: string | null }> } } }).osrsDesktop.backup.now());
    expect(otherCopies.error === copyState.error, 'first-write backup failure: successful scheduled copies do not erase another failed copy');
  } finally {
    rmdirSync(firstCopy);
    rmSync(firstProfile);
  }

  const keptProfile = join(dirname(file), 'progress-keptcopy.json');
  const keptCopy = join(dirname(file), 'progress-keptcopy.bak.json');
  if (existsSync(keptProfile) || existsSync(keptCopy)) throw new Error('Protected first-copy fixture already exists');
  const goodProfile = readFileSync(file, 'utf8');
  writeFileSync(keptProfile, goodProfile, { flag: 'wx' });
  writeFileSync(keptCopy, futureRaw, { flag: 'wx' });
  try {
    await page.evaluate(() => (window as unknown as { osrsDesktop: { loadProgressFile(profile: string): string | null } }).osrsDesktop.loadProgressFile('keptcopy'));
    const receipt = await page.evaluate(json => (window as unknown as { osrsDesktop: {
      saveProgressFileChecked(json: string, profile: string): Promise<{ ok: boolean }>;
    } }).osrsDesktop.saveProgressFileChecked(json, 'keptcopy'), goodProfile);
    const state = await page.evaluate(() => (window as unknown as { osrsDesktop: { backup: { get(): Promise<{ error: string | null }> } } }).osrsDesktop.backup.get());
    expect(receipt.ok && Boolean(state.error?.includes('progress-keptcopy.json') && state.error.includes('preserved without replacing')),
      'protected first copy: primary save succeeds and Settings identifies the retained unsupported copy');
    expect(readFileSync(keptCopy, 'utf8') === futureRaw, 'protected first copy: the original unsupported bytes remain untouched');
  } finally {
    rmSync(keptProfile);
    rmSync(keptCopy);
  }

  expect(!errors.length, `console: no errors ${errors.join('; ')}`);
  if (exe) {
    // A normal close: the window closes, the app quits and the launcher exits by itself.
    await page.close();
    for (let i = 0; i < 120 && app.exitCode === null; i++) await new Promise((r) => setTimeout(r, 500));
    expect(app.exitCode !== null, 'release candidate: closing the window ends the app and its launcher');
  }
  if (!exe) {
    const beforeRestart = await page.evaluate(() => (window as unknown as { osrsDesktop: { backup: { get(): Promise<{ error: string | null }> } } }).osrsDesktop.backup.get());
    await page.close();
    for (let i = 0; i < 60 && app.exitCode === null; i++) await new Promise(r => setTimeout(r, 250));
    expect(app.exitCode !== null, 'copy-history restart: the original native process exits before relaunch');
    if (app.exitCode === null) throw new Error('Native process did not exit for copy-history restart');
    const restarted = spawn(electronPath, ['.', `--remote-debugging-port=${cdpPort}`], {
      cwd: root, stdio: 'ignore',
      env: { ...process.env, USERPROFILE: home, HOME: home, APPDATA: join(home, 'appdata'), LOCALAPPDATA: home, OSRS_PUT_E2E_ROOT: home, PORTABLE_EXECUTABLE_DIR: home, OSRS_PUT_BRIDGE_PORT: String(bridgePort) },
    });
    let restartedBrowser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
    try {
      let ready = false;
      for (let i = 0; i < 60 && !ready; i++) {
        try { ready = (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).ok; } catch { await new Promise(r => setTimeout(r, 500)); }
      }
      if (!ready) throw new Error('Copy-history restart did not become available');
      restartedBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
      const restartedPage = restartedBrowser.contexts()[0].pages()[0];
      await restartedPage.waitForFunction(() => Boolean((window as unknown as { osrsDesktop?: unknown }).osrsDesktop));
      const afterRestart = await restartedPage.evaluate(() => (window as unknown as { osrsDesktop: { backup: { get(): Promise<{ error: string | null }> } } }).osrsDesktop.backup.get());
      expect(Boolean(beforeRestart.error) && afterRestart.error === beforeRestart.error,
        'copy-history restart: retained first-write warnings survive a completely new native process');
      await restartedPage.close();
    } finally {
      await restartedBrowser?.close();
      for (let i = 0; i < 40 && restarted.exitCode === null; i++) await new Promise(r => setTimeout(r, 250));
      if (restarted.exitCode === null && restarted.pid) spawnSync('taskkill', ['/T', '/F', '/PID', String(restarted.pid)]);
    }
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

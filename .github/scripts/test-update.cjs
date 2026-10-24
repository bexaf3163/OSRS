// T02: a real update between two published portable EXEs (update-test.yml), on a CI runner only, never a player's machine: the apps it starts
// show windows and error dialogs on the desktop they run on. USERPROFILE, HOME, APPDATA, LOCALAPPDATA and OSRS_PUT_E2E_ROOT point into the run folder (no RuneLite is
// found, no installed progress is copied), the bridge uses a free port. The old app marks a step done through its own UI, finds the newer
// release on GitHub, downloads and verifies it, and hands over; the new app must start by itself, remove the old exe and keep the save.
// Usage: node test-update.cjs <old exe> <new version> <new sha256> <work folder>
const { spawn, spawnSync, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');

const [oldExe, newVersion, newSha, workDir] = process.argv.slice(2);
if (!oldExe || !newVersion || !/^[0-9a-f]{64}$/.test(newSha || '') || !workDir) throw new Error('Usage: test-update.cjs <old exe> <new version> <new sha256> <work folder>');
const run = path.join(workDir, 'osrs-update-' + Date.now());
const appDir = path.join(run, 'app');
const home = path.join(run, 'home');
for (const d of [appDir, home, path.join(home, 'appdata')]) fs.mkdirSync(d, { recursive: true });
const oldName = path.basename(oldExe);
const newName = `OSRS-Put-${newVersion}-portable.exe`;
fs.copyFileSync(oldExe, path.join(appDir, oldName));
const dataDir = path.join(appDir, 'OSRS-Put-data');
const results = [];
const check = (ok, what) => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${what}`); console.log(`${ok ? '  ✓' : '  ✗'} ${what}`); };
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((r) => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

/** Processes started from the run's app folder (the portable launchers), with their children (the unpacked app). */
function procs() {
  const out = execFileSync('powershell.exe', ['-NoProfile', '-Command',
    `Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like '${appDir.replace(/'/g, "''")}\\*' } | ForEach-Object { "$($_.ProcessId)|$($_.ExecutablePath)" }`], { encoding: 'utf8' });
  return out.split(/\r?\n/).filter(Boolean).map((l) => { const [pid, p] = l.split('|'); return { pid: Number(pid), path: p }; });
}
function stopAll() {
  for (const p of procs()) spawnSync('taskkill', ['/T', '/F', '/PID', String(p.pid)]);
}

function env(bridgePort) {
  // As the release's packaged E2E (scripts/e2e-electron.ts) starts the portable exe on the same runner: the home folders and OSRS_PUT_E2E_ROOT
  // point into the run folder, so Electron's own paths are set before the app reads them. The portable launcher sets PORTABLE_EXECUTABLE_* itself.
  const e = { ...process.env, USERPROFILE: home, HOME: home, APPDATA: path.join(home, 'appdata'), LOCALAPPDATA: home, OSRS_PUT_E2E_ROOT: home,
    OSRS_PUT_BRIDGE_PORT: String(bridgePort) };
  delete e.PORTABLE_EXECUTABLE_DIR; delete e.PORTABLE_EXECUTABLE_FILE;
  return e;
}

async function launch(exeName, bridgePort) {
  const cdp = await freePort();
  const child = spawn(path.join(appDir, exeName), [`--remote-debugging-port=${cdp}`], { cwd: appDir, env: env(bridgePort), stdio: ['ignore', 'pipe', 'pipe'], detached: false });
  let log = '';
  child.stdout.on('data', (d) => { log += String(d); });
  child.stderr.on('data', (d) => { log += String(d); });
  let up = false;
  for (let i = 0; i < 240 && !up; i++) {
    try { up = (await fetch(`http://127.0.0.1:${cdp}/json/version`)).ok; } catch { await sleep(500); }
  }
  if (!up) throw new Error(`${exeName} did not come up (exit ${child.exitCode}): ${log.slice(-3000)}`);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdp}`);
  let page;
  for (let i = 0; i < 60 && !page; i++) {
    page = browser.contexts().flatMap((c) => c.pages()).find((p) => !p.url().startsWith('devtools'));
    if (!page) await sleep(500);
  }
  await page.waitForFunction(() => Boolean(window.osrsDesktop && window.osrsDesktop.updates), null, { timeout: 60_000 });
  return { child, browser, page };
}

(async () => {
  const bridgePort = await freePort();
  try {
    console.log(`run folder: ${run}`);
    // 1. The old version writes a real save through its own UI.
    let { browser, page } = await launch(oldName, bridgePort);
    const oldState = await page.evaluate(() => window.osrsDesktop.updates.get());
    check(oldState.current === oldName.match(/(\d+\.\d+\.\d+)/)[1], `old app runs as ${oldState.current}`);
    check(oldState.canInstall === true, 'old app sees itself as an installable portable exe');
    await page.evaluate(() => { location.hash = '#/'; });
    await page.waitForTimeout(2500);
    await page.getByRole('button', { name: /^(Done|Mark as done|Mark as manually completed)/ }).first().click();
    let saved = null;
    for (let i = 0; i < 40; i++) {
      try { saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'progress.json'), 'utf8')); } catch { saved = null; }
      if (saved && Object.values(saved.steps || {}).includes('done')) break;
      await sleep(500);
    }
    const doneBefore = Object.entries((saved && saved.steps) || {}).filter(([, v]) => v === 'done').map(([k]) => k);
    check(doneBefore.length > 0, `old app saved a marked step: ${doneBefore.join(', ')}`);
    const savedBytes = fs.readFileSync(path.join(dataDir, 'progress.json'));

    // 2. The real update: GitHub's latest release, its digest, the download and the handoff.
    // The app's own check runs 20 s after launch; a check already under way answers with its state, so wait for it to settle.
    let st = await page.evaluate(() => window.osrsDesktop.updates.check());
    for (let i = 0; i < 60 && (st.state === 'checking' || st.state === 'idle'); i++) {
      await sleep(1000);
      st = await page.evaluate(() => window.osrsDesktop.updates.get());
    }
    check(st.state === 'available' && st.latest === newVersion, `check finds ${newVersion} (state ${st.state}, latest ${st.latest}${st.error ? ', ' + st.error : ''})`);
    const dl = await page.evaluate(() => window.osrsDesktop.updates.download());
    check(dl.state === 'ready', `download ends ready (state ${dl.state}${dl.error ? ', ' + dl.error : ''})`);
    const newFile = path.join(appDir, newName);
    check(fs.existsSync(newFile) && sha(newFile) === newSha, `downloaded ${newName} matches the published SHA-256`);
    const installed = await page.evaluate(() => window.osrsDesktop.updates.install()).catch(() => true);
    check(installed === true, 'install hands over and closes the old app');
    try { await browser.close(); } catch { /* the app is closing */ }

    // 3. The new version starts by itself, deletes the old exe and the cleanup note, and keeps the save.
    let swept = false;
    for (let i = 0; i < 180 && !swept; i++) {
      swept = !fs.existsSync(path.join(appDir, oldName)) && !fs.existsSync(path.join(dataDir, 'update-cleanup.json'));
      if (!swept) await sleep(1000);
    }
    const running = procs();
    check(running.some((p) => path.basename(p.path) === newName), `the new exe is running (${running.map((p) => path.basename(p.path)).join(', ') || 'nothing'})`);
    check(swept, 'the new version deleted the old exe and update-cleanup.json');
    await sleep(5000);
    const after = fs.readFileSync(path.join(dataDir, 'progress.json'));
    const parsed = JSON.parse(after.toString('utf8'));
    const doneAfter = Object.entries(parsed.steps || {}).filter(([, v]) => v === 'done').map(([k]) => k);
    check(doneBefore.every((k) => doneAfter.includes(k)), `the save survives the update (${doneAfter.join(', ')}); bytes ${after.equals(savedBytes) ? 'identical' : 'rewritten'}`);
    stopAll();
    await sleep(3000);

    // 4. The new version, started again, reports itself and reads the same save.
    ({ browser, page } = await launch(newName, bridgePort));
    const newState = await page.evaluate(() => window.osrsDesktop.updates.get());
    check(newState.current === newVersion, `restarted app runs as ${newState.current}`);
    const recheck = await page.evaluate(() => window.osrsDesktop.updates.check());
    check(recheck.state === 'current', `no further update offered (state ${recheck.state})`);
    const files = fs.readdirSync(dataDir);
    check(!files.some((f) => /quarantin|corrupt|damaged|unreadable/i.test(f)), `no quarantined or damaged save files (${files.join(', ')})`);
    try { await browser.close(); } catch { /* closing */ }
  } catch (err) {
    check(false, 'run error: ' + (err && err.stack ? err.stack : err));
  } finally {
    stopAll();
    fs.writeFileSync(path.join(run, 'RESULT.txt'), results.join('\n') + '\n');
    const failed = results.length === 0 || results.some((r) => r.startsWith('FAIL'));
    console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS');
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, ['### Update test', '', ...results.map((r) => `- ${r}`), ''].join('\n'));
    process.exitCode = failed ? 1 : 0;
  }
})();

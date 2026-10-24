// Auto-update of the portable version: compares the version with the latest GitHub release, downloads the new exe next to the old one,
// checks the size and checksum and, on a button, restarts the app from the new exe. The data is in
// OSRS-Put-data next to the exe — the new version picks it up by itself, nothing needs to be re-downloaded or moved.
//
// It goes only to api.github.com and the GitHub attachment storage (https), sends nothing except an ordinary request.
// The player installs the update with a button; in the background there is only the check (it can be turned off). The old exe is deleted after the switch:
// the file name is checked against a pattern, the version must be older than the running one.

const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const REPO = 'bexaf3163/OSRS';
const RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const ASSET_RE = /^OSRS-Put-(\d+\.\d+\.\d+)-portable\.exe$/;
const DOWNLOAD_RE = new RegExp(`^https://github\\.com/${REPO.replace('/', '\\/')}/releases/download/v(\\d+\\.\\d+\\.\\d+)/(OSRS-Put-\\d+\\.\\d+\\.\\d+-portable\\.exe)$`);
const HOST_OK = (host) => host === 'api.github.com' || host === 'github.com' || host.endsWith('.githubusercontent.com');
const MIN_SIZE = 20 * 1024 * 1024;
const MAX_SIZE = 400 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const CHECK_EVERY_MS = 6 * 60 * 60_000;

/** "v2.24.0" / "2.24.0" → [2, 24, 0]; otherwise null. */
function parseVersion(v) {
  const m = /^v?(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/.exec(String(v ?? '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** true if a is newer than b. An unclear version is not newer. */
function isNewer(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] > y[i];
  }
  return false;
}

/**
 * What to download from the GitHub "latest release" reply: the version, the file name, the address, the size and sha256 (if GitHub gave it).
 * Drafts, pre-releases, foreign addresses and strange sizes are dropped — null.
 */
function pickRelease(rel) {
  if (!rel || typeof rel !== 'object' || rel.draft === true || rel.prerelease === true) return null;
  const version = parseVersion(rel.tag_name);
  if (!version || !Array.isArray(rel.assets)) return null;
  const tag = version.join('.');
  for (const a of rel.assets) {
    if (!a || typeof a !== 'object' || typeof a.name !== 'string') continue;
    const m = ASSET_RE.exec(a.name);
    if (!m || m[1] !== tag) continue;
    const url = a.browser_download_url;
    const d = typeof url === 'string' ? DOWNLOAD_RE.exec(url) : null;
    if (!d || d[1] !== tag || d[2] !== a.name) continue;
    if (!Number.isInteger(a.size) || a.size < MIN_SIZE || a.size > MAX_SIZE) continue;
    const digest = typeof a.digest === 'string' ? /^sha256:([0-9a-f]{64})$/.exec(a.digest) : null;
    const notes = typeof rel.body === 'string' ? notesLine(rel.body) : '';
    return { version: tag, name: a.name, url, size: a.size, sha256: digest ? digest[1] : null, notes };
  }
  return null;
}

/**
 * The banner's one line from the release notes: the first line of text, not a heading ("# OSRS Path 2.74.14" said nothing new), without list
 * markers or bold marks.
 */
function notesLine(body) {
  const line = body.split('\n').map((l) => l.trim()).find((l) => l && !/^#/.test(l)) ?? '';
  return line.replace(/^[-*]\s+/, '').replace(/\*\*/g, '').trim().slice(0, 300);
}

/** An ordinary GET over https with redirects; only own hosts. onResponse(res) receives the final response. */
function get(url, headers, onResponse, onError, redirects = 0) {
  let u;
  try {
    u = new URL(url);
  } catch {
    onError(new Error('address'));
    return null;
  }
  if (u.protocol !== 'https:' || !HOST_OK(u.hostname)) {
    onError(new Error('foreign address'));
    return null;
  }
  const req = https.get(u, { headers: { 'User-Agent': 'OSRS-Put-updater', ...headers }, timeout: 20_000 }, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      res.resume();
      if (redirects >= MAX_REDIRECTS) onError(new Error('too many redirects'));
      else get(new URL(res.headers.location, u).toString(), headers, onResponse, onError, redirects + 1);
      return;
    }
    onResponse(res);
  });
  req.on('timeout', () => req.destroy(new Error('timeout')));
  req.on('error', onError);
  return req;
}

function fetchRelease() {
  return new Promise((resolve, reject) => {
    get(RELEASE_URL, { Accept: 'application/vnd.github+json' }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`GitHub answered ${res.statusCode}`));
        return;
      }
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c) => {
        text += c;
        if (text.length > 2_000_000) res.destroy(new Error('the response is too big'));
      });
      res.on('end', () => {
        try { resolve(JSON.parse(text)); } catch { reject(new Error('the response cannot be parsed')); }
      });
      res.on('error', reject);
    }, reject);
  });
}

const cancelled = () => Object.assign(new Error('The download was cancelled.'), { code: 'CANCELLED' });

/**
 * Download into dest through .part, check the size and sha256; the result is a whole file or an error (a partial one is deleted, dest is
 * never touched by a failed or cancelled download). signal cancels it; getter replaces the network for tests.
 */
function download(rel, dest, onProgress, { signal, getter = get } = {}) {
  if (!rel.sha256) return Promise.reject(new Error('The release has no SHA-256 checksum. Automatic installation is unavailable.'));
  if (signal && signal.aborted) return Promise.reject(cancelled());
  const part = `${dest}.part`;
  return new Promise((resolve, reject) => {
    let done = false;
    let req = null;
    let response = null;
    let out = null;
    const fail = (err) => {
      if (done) return;
      done = true;
      if (signal) signal.removeEventListener('abort', onAbort);
      try { if (response) response.destroy(); } catch { /* already closed */ }
      try { if (req) req.destroy(); } catch { /* already closed */ }
      // The stream must close before Windows lets the partial file go, and the caller hears of the failure only after it is gone: a retry
      // started at once must not have its own new .part removed by this one's late cleanup.
      const remove = () => { try { fs.rmSync(part, { force: true }); } catch { /* not a problem */ } reject(err); };
      if (out && !out.closed) { out.once('close', remove); out.destroy(); } else remove();
    };
    function onAbort() { fail(cancelled()); }
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    req = getter(rel.url, {}, (res) => {
      response = res;
      if (done) { res.resume(); return; }
      if (res.statusCode !== 200) {
        res.resume();
        fail(new Error(`the server answered ${res.statusCode}`));
        return;
      }
      const hash = crypto.createHash('sha256');
      let got = 0;
      let last = 0;
      out = fs.createWriteStream(part);
      res.on('data', (chunk) => {
        got += chunk.length;
        hash.update(chunk);
        if (got > rel.size) res.destroy(new Error('the file is larger than declared'));
        const now = Date.now();
        if (now - last > 250) { last = now; onProgress(got / rel.size); }
      });
      res.on('error', fail);
      // A connection that closes early ends the stream without an error: the size check below catches it.
      res.on('aborted', () => fail(new Error('the connection was interrupted')));
      out.on('error', fail);
      res.pipe(out);
      out.on('finish', () => {
        if (done) return;
        if (got !== rel.size) { fail(new Error('the file size did not match')); return; }
        if (hash.digest('hex') !== rel.sha256) { fail(new Error('the checksum did not match')); return; }
        try {
          fs.renameSync(part, dest);
          done = true;
          if (signal) signal.removeEventListener('abort', onAbort);
          onProgress(1);
          resolve();
        } catch (err) {
          fail(err);
        }
      });
    }, fail);
  });
}

/** Whether it is safe to put a path into a cmd command line: without quotes, &, %, ^ and line breaks. */
function safeForCmd(p) {
  return typeof p === 'string' && p.length > 0 && p.length < 260 && !/["&%^<>|\r\n]/.test(p);
}

/**
 * The app update. env — the environment (process.env), userData — the data folder, onState — where to report the state,
 * quit — close the app. Everything is replaced for checks.
 */
function createUpdater({ version, env, userData, onState, quit, fetchRelease: fetcher = fetchRelease, downloader = download, spawner = spawn, fsApi = fs }) {
  const exe = env.PORTABLE_EXECUTABLE_FILE || null;
  const dir = env.PORTABLE_EXECUTABLE_DIR || null;
  const canInstall = Boolean(exe && dir);
  let state = { state: 'idle', current: version, latest: null, notes: '', progress: 0, error: null, canInstall };
  let rel = null;
  let busy = false;
  let timer = null;
  let downloading = null;

  const set = (patch) => {
    state = { ...state, ...patch };
    onState(state);
  };

  /** Already downloaded earlier (the app was closed before the restart) — ready to install without a new download. */
  const target = () => (rel && dir ? path.join(dir, rel.name) : null);

  /** A previous download is untrusted until its bytes match the release digest. Stream it to bound memory, including just before handoff. */
  async function matchesRelease(file, release) {
    if (!file || !release.sha256) return false;
    try {
      if (!fsApi.existsSync(file) || fsApi.statSync(file).size !== release.size) return false;
      const hash = crypto.createHash('sha256');
      let size = 0;
      for await (const chunk of fsApi.createReadStream(file)) {
        size += chunk.length;
        if (size > release.size) return false;
        hash.update(chunk);
      }
      return size === release.size && hash.digest('hex') === release.sha256;
    } catch { return false; }
  }

  async function check() {
    if (busy) return state;
    busy = true;
    set({ state: 'checking', error: null });
    try {
      const picked = pickRelease(await fetcher());
      if (!picked || !isNewer(picked.version, version)) {
        rel = null;
        set({ state: 'current', latest: picked ? picked.version : null, notes: '' });
        return state;
      }
      rel = picked;
      if (canInstall && !picked.sha256) {
        rel = null;
        throw new Error('The release has no SHA-256 checksum. Automatic installation is unavailable.');
      }
      const file = target();
      const have = canInstall && await matchesRelease(file, picked);
      set({ state: have ? 'ready' : 'available', latest: picked.version, notes: picked.notes, progress: have ? 1 : 0 });
    } catch (err) {
      set({ state: 'error', error: String(err && err.message ? err.message : err) });
    } finally {
      busy = false;
    }
    return state;
  }

  async function fetchUpdate() {
    if (busy || !rel || !canInstall) return state;
    busy = true;
    set({ state: 'downloading', progress: 0, error: null });
    const controller = new AbortController();
    downloading = controller;
    try {
      const file = target();
      if (!await matchesRelease(file, rel)) {
        await downloader(rel, file, (p) => { if (!controller.signal.aborted) set({ progress: p }); }, { signal: controller.signal });
      }
      if (controller.signal.aborted) throw cancelled();
      if (!await matchesRelease(file, rel)) throw new Error('The downloaded file checksum did not match. Please download the update again.');
      set({ state: 'ready', progress: 1 });
    } catch (err) {
      // A cancel is the player's choice, not a failure: the update is offered again as before.
      if (controller.signal.aborted || (err && err.code === 'CANCELLED')) set({ state: 'available', progress: 0, error: null });
      else set({ state: 'error', error: String(err && err.message ? err.message : err) });
    } finally {
      downloading = null;
      busy = false;
    }
    return state;
  }

  /** Stop a download in progress; its partial file is removed and the update stays available. */
  function cancel() {
    if (downloading) downloading.abort();
    return state;
  }

  /** Start the new version after exiting this one and close the app. false — it did not work, nothing is closed. */
  async function install() {
    const file = target();
    if (busy || state.state !== 'ready' || !canInstall || !file || !safeForCmd(file)) return false;
    busy = true;
    try {
      if (!await matchesRelease(file, rel)) throw new Error('The cached update checksum did not match. Please download the update again.');
      // The new version will delete the old exe itself when it is freed.
      fsApi.writeFileSync(path.join(userData, 'update-cleanup.json'), JSON.stringify({ delete: exe }));
      const cmd = env.ComSpec || 'cmd.exe';
      const child = spawner(cmd, ['/d', '/s', '/c', `"ping -n 3 127.0.0.1 >nul & start "" "${file}""`], {
        detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true,
      });
      child.unref();
      quit();
      return true;
    } catch (err) {
      set({ state: 'error', error: String(err && err.message ? err.message : err) });
      return false;
    } finally {
      busy = false;
    }
  }

  /** The start after an update: the earlier exe (from update-cleanup.json) is deleted when it is freed. */
  function cleanup(tries = 0) {
    const f = path.join(userData, 'update-cleanup.json');
    let old = null;
    try { old = JSON.parse(fsApi.readFileSync(f, 'utf8')).delete; } catch { return; }
    const m = typeof old === 'string' ? ASSET_RE.exec(path.basename(old)) : null;
    if (!m || !isNewer(version, m[1]) || (dir && path.dirname(old) !== dir)) {
      try { fsApi.rmSync(f, { force: true }); } catch { /* not a problem */ }
      return;
    }
    try {
      fsApi.rmSync(old, { force: true });
      fsApi.rmSync(f, { force: true });
    } catch {
      // Still busy with the earlier process — we wait and retry.
      if (tries < 15) setTimeout(() => cleanup(tries + 1), 2000).unref();
    }
  }

  /**
   * The start of an app run from OSRS-Put-<its own version>-portable.exe: every OLDER OSRS-Put-x.y.z-portable.exe lying next to it is deleted —
   * the ones left by a manual update, a skipped version or a cleanup that could not finish. Only files with exactly that name pattern, in the
   * same folder, older than the running version and not the running file; if this exe was renamed, nothing is touched. A busy file is retried.
   */
  function sweepOld(tries = 0) {
    if (!exe || !dir) return;
    const self = ASSET_RE.exec(path.basename(exe));
    if (!self || self[1] !== version) return;
    let names;
    try { names = fsApi.readdirSync(dir); } catch { return; }
    let busy = false;
    for (const name of names) {
      const m = ASSET_RE.exec(name);
      if (!m || name === path.basename(exe) || !isNewer(version, m[1])) continue;
      try {
        fsApi.rmSync(path.join(dir, name), { force: true });
      } catch {
        busy = true;
      }
    }
    if (busy && tries < 15) setTimeout(() => sweepOld(tries + 1), 2000).unref();
  }

  /** The check at launch and every few hours, if turned on. enabled() — asks the setting every time. */
  function schedule(enabled) {
    clearTimeout(timer);
    const run = () => {
      if (enabled()) void check();
      timer = setTimeout(run, CHECK_EVERY_MS);
      timer.unref();
    };
    timer = setTimeout(run, 20_000);
    timer.unref();
  }

  return { check, download: fetchUpdate, cancel, install, cleanup, sweepOld, schedule, get state() { return state; } };
}

module.exports = { createUpdater, download, fetchRelease, pickRelease, parseVersion, isNewer, safeForCmd, ASSET_RE, DOWNLOAD_RE, REPO };

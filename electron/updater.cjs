// Автообновление переносной версии: сверяет версию с последним выпуском на GitHub, скачивает новый exe рядом со старым,
// проверяет размер и контрольную сумму и по кнопке перезапускает программу уже из нового exe. Данные лежат в
// OSRS-Put-data рядом с exe — новая версия подхватывает их сама, перекачивать и переносить ничего не нужно.
//
// Ходит только на api.github.com и в хранилище вложений GitHub (https), ничего не отправляет, кроме обычного запроса.
// Обновление ставит игрок кнопкой; в фоне только проверка (её можно выключить). Старый exe после перехода удаляется:
// имя файла проверяется по шаблону, версия должна быть старше запущенной.

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

/** «v2.24.0» / «2.24.0» → [2, 24, 0]; иначе null. */
function parseVersion(v) {
  const m = /^v?(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/.exec(String(v ?? '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** true, если a новее b. Непонятная версия — не новее. */
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
 * Что скачивать из ответа GitHub «последний выпуск»: версия, имя файла, адрес, размер и sha256 (если GitHub её дал).
 * Черновики, предварительные выпуски, чужие адреса и странные размеры отбрасываются — null.
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
    const notes = typeof rel.body === 'string' ? rel.body.split('\n')[0].replace(/\*\*/g, '').trim().slice(0, 300) : '';
    return { version: tag, name: a.name, url, size: a.size, sha256: digest ? digest[1] : null, notes };
  }
  return null;
}

/** Обычный GET по https с редиректами; только свои хосты. onResponse(res) получает финальный ответ. */
function get(url, headers, onResponse, onError, redirects = 0) {
  let u;
  try {
    u = new URL(url);
  } catch {
    onError(new Error('адрес'));
    return null;
  }
  if (u.protocol !== 'https:' || !HOST_OK(u.hostname)) {
    onError(new Error('чужой адрес'));
    return null;
  }
  const req = https.get(u, { headers: { 'User-Agent': 'OSRS-Put-updater', ...headers }, timeout: 20_000 }, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      res.resume();
      if (redirects >= MAX_REDIRECTS) onError(new Error('много переадресаций'));
      else get(new URL(res.headers.location, u).toString(), headers, onResponse, onError, redirects + 1);
      return;
    }
    onResponse(res);
  });
  req.on('timeout', () => req.destroy(new Error('таймаут')));
  req.on('error', onError);
  return req;
}

function fetchRelease() {
  return new Promise((resolve, reject) => {
    get(RELEASE_URL, { Accept: 'application/vnd.github+json' }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`GitHub ответил ${res.statusCode}`));
        return;
      }
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c) => {
        text += c;
        if (text.length > 2_000_000) res.destroy(new Error('слишком большой ответ'));
      });
      res.on('end', () => {
        try { resolve(JSON.parse(text)); } catch { reject(new Error('ответ не разобрать')); }
      });
      res.on('error', reject);
    }, reject);
  });
}

/** Скачать в dest через .part, проверить размер и sha256; на выходе — целый файл или ошибка (частичный удаляется). */
function download(rel, dest, onProgress) {
  const part = `${dest}.part`;
  return new Promise((resolve, reject) => {
    const fail = (err) => {
      try { fs.rmSync(part, { force: true }); } catch { /* не страшно */ }
      reject(err);
    };
    get(rel.url, {}, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        fail(new Error(`сервер ответил ${res.statusCode}`));
        return;
      }
      const hash = crypto.createHash('sha256');
      let got = 0;
      let last = 0;
      const out = fs.createWriteStream(part);
      res.on('data', (chunk) => {
        got += chunk.length;
        hash.update(chunk);
        if (got > rel.size) res.destroy(new Error('файл больше заявленного'));
        const now = Date.now();
        if (now - last > 250) { last = now; onProgress(got / rel.size); }
      });
      res.on('error', (err) => { out.destroy(); fail(err); });
      out.on('error', fail);
      res.pipe(out);
      out.on('finish', () => {
        if (got !== rel.size) { fail(new Error('размер файла не сошёлся')); return; }
        if (rel.sha256 && hash.digest('hex') !== rel.sha256) { fail(new Error('контрольная сумма не сошлась')); return; }
        try {
          fs.renameSync(part, dest);
          onProgress(1);
          resolve();
        } catch (err) {
          fail(err);
        }
      });
    }, fail);
  });
}

/** Безопасно ли подставить путь в командную строку cmd: без кавычек, &, %, ^ и переводов строки. */
function safeForCmd(p) {
  return typeof p === 'string' && p.length > 0 && p.length < 260 && !/["&%^<>|\r\n]/.test(p);
}

/**
 * Обновление приложения. env — окружение (process.env), userData — папка данных, onState — куда сообщать о состоянии,
 * quit — закрыть программу. Для проверок всё подменяется.
 */
function createUpdater({ version, env, userData, onState, quit, fetchRelease: fetcher = fetchRelease, downloader = download, spawner = spawn, fsApi = fs }) {
  const exe = env.PORTABLE_EXECUTABLE_FILE || null;
  const dir = env.PORTABLE_EXECUTABLE_DIR || null;
  const canInstall = Boolean(exe && dir);
  let state = { state: 'idle', current: version, latest: null, notes: '', progress: 0, error: null, canInstall };
  let rel = null;
  let busy = false;
  let timer = null;

  const set = (patch) => {
    state = { ...state, ...patch };
    onState(state);
  };

  /** Уже скачано раньше (программу закрыли до перезапуска) — готово к установке без новой загрузки. */
  const target = () => (rel && dir ? path.join(dir, rel.name) : null);

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
      const file = target();
      const have = canInstall && file && fsApi.existsSync(file) && fsApi.statSync(file).size === picked.size;
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
    try {
      const file = target();
      if (!(fsApi.existsSync(file) && fsApi.statSync(file).size === rel.size)) {
        await downloader(rel, file, (p) => set({ progress: p }));
      }
      set({ state: 'ready', progress: 1 });
    } catch (err) {
      set({ state: 'error', error: String(err && err.message ? err.message : err) });
    } finally {
      busy = false;
    }
    return state;
  }

  /** Запустить новую версию после выхода из этой и закрыть программу. false — не получилось, ничего не закрыто. */
  function install() {
    const file = target();
    if (state.state !== 'ready' || !canInstall || !file || !fsApi.existsSync(file) || !safeForCmd(file)) return false;
    try {
      // Старый exe новая версия удалит сама, когда он освободится.
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
    }
  }

  /** Старт после обновления: прежний exe (из update-cleanup.json) удаляется, когда освободится. */
  function cleanup(tries = 0) {
    const f = path.join(userData, 'update-cleanup.json');
    let old = null;
    try { old = JSON.parse(fsApi.readFileSync(f, 'utf8')).delete; } catch { return; }
    const m = typeof old === 'string' ? ASSET_RE.exec(path.basename(old)) : null;
    if (!m || !isNewer(version, m[1]) || (dir && path.dirname(old) !== dir)) {
      try { fsApi.rmSync(f, { force: true }); } catch { /* не страшно */ }
      return;
    }
    try {
      fsApi.rmSync(old, { force: true });
      fsApi.rmSync(f, { force: true });
    } catch {
      // Ещё занят прежним процессом — подождём и повторим.
      if (tries < 15) setTimeout(() => cleanup(tries + 1), 2000).unref();
    }
  }

  /** Проверка при запуске и раз в несколько часов, если включена. enabled() — спрашивает настройку каждый раз. */
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

  return { check, download: fetchUpdate, install, cleanup, schedule, get state() { return state; } };
}

module.exports = { createUpdater, download, fetchRelease, pickRelease, parseVersion, isNewer, safeForCmd, ASSET_RE, DOWNLOAD_RE, REPO };

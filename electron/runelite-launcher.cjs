// Запуск RuneLite с плагином OSRS Path Bridge прямо из программы «OSRS Путь».
// Ничего не скачивается: Java — из установленного RuneLite (%LOCALAPPDATA%\RuneLite\jre),
// классы клиента — из его же кэша (~/.runelite/repository2), плагин — маленький jar внутри программы.
// Обычный RuneLite из лаунчера сторонние плагины не грузит, поэтому клиент запускается напрямую,
// как в официальном шаблоне плагинов RuneLite (ExternalPluginManager.loadBuiltin).

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const MAIN_CLASS = 'com.osrspath.bridge.OsrsPathLauncher';
const PLUGIN_JAR = 'osrs-path-bridge.jar';
// Как у лаунчера RuneLite (его config.json); -ea нужен loadBuiltin.
const JVM_ARGS = ['-ea', '-Xmx768m', '-Xss2m', '-XX:CompileThreshold=1500', '-XX:+DisableAttachMechanism'];

const exists = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

function runeliteDir() {
  return path.join(os.homedir(), '.runelite');
}

/** Java установленного RuneLite, иначе JAVA_HOME. javaw — без чёрного окна консоли. */
function findJava() {
  const exe = process.platform === 'win32' ? 'javaw.exe' : 'java';
  const candidates = [];
  if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, 'RuneLite', 'jre', 'bin', exe));
  if (process.env.JAVA_HOME) candidates.push(path.join(process.env.JAVA_HOME, 'bin', exe));
  return candidates.find(exists) ?? null;
}

/** Версия из имени файла: client-1.12.39.jar → [1, 12, 39]. */
function versionOf(name) {
  const m = name.match(/-(\d+(?:\.\d+)*)(?=[-.])/);
  return m ? m[1].split('.').map(Number) : [];
}

function newer(a, b) {
  const va = versionOf(a.name);
  const vb = versionOf(b.name);
  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    if ((va[i] ?? 0) !== (vb[i] ?? 0)) return (va[i] ?? 0) > (vb[i] ?? 0);
  }
  return a.mtime > b.mtime;
}

/**
 * Библиотеки клиента из кэша лаунчера RuneLite. Если после обновления лежат две версии одной
 * библиотеки, берётся новая. Клиент и injected-client должны быть одной версии.
 */
function findClient(dir = path.join(runeliteDir(), 'repository2')) {
  let names;
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith('.jar'));
  } catch {
    return null;
  }
  const byKey = new Map();
  for (const name of names) {
    const key = name.replace(/-\d+(?:\.\d+)*(?=[-.])/, '-*');
    const entry = { name, mtime: fs.statSync(path.join(dir, name)).mtimeMs };
    const prev = byKey.get(key);
    if (!prev || newer(entry, prev)) byKey.set(key, entry);
  }
  const client = byKey.get('client-*.jar');
  const injected = byKey.get('injected-client-*.jar');
  if (!client || !injected) return null;
  const version = versionOf(client.name).join('.');
  if (versionOf(injected.name).join('.') !== version) return null;
  return { version, jars: [...byKey.values()].map((e) => path.join(dir, e.name)) };
}

/** jar плагина: в собранной программе — в resources, при запуске из репозитория — результат Gradle. */
function findPluginJar() {
  const candidates = [
    process.resourcesPath && path.join(process.resourcesPath, 'runelite-bridge', PLUGIN_JAR),
    path.join(__dirname, '..', 'runelite-bridge', 'build', 'libs', PLUGIN_JAR),
  ].filter(Boolean);
  return candidates.find(exists) ?? null;
}

/** Отвечает ли уже мост (RuneLite с плагином запущен). */
function bridgeAlive() {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: 38282, path: '/status', timeout: 800, headers: { 'X-OSRS-Path': '1' } }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });
}

/** Что есть для запуска и чего не хватает — для настроек и кнопки. */
function check() {
  const java = findJava();
  const client = findClient();
  const plugin = findPluginJar();
  const problems = [];
  if (!java) problems.push('Не найден RuneLite: установи его с runelite.net и запусти один раз через Jagex Launcher.');
  if (!client) problems.push('Не найдены файлы клиента RuneLite: запусти RuneLite один раз через Jagex Launcher — он их скачает.');
  if (!plugin) problems.push('В программе нет плагина OSRS Path Bridge — пересобери её (npm run dist:win).');
  return {
    ok: problems.length === 0,
    problems,
    clientVersion: client?.version ?? null,
    // Сессия Jagex Account для RuneLite вне лаунчера (--insecure-write-credentials).
    credentials: exists(path.join(runeliteDir(), 'credentials.properties')),
  };
}

function createLauncher({ logFile }) {
  let child = null;
  let startedAt = 0;

  async function launch() {
    if (await bridgeAlive()) return { ok: true, state: 'running' };
    // Только что запущенный клиент ещё грузится (мост поднимается ~10 секунд) — второй не нужен.
    if (child && child.exitCode === null && Date.now() - startedAt < 90_000) return { ok: true, state: 'starting' };
    const java = findJava();
    const client = findClient();
    const plugin = findPluginJar();
    if (!java || !client || !plugin) return { ok: false, state: 'missing', problems: check().problems };
    const classpath = [plugin, ...client.jars].join(path.delimiter);
    let out = 'ignore';
    try {
      out = fs.openSync(logFile, 'w');
    } catch {
      // Без журнала — не страшно.
    }
    try {
      // Для проверок: отдельная папка настроек RuneLite вместо ~/.runelite (RuneLite берёт её из user.home).
      const home = process.env.OSRS_PUT_RUNELITE_USER_HOME;
      const args = [...JVM_ARGS, ...(home ? [`-Duser.home=${home}`] : []), '-cp', classpath, MAIN_CLASS];
      child = spawn(java, args, {
        detached: true,
        stdio: ['ignore', out, out],
        windowsHide: false,
      });
      startedAt = Date.now();
      // RuneLite живёт своей жизнью: закрытие «OSRS Путь» игру не закрывает.
      child.unref();
      child.on('error', () => { child = null; });
      return { ok: true, state: 'started', clientVersion: client.version };
    } catch (e) {
      return { ok: false, state: 'failed', problems: [String(e?.message ?? e)] };
    } finally {
      if (typeof out === 'number') fs.closeSync(out);
    }
  }

  return { launch, check };
}

module.exports = { createLauncher, check, findClient, versionOf };

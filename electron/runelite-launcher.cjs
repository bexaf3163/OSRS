// Starting RuneLite with the OSRS Path Bridge plugin right from the "OSRS Path" app.
// Nothing is downloaded: Java is from the installed RuneLite (%LOCALAPPDATA%\RuneLite\jre),
// the client classes are from its own cache (~/.runelite/repository2), the plugin is a small jar inside the app.
// The ordinary RuneLite from the launcher does not load third-party plugins, so the client is started directly,
// as in the official RuneLite plugin template (ExternalPluginManager.loadBuiltin).

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const MAIN_CLASS = 'com.osrspath.bridge.OsrsPathLauncher';
const PLUGIN_JAR = 'osrs-path-bridge.jar';
// As in the RuneLite launcher (its config.json); -ea is needed by loadBuiltin.
const JVM_ARGS = ['-ea', '-Xmx768m', '-Xss2m', '-XX:CompileThreshold=1500', '-XX:+DisableAttachMechanism'];

const exists = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

function runeliteDir() {
  return path.join(os.homedir(), '.runelite');
}

/** The Java of the installed RuneLite, otherwise JAVA_HOME. javaw — without a black console window. */
function findJava() {
  const exe = process.platform === 'win32' ? 'javaw.exe' : 'java';
  const candidates = [];
  if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, 'RuneLite', 'jre', 'bin', exe));
  if (process.env.JAVA_HOME) candidates.push(path.join(process.env.JAVA_HOME, 'bin', exe));
  return candidates.find(exists) ?? null;
}

/** The version from the file name: client-1.12.39.jar → [1, 12, 39]. */
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
 * The client libraries from the RuneLite launcher cache. If after an update there are two versions of one
 * library, the new one is taken. The client and injected-client must be of one version.
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

/** The plugin jar: in the built app — in resources, when run from the repository — the Gradle result. */
function findPluginJar() {
  const candidates = [
    process.resourcesPath && path.join(process.resourcesPath, 'runelite-bridge', PLUGIN_JAR),
    path.join(__dirname, '..', 'runelite-bridge', 'build', 'libs', PLUGIN_JAR),
  ].filter(Boolean);
  return candidates.find(exists) ?? null;
}

/** Whether the bridge already answers (RuneLite with the plugin is running). */
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

/** What there is for launching and what is missing — for the settings and the button. */
function check() {
  const java = findJava();
  const client = findClient();
  const plugin = findPluginJar();
  const problems = [];
  if (!java) problems.push('RuneLite not found: install it from runelite.net and start it once through the Jagex Launcher.');
  if (!client) problems.push('The RuneLite client files were not found: start RuneLite once through the Jagex Launcher — it will download them.');
  if (!plugin) problems.push('The app has no OSRS Path Bridge plugin — rebuild it (npm run dist:win).');
  return {
    ok: problems.length === 0,
    problems,
    clientVersion: client?.version ?? null,
    // The Jagex Account session for RuneLite outside the launcher (--insecure-write-credentials).
    credentials: exists(path.join(runeliteDir(), 'credentials.properties')),
  };
}

function createLauncher({ logFile }) {
  let child = null;
  let startedAt = 0;

  async function launch() {
    if (await bridgeAlive()) return { ok: true, state: 'running' };
    // A just-started client is still loading (the bridge comes up in ~10 seconds) — a second one is not needed.
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
      // Without a log — not a problem.
    }
    try {
      // For checks: a separate RuneLite settings folder instead of ~/.runelite (RuneLite takes it from user.home).
      const home = process.env.OSRS_PUT_RUNELITE_USER_HOME;
      const args = [...JVM_ARGS, ...(home ? [`-Duser.home=${home}`] : []), '-cp', classpath, MAIN_CLASS];
      child = spawn(java, args, {
        detached: true,
        stdio: ['ignore', out, out],
        windowsHide: false,
      });
      startedAt = Date.now();
      // RuneLite lives its own life: closing "OSRS Path" does not close the game.
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

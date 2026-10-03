// Проверяет, что собранный плагин совместим с УСТАНОВЛЕННЫМ у игрока RuneLite: все его ссылки на net.runelite.*
// существуют в jar клиента. Нужны: JDK 17 (javap, javac), собранный плагин (./gradlew build) и RuneLite с папкой
// ~/.runelite/repository2 (появляется после первого запуска клиента). На CI не запускается.
// Запуск: npm run check-runelite [версия, например 1.13.1] — без версии берётся самая новая из установленных.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const classes = join(root, 'runelite-bridge', 'build', 'classes', 'java', 'main');
const repo = join(homedir(), '.runelite', 'repository2');

function jdk(): string | null {
  const home = process.env.JAVA_HOME;
  if (home && existsSync(join(home, 'bin', process.platform === 'win32' ? 'javap.exe' : 'javap'))) return home;
  const jdks = join(homedir(), '.jdks');
  if (existsSync(jdks)) {
    const found = readdirSync(jdks).find((d) => /17/.test(d));
    if (found) return join(jdks, found);
  }
  return null;
}

const java = jdk();
if (!java) { console.error('Нужен JDK 17: задай JAVA_HOME или положи его в ~/.jdks.'); process.exit(2); }
if (!existsSync(classes)) { console.error('Плагин не собран: запусти ./gradlew build в runelite-bridge.'); process.exit(2); }
if (!existsSync(repo)) { console.error(`Нет ${repo}: запусти RuneLite один раз, чтобы он скачал клиент.`); process.exit(2); }

const jars = readdirSync(repo);
const versions = jars.map((j) => /^client-(\d+(?:\.\d+)+)\.jar$/.exec(j)?.[1]).filter((v): v is string => Boolean(v))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const version = process.argv[2] ?? versions[versions.length - 1];
if (!version || !versions.includes(version)) { console.error(`Клиент ${version ?? '?'} не найден в ${repo} (есть: ${versions.join(', ')}).`); process.exit(2); }

const exe = (name: string) => join(java, 'bin', process.platform === 'win32' ? `${name}.exe` : name);
const classNames = readdirSync(join(classes, 'com', 'osrspath', 'bridge')).filter((f) => f.endsWith('.class'))
  .map((f) => `com.osrspath.bridge.${f.replace(/\.class$/, '')}`);
const javap = spawnSync(exe('javap'), ['-c', '-p', '-cp', classes, ...classNames], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
if (javap.status !== 0) { console.error(javap.stderr); process.exit(2); }
const refs = [...new Set(javap.stdout.split('\n')
  .map((l) => /\/\/\s*(Method|InterfaceMethod|Field)\s+(net\/runelite\S+)/.exec(l))
  .filter((m): m is RegExpExecArray => Boolean(m))
  .map((m) => `${m[1]} ${m[2].replace(/"<init>"/, '<init>')}`))];

const work = join(tmpdir(), 'osrs-put-compat');
mkdirSync(work, { recursive: true });
const refsFile = join(work, 'refs.txt');
writeFileSync(refsFile, `${refs.join('\n')}\n`);
const javac = spawnSync(exe('javac'), ['-encoding', 'UTF-8', '-d', work, join(root, 'scripts', 'RuneLiteCompat.java')], { encoding: 'utf8' });
if (javac.status !== 0) { console.error(javac.stderr); process.exit(2); }

// Клиент, его API и общие библиотеки из репозитория RuneLite (версии библиотек — какие лежат).
const pick = (re: RegExp) => jars.filter((j) => re.test(j)).map((j) => join(repo, j));
const cp = [
  ...pick(new RegExp(`^client-${version.replace(/\./g, '\\.')}\\.jar$`)),
  ...pick(new RegExp(`^runelite-api-${version.replace(/\./g, '\\.')}-runtime\\.jar$`)),
  ...pick(/^(http-api|guava|guice|javax\.inject|gson|okhttp|okio|slf4j-api|jna|lwjgl|commons-lang3|jopt-simple)-[\d.]+/),
].join(delimiter);
const run = spawnSync(exe('java'), ['-Dfile.encoding=UTF-8', '-cp', work, 'RuneLiteCompat', refsFile, cp], { encoding: 'utf8' });
process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
console.log(`RuneLite ${version}: ${run.status === 0 && /расхождений: 0/.test(run.stdout) ? 'плагин совместим' : 'ЕСТЬ РАСХОЖДЕНИЯ'}`);
process.exit(run.status === 0 && /расхождений: 0/.test(run.stdout) ? 0 : 1);

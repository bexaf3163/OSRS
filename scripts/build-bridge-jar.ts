// npm run bridge:jar — собрать jar плагина RuneLite (runelite-bridge/build/libs/osrs-path-bridge.jar),
// который программа для ПК кладёт в exe и запускает вместе с установленным RuneLite.
// Нужен JDK 17: JAVA_HOME или ~/.jdks/<jdk-17…>. С --optional без JDK просто предупреждает (для npm run desktop).

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = join(root, 'runelite-bridge');
const jar = join(dir, 'build', 'libs', 'osrs-path-bridge.jar');
const optional = process.argv.includes('--optional');
const win = process.platform === 'win32';

function findJdk(): string | undefined {
  const javac = (home: string) => existsSync(join(home, 'bin', win ? 'javac.exe' : 'javac'));
  if (process.env.JAVA_HOME && javac(process.env.JAVA_HOME)) return process.env.JAVA_HOME;
  const jdks = join(homedir(), '.jdks');
  if (!existsSync(jdks)) return undefined;
  return readdirSync(jdks).filter((n) => /17/.test(n)).map((n) => join(jdks, n)).find(javac);
}

const jdk = findJdk();
if (!jdk) {
  const msg = 'Не найден JDK 17 (JAVA_HOME или ~/.jdks) — jar плагина RuneLite не собран.';
  if (optional) {
    console.warn(`! ${msg}${existsSync(jar) ? ' Используется собранный ранее.' : ''}`);
    process.exit(0);
  }
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const gradlew = join(dir, win ? 'gradlew.bat' : 'gradlew');
// .bat на Windows запускается только через оболочку — команда одной строкой, аргументы в ней свои.
const r = win
  ? spawnSync(`"${gradlew}" --no-daemon -q jar`, { cwd: dir, stdio: 'inherit', shell: true, env: { ...process.env, JAVA_HOME: jdk } })
  : spawnSync(gradlew, ['--no-daemon', '-q', 'jar'], { cwd: dir, stdio: 'inherit', env: { ...process.env, JAVA_HOME: jdk } });
if (r.status !== 0 || !existsSync(jar)) {
  console.error('✗ Gradle не собрал jar плагина');
  process.exit(1);
}
console.log(`✓ ${jar}`);

// npm run bridge:jar — build the RuneLite plugin jar (runelite-bridge/build/libs/osrs-path-bridge.jar),
// which the desktop app puts into the exe and starts together with the installed RuneLite.
// JDK 17 is needed: JAVA_HOME or ~/.jdks/<jdk-17…>. With --optional without a JDK it just warns (for npm run desktop).

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
  const msg = 'JDK 17 not found (JAVA_HOME or ~/.jdks) — the RuneLite plugin jar was not built.';
  if (optional) {
    console.warn(`! ${msg}${existsSync(jar) ? ' The earlier built one is used.' : ''}`);
    process.exit(0);
  }
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const gradlew = join(dir, win ? 'gradlew.bat' : 'gradlew');
// A .bat on Windows runs only through the shell — the command is one line, the arguments are in it.
const r = win
  ? spawnSync(`"${gradlew}" --no-daemon -q jar`, { cwd: dir, stdio: 'inherit', shell: true, env: { ...process.env, JAVA_HOME: jdk } })
  : spawnSync(gradlew, ['--no-daemon', '-q', 'jar'], { cwd: dir, stdio: 'inherit', env: { ...process.env, JAVA_HOME: jdk } });
if (r.status !== 0 || !existsSync(jar)) {
  console.error('✗ Gradle did not build the plugin jar');
  process.exit(1);
}
console.log(`✓ ${jar}`);

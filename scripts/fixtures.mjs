// Regenerate every generated fixture and document: the tests that honour UPDATE_FIXTURES write their outputs, then check them.
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const tests = readdirSync('tests', { recursive: true }).map((f) => `tests/${String(f).replace(/\\/g, '/')}`)
  .filter((f) => /\.test\.tsx?$/.test(f) && readFileSync(f, 'utf8').includes('UPDATE_FIXTURES'));
const r = spawnSync('npx', ['vitest', 'run', ...tests], { stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, UPDATE_FIXTURES: '1' } });
process.exit(r.status ?? 1);

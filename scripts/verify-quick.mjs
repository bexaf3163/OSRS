// Verify only what the current change can affect. Usage: npm run verify:quick [-- baseRef]   (default origin/main)
// Steps run only when relevant: tsc, vitest related, check-data, vite build, Java tests (by class name), and a browser-suite hint.
import { execSync, spawnSync } from 'node:child_process';
const base = process.argv[2] || 'origin/main';
const sh = (c) => execSync(c, { encoding: 'utf8' }).trim();
let mb; try { mb = sh(`git merge-base HEAD ${base}`); } catch { mb = 'HEAD'; }
const changed = [...new Set([...sh(`git diff --name-only ${mb}`).split('\n'), ...sh('git ls-files --others --exclude-standard').split('\n')].filter(Boolean))];
if (!changed.length) { console.log('verify-quick: no changes'); process.exit(0); }
const ts = changed.filter((f) => /^(src|tests|scripts)\/.*\.(ts|tsx)$/.test(f) || f === 'vite.config.ts');
const run = (label, cmd, args) => { const t = Date.now(); const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' }); console.log(`verify-quick: ${label} ${r.status === 0 ? 'OK' : 'FAILED'} in ${((Date.now() - t) / 1000).toFixed(1)} s`); if (r.status !== 0) process.exit(r.status ?? 1); };
console.log(`verify-quick: ${changed.length} changed file(s) since ${mb.slice(0, 8)}`);
if (ts.length) run('tsc', 'npx', ['tsc', '--noEmit']);
if (ts.length) run('vitest related', 'npx', ['vitest', 'related', ...ts, '--run', '--reporter=dot', '--passWithNoTests']);
if (changed.some((f) => /^src\/data\/|^scripts\/(validate|qa|check-data)\.ts$|\.defs\.json$/.test(f))) run('check-data', 'node', ['scripts/check-data.ts']);
if (changed.some((f) => /^(vite\.config\.ts|index\.html|package\.json)$/.test(f))) run('vite build', 'npx', ['vite', 'build']);
const java = changed.filter((f) => /^runelite-bridge\/src\/(main|test)\/java\/.*\.java$/.test(f)).map((f) => f.replace(/.*\//, '').replace(/(Test)?\.java$/, ''));
if (java.length) run('java tests', process.platform === 'win32' ? 'runelite-bridge\\gradlew.bat' : 'runelite-bridge/gradlew', ['-p', 'runelite-bridge', '--no-daemon', 'test', ...[...new Set(java)].flatMap((c) => ['--tests', `*${c}*`])]);
if (changed.some((f) => /^src\/(components|pages|ledger|features|ui|app)\/|\.css$/.test(f))) console.log('verify-quick: UI files changed — run the browser scenarios of that feature (npm run test:ui -- --only <feature>; --list names them).');
run('structure', 'node', ['scripts/check-structure.mjs', '--strict']);

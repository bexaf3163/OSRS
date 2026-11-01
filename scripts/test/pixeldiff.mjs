// Compare two screenshot folders (npm run perf -- ... shots) pixel by pixel. Usage: npm run pixeldiff -- <dirA> <dirB>
// Compare base with base first: that run's differences are the noise floor (live clocks, timed toasts).
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const [,, A, B, tools = process.cwd()] = process.argv;
const require = createRequire(tools + '/package.json');
const { PNG } = require('pngjs'); const pm = require('pixelmatch'); const pixelmatch = pm.default || pm;
let total = 0, changed = 0, sizeDiff = 0; const rows = [];
for (const f of readdirSync(A).filter((x) => x.endsWith('.png'))) {
  const a = PNG.sync.read(readFileSync(`${A}/${f}`)); let b; try { b = PNG.sync.read(readFileSync(`${B}/${f}`)); } catch { rows.push(`${f}: missing in B`); continue; }
  total++;
  if (a.width !== b.width || a.height !== b.height) { sizeDiff++; rows.push(`${f}: size ${a.width}x${a.height} vs ${b.width}x${b.height}`); continue; }
  const d = pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0 });
  if (d) { changed++; rows.push(`${f}: ${d} pixels differ`); }
}
console.log(`screenshots compared: ${total}; identical: ${total - changed - sizeDiff}; pixel differences: ${changed}; size differences: ${sizeDiff}`);
rows.slice(0, 20).forEach((r) => console.log('  ' + r));

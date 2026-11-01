// Compare `npm run perf -- ... timing` outputs. Usage: node scripts/test/perf-compare.mjs base1.json head1.json [base2.json head2.json]
// With two pairs, values are averaged per pair before the change is computed.
import { readFileSync } from 'node:fs';
const files = process.argv.slice(2).map((f) => JSON.parse(readFileSync(f, 'utf8')));
const pairs = files.length >= 4 ? [[files[0], files[1]], [files[2], files[3]]] : [[files[0], files[1]]];
const avg = (pick) => pairs.map(([a, b]) => [pick(a), pick(b)]).reduce((s, [x, y]) => [s[0] + x / pairs.length, s[1] + y / pairs.length], [0, 0]);
const pct = ([x, y]) => `${x.toFixed(1)} -> ${y.toFixed(1)} (${(100 * (y - x) / x).toFixed(0)}%)`;
const a0 = pairs[0][0];
console.log('COLD START');
for (const r of Object.keys(a0.cold)) for (const k of ['fcp', 'scriptMs', 'taskMs', 'tbt', 'longMax', 'heapMB']) console.log(r.padEnd(20), k.padEnd(9), pct(avg((j) => j.cold[r][k])));
console.log('PAGE SWITCH taskMs'); for (const r of Object.keys(a0.switch)) console.log(r.padEnd(20), pct(avg((j) => j.switch[r].taskMs)));
console.log('PER UPDATE scriptMs'); let s = [0, 0], n = 0;
for (const r of Object.keys(a0.events)) { const v = avg((j) => j.events[r].scriptMs); if (!/ XP$/.test(r)) { s = [s[0] + v[0], s[1] + v[1]]; n++; } console.log(r.padEnd(28), pct(v)); }
console.log('mean non-XP update', pct([s[0] / n, s[1] / n]));

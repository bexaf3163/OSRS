// Structure guard (the change hygiene rules in PROJECT_HANDOFF.md). Usage: npm run check-structure (strict: exits 1 when a check exceeds its known debt); without --strict it only reports
// Checks: runtime import cycles, file-size budget, JSON imports outside src/data, hard-coded '#/' links outside the page registry,
// folder size, handoff length, extensions in modules Node loads, fixed sleeps in browser scenarios, loose files in scripts/, and layer rules, folder
// dependency cycles and React placement once src/domain exists.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
const t0 = Date.now(); const strict = process.argv.includes('--strict');
// Paths use '/' on every OS, so the folder rules below also hold on Windows.
const walk = (d) => existsSync(d) ? readdirSync(d).flatMap((n) => { const p = `${d}/${n}`; return statSync(p).isDirectory() ? (n === 'node_modules' || n === 'build' ? [] : walk(p)) : [p]; }) : [];
// Unit tests beside their module are not part of the app: the size check below still counts them.
const src = walk('src').filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f)); const set = new Set(src); const report = []; let failed = 0;
const res = (from, spec) => { if (!spec.startsWith('.')) return null; const b = resolve(dirname(from), spec); for (const c of [b, b + '.ts', b + '.tsx', b + '/index.ts', b + '/index.tsx']) { const r = relative(process.cwd(), c).replace(/\\/g, '/'); if (set.has(r)) return r; } return null; };
// runtime edges (verbatimModuleSyntax: `import type` is erased, `import { type X }` is NOT). Static imports only:
// `import('x').T` in a type annotation is erased, and lazy import() cannot create load-order cycles.
const g = new Map(); const text = new Map();
for (const f of src) { const t = readFileSync(f, 'utf8'); text.set(f, t); const d = new Set(); for (const m of t.matchAll(/(?:^|\n)[ \t]*(import|export)[ \t]+(type[ \t]+)?(?:[\w*$,{}\s]*?)from[ \t]*['"]([^'"]+)['"]/g)) { if (m[2]) continue; const r = res(f, m[3]); if (r) d.add(r); } g.set(f, [...d]); }
let idx = 0; const st = [], on = new Set(), ix = new Map(), low = new Map(), scc = [];
const sc = (v) => { ix.set(v, idx); low.set(v, idx); idx++; st.push(v); on.add(v); for (const w of g.get(v) || []) { if (!ix.has(w)) { sc(w); low.set(v, Math.min(low.get(v), low.get(w))); } else if (on.has(w)) low.set(v, Math.min(low.get(v), ix.get(w))); } if (low.get(v) === ix.get(v)) { const c = []; let w; do { w = st.pop(); on.delete(w); c.push(w); } while (w !== v); if (c.length > 1) scc.push(c); } };
for (const f of src) if (!ix.has(f)) sc(f);
// Known debt that --strict still accepts until its batch lands (S8 big files, src/styles.css); lower it as it shrinks, never raise it.
const DEBT = { 'files over 1,000 lines': 1 };
const check = (name, count, detail) => { const debt = DEBT[name] ?? 0; detail = [detail, debt && `known debt ${debt}${count < debt ? `, lower it to ${count}` : ''}`].filter(Boolean).join('; '); const ok = count <= debt; report.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };
check('runtime import cycles', scc.length, scc.map((c) => `${c.length} modules (${c.slice(0, 3).map((x) => x.replace('src/', '')).join(', ')}…)`).join('; '));
const sized = [...walk('src'), ...walk('scripts'), ...walk('tests'), ...walk('runelite-bridge/src/main')].filter((f) => /\.(ts|tsx|java|css)$/.test(f)).map((f) => ({ f, n: readFileSync(f, 'utf8').split('\n').length }));
const hard = sized.filter((x) => x.n > 1000), soft = sized.filter((x) => x.n > 600 && x.n <= 1000);
check('files over 1,000 lines', hard.length, hard.map((x) => `${x.f} (${x.n})`).join(', '));
report.push(`WARN  files over 600 lines: ${soft.length}`);
// Code outside src/data, tests and scripts included, reads data through src/data/index.ts, so the data folders can move.
const outside = [...walk('src'), ...walk('tests'), ...walk('scripts')].filter((f) => /\.(ts|tsx|mjs)$/.test(f) && !f.startsWith('src/data/'));
const jsonOutside = outside.filter((f) => [...readFileSync(f, 'utf8').matchAll(/(?:from\s*|import\(\s*)['"]([^'"]+\.json)['"]/g)]
  .some((m) => relative(process.cwd(), resolve(dirname(f), m[1])).replace(/\\/g, '/').startsWith('src/data/')));
check('JSON imports only in src/data', jsonOutside.length, jsonOutside.join(', '));
// Data JSON sits in src/data/authored (by hand) or src/data/generated, which holds exactly what src/data/manifest.json lists,
// each from an existing command; an npm generator names the file it writes.
const generated = JSON.parse(readFileSync('src/data/manifest.json', 'utf8')).generated;
const npmScripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
const genFiles = readdirSync('src/data/generated').map((n) => (statSync(`src/data/generated/${n}`).isDirectory() ? `${n}/` : n));
const dataProblems = [
  ...readdirSync('src/data').filter((n) => n.endsWith('.json') && n !== 'manifest.json').map((n) => `${n} outside authored/ and generated/`),
  ...genFiles.filter((n) => !(n in generated)).map((n) => `generated/${n} not in the manifest`),
  ...Object.keys(generated).filter((n) => !genFiles.includes(n)).map((n) => `generated/${n} listed but missing`),
  ...Object.entries(generated).filter(([n, c]) => (c.startsWith('npm run ')
    ? !npmScripts[c.slice(8)] || !readFileSync(npmScripts[c.slice(8)].split(' ')[1], 'utf8').includes(`src/data/generated/${n}`)
    : !existsSync(c.replace(/^python /, '')))).map(([n, c]) => `${c} does not write generated/${n}`),
];
check('generated data as src/data/manifest.json lists it', dataProblems.length, dataProblems.join(', '));
const registry = /src\/domain\/pages\/pages\.ts$/; const hash = src.filter((f) => !registry.test(f) && /['"`]#\/[a-z]/.test(text.get(f)));
check("no hard-coded '#/' links outside the page registry", hash.length, `${hash.length} files`);
const keys = src.filter((f) => !f.endsWith('src/domain/persistence/storageKeys.ts') && /['"]osrs-put[:-]/.test(text.get(f)));
check('storage keys only in the key registry', keys.length, keys.join(', '));
// Node runs scripts/ and electron/ without a bundler, so every module they load names relative files with their extension.
const nodeLoads = new Set(), noExt = [];
const load = (f) => { if (nodeLoads.has(f) || !existsSync(f)) return; nodeLoads.add(f); for (const m of readFileSync(f, 'utf8').matchAll(/^(?:import|export)\s+(?!type\b)[^;]*?from\s+'(\.[^']+)'/gm)) { if (!/\.(ts|tsx|mjs|cjs|js|json)$/.test(m[1])) noExt.push(`${relative(process.cwd(), f).replace(/\\/g, '/')} -> ${m[1]}`); else if (/\.(ts|mjs|js)$/.test(m[1])) load(resolve(dirname(f), m[1])); } };
for (const f of [...walk('scripts'), ...walk('electron')]) if (/\.(ts|mjs|js)$/.test(f)) load(resolve(f));
check('extensions in modules Node loads', noExt.length, noExt.join(', '));
// Browser scenarios and review shots wait with settle(); a fixed sleep needs a comment naming the product timer it waits for.
const sleeps = [...walk('scripts/test/ui'), 'scripts/test/review-shots.ts'].filter((f) => f.endsWith('.ts')).filter((f) => readFileSync(f, 'utf8').split('\n').some((l) => /waitForTimeout\(/.test(l) && !l.includes('//')));
check('no fixed sleeps in browser scenarios', sleeps.length, sleeps.join(', '));
// Scripts sit in a purpose folder: data (generators), check, test, release or dev.
const loose = readdirSync('scripts').filter((n) => statSync(`scripts/${n}`).isFile());
check('no loose files in scripts/', loose.length, loose.join(', '));
const perDir = new Map(); for (const f of walk('src').filter((x) => !/\.test\.tsx?$/.test(x))) { const d = f.slice(0, f.lastIndexOf('/')); perDir.set(d, (perDir.get(d) || 0) + 1); }
const crowded = [...perDir].filter(([, n]) => n > 25);
check('folders of at most 25 files', crowded.length, crowded.map(([d, n]) => `${d} (${n})`).join(', '));
// Words contain a letter or digit, so table pipes, arrows and list marks do not count.
const words = existsSync('PROJECT_HANDOFF.md') ? readFileSync('PROJECT_HANDOFF.md', 'utf8').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length : 0;
check('PROJECT_HANDOFF.md within 5,000 words', words > 5000 ? 1 : 0, `${words} words`);
if (existsSync('src/domain')) {
  const layer = (f) => { const p = f.split('/'); return p[1] === 'domain' ? 'domain' : p[1] === 'features' ? 'features' : p.length > 2 ? p[1] : 'root'; };
  const allowed = { domain: ['domain', 'data', 'types'], services: ['services', 'domain', 'data', 'types'], state: ['state', 'domain', 'services', 'data', 'types'], ui: ['ui', 'ledger', 'state', 'types', 'domain', 'data'], ledger: ['ledger', 'ui', 'state', 'types', 'domain', 'data'], features: ['features', 'ui', 'ledger', 'state', 'domain', 'services', 'data', 'types'], app: ['app', 'features', 'ui', 'ledger', 'state', 'domain', 'services', 'data', 'types'], data: ['data', 'types', 'domain'], types: ['types', 'data'], root: ['app', 'ledger', 'state', 'ui', 'types', 'data', 'services', 'domain'] };
  let v = 0; for (const [a, ds] of g) for (const b of ds) if (!(allowed[layer(a)] || []).includes(layer(b))) v++;
  check('layer rules', v, `${v} violating imports`);
  // A feature may reuse another feature's component and a domain area another area's engine, one way only, also through a third folder.
  const group = (f) => { const p = f.split('/'); return p[1] === 'domain' || p[1] === 'features' ? `${p[1]}/${p[2]}` : p.length > 2 ? p[1] : 'root'; };
  const fg = new Map(); for (const [a, ds] of g) for (const b of ds) { const x = group(a), y = group(b); if (x !== y) { if (!fg.has(x)) fg.set(x, new Set()); fg.get(x).add(y); } }
  let n = 0; const fix = new Map(), flow = new Map(), fst = [], fon = new Set(), loops = [];
  const visit = (v) => { fix.set(v, n); flow.set(v, n); n++; fst.push(v); fon.add(v); for (const w of fg.get(v) || []) { if (!fix.has(w)) { visit(w); flow.set(v, Math.min(flow.get(v), flow.get(w))); } else if (fon.has(w)) flow.set(v, Math.min(flow.get(v), fix.get(w))); } if (flow.get(v) === fix.get(v)) { const c = []; let w; do { w = fst.pop(); fon.delete(w); c.push(w); } while (w !== v); if (c.length > 1) loops.push(c); } };
  for (const v of fg.keys()) if (!fix.has(v)) visit(v);
  check('no folder dependency cycles', loops.length, loops.map((c) => c.join(' -> ')).join('; '));
  const react = src.filter((f) => ['domain', 'services', 'data', 'types'].includes(layer(f)) && /^import (?!type )[^;]*from 'react(-dom)?'/m.test(text.get(f)));
  check('React only in app, state, ui, ledger and features', react.length, react.join(', '));
}
console.log(report.join('\n')); console.log(`structure guard: ${failed} failing check(s) in ${Date.now() - t0} ms${strict ? '' : ' (report-only)'}`);
process.exit(strict && failed ? 1 : 0);

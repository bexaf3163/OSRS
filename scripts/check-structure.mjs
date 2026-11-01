// Structure guard (the change hygiene rules in PROJECT_HANDOFF.md). Usage: npm run check-structure [-- --strict]   (report-only by default; --strict exits 1 when a check exceeds its known debt)
// Checks: runtime import cycles, file-size budget, JSON imports outside src/data, hard-coded '#/' links outside the page registry,
// folder size, handoff length, and layer rules, two-way folder dependencies and React placement once src/domain exists.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
const t0 = Date.now(); const strict = process.argv.includes('--strict');
// Paths use '/' on every OS, so the folder rules below also hold on Windows.
const walk = (d) => existsSync(d) ? readdirSync(d).flatMap((n) => { const p = `${d}/${n}`; return statSync(p).isDirectory() ? (n === 'node_modules' || n === 'build' ? [] : walk(p)) : [p]; }) : [];
const src = walk('src').filter((f) => /\.(ts|tsx)$/.test(f)); const set = new Set(src); const report = []; let failed = 0;
const res = (from, spec) => { if (!spec.startsWith('.')) return null; const b = resolve(dirname(from), spec); for (const c of [b, b + '.ts', b + '.tsx', b + '/index.ts', b + '/index.tsx']) { const r = relative(process.cwd(), c).replace(/\\/g, '/'); if (set.has(r)) return r; } return null; };
// runtime edges (verbatimModuleSyntax: `import type` is erased, `import { type X }` is NOT). Static imports only:
// `import('x').T` in a type annotation is erased, and lazy import() cannot create load-order cycles.
const g = new Map(); const text = new Map();
for (const f of src) { const t = readFileSync(f, 'utf8'); text.set(f, t); const d = new Set(); for (const m of t.matchAll(/(?:^|\n)[ \t]*(import|export)[ \t]+(type[ \t]+)?(?:[\w*$,{}\s]*?)from[ \t]*['"]([^'"]+)['"]/g)) { if (m[2]) continue; const r = res(f, m[3]); if (r) d.add(r); } g.set(f, [...d]); }
let idx = 0; const st = [], on = new Set(), ix = new Map(), low = new Map(), scc = [];
const sc = (v) => { ix.set(v, idx); low.set(v, idx); idx++; st.push(v); on.add(v); for (const w of g.get(v) || []) { if (!ix.has(w)) { sc(w); low.set(v, Math.min(low.get(v), low.get(w))); } else if (on.has(w)) low.set(v, Math.min(low.get(v), ix.get(w))); } if (low.get(v) === ix.get(v)) { const c = []; let w; do { w = st.pop(); on.delete(w); c.push(w); } while (w !== v); if (c.length > 1) scc.push(c); } };
for (const f of src) if (!ix.has(f)) sc(f);
// Known debt that --strict still accepts until its batch lands (S4 links, S6/S8/S9 big files, S7 data); lower it as it shrinks, never raise it.
const DEBT = { 'files over 1,000 lines': 7, 'JSON imports only in src/data': 29, "no hard-coded '#/' links outside the page registry": 30, 'folders of at most 25 files': 1 };
const check = (name, count, detail) => { const debt = DEBT[name] ?? 0; detail = [detail, debt && `known debt ${debt}${count < debt ? `, lower it to ${count}` : ''}`].filter(Boolean).join('; '); const ok = count <= debt; report.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };
check('runtime import cycles', scc.length, scc.map((c) => `${c.length} modules (${c.slice(0, 3).map((x) => x.replace('src/', '')).join(', ')}…)`).join('; '));
const sized = [...walk('src'), ...walk('scripts'), ...walk('tests'), ...walk('runelite-bridge/src/main')].filter((f) => /\.(ts|tsx|java|css)$/.test(f)).map((f) => ({ f, n: readFileSync(f, 'utf8').split('\n').length }));
const hard = sized.filter((x) => x.n > 1000), soft = sized.filter((x) => x.n > 600 && x.n <= 1000);
check('files over 1,000 lines', hard.length, hard.map((x) => `${x.f} (${x.n})`).join(', '));
report.push(`WARN  files over 600 lines: ${soft.length}`);
const jsonOutside = src.filter((f) => !f.startsWith('src/data/') && /from\s*['"][^'"]+\.json['"]/.test(text.get(f)));
check('JSON imports only in src/data', jsonOutside.length, `${jsonOutside.length} files`);
const registry = /src\/app\/pages\.ts$/; const hash = src.filter((f) => !registry.test(f) && /['"`]#\/[a-z]/.test(text.get(f)));
check("no hard-coded '#/' links outside the page registry", hash.length, `${hash.length} files`);
const perDir = new Map(); for (const f of walk('src')) { const d = f.slice(0, f.lastIndexOf('/')); perDir.set(d, (perDir.get(d) || 0) + 1); }
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
  // A feature may reuse another feature's component and a domain area another area's engine, one way only.
  const group = (f) => { const p = f.split('/'); return p[1] === 'domain' || p[1] === 'features' ? `${p[1]}/${p[2]}` : p.length > 2 ? p[1] : 'root'; };
  const links = new Set(); for (const [a, ds] of g) for (const b of ds) links.add(`${group(a)}|${group(b)}`);
  const twoWay = [...links].filter((k) => { const [a, b] = k.split('|'); return a < b && links.has(`${b}|${a}`); });
  check('no two-way folder dependencies', twoWay.length, twoWay.map((k) => k.replace('|', ' <-> ')).join(', '));
  const react = src.filter((f) => ['domain', 'services', 'data', 'types'].includes(layer(f)) && /^import (?!type )[^;]*from 'react(-dom)?'/m.test(text.get(f)));
  check('React only in app, state, ui, ledger and features', react.length, react.join(', '));
}
console.log(report.join('\n')); console.log(`structure guard: ${failed} failing check(s) in ${Date.now() - t0} ms${strict ? '' : ' (report-only)'}`);
process.exit(strict && failed ? 1 : 0);

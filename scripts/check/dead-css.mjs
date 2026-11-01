// Dead CSS: rules whose every selector needs a class that no src TS/TSX file or index.html contains (`prefix-${x}` classes count as live).
// :not(...) and attribute values never make a selector dead; :is/:where/:has are dead only when every branch is.
// Usage: npm run dead-css [-- --write]   (lists dead rules and exits 1; --write removes them and lists the selectors in
// $AUDIT_OUT/removed-selectors.json, to be proven with `npm run perf -- ... selprobe` and a pixel diff).
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import postcss from 'postcss';
const write = process.argv.includes('--write');
const walk = (d) => readdirSync(d).flatMap((n) => { const p = `${d}/${n}`; return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk('src');
const code = files.filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f)).map((f) => readFileSync(f, 'utf8')).join('\n') + readFileSync('index.html', 'utf8');
const tokens = new Set(code.match(/[A-Za-z][A-Za-z0-9_-]*/g));
const prefixes = [...new Set([...code.matchAll(/([a-z][a-z0-9-]*-)\$\{/g)].map((m) => m[1]).concat([...code.matchAll(/'([a-z][a-z0-9-]*-)'\s*\+/g)].map((m) => m[1])))];
const live = (c) => tokens.has(c) || prefixes.some((p) => c.startsWith(p));

function selectorDead(sel) {
  let s = sel.replace(/\[[^\]]*\]/g, '');
  const groups = /:(not|is|where|has)\(((?:[^()]|\([^()]*\))*)\)/g; let m;
  while ((m = groups.exec(s))) {
    const branches = m[2].split(',').map((b) => [...b.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)].map((x) => x[1]));
    if ((m[1] === 'is' || m[1] === 'where' || m[1] === 'has') && branches.every((cls) => cls.some((c) => !live(c)))) return true;
  }
  s = s.replace(/:(not|is|where|has)\((?:[^()]|\([^()]*\))*\)/g, '');
  return [...s.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)].some((x) => !live(x[1]));
}

const dead = [];
for (const f of files.filter((x) => x.endsWith('.css'))) {
  const root = postcss.parse(readFileSync(f, 'utf8'));
  root.walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && /keyframes/.test(rule.parent.name)) return;
    const keep = rule.selectors.filter((sel) => !selectorDead(sel));
    if (keep.length === rule.selectors.length) return;
    for (const sel of rule.selectors) if (!keep.includes(sel)) dead.push(`${f}: ${sel}`);
    if (keep.length === 0) rule.remove(); else rule.selectors = keep;
  });
  root.walkAtRules((a) => { if (/media|supports/.test(a.name) && !a.nodes?.length) a.remove(); });
  if (write) writeFileSync(f, root.toString());
}
if (write) writeFileSync(`${process.env.AUDIT_OUT || '.'}/removed-selectors.json`, JSON.stringify(dead.map((d) => d.slice(d.indexOf(': ') + 2))));
console.log(dead.length ? `${write ? 'removed' : 'dead'} selectors: ${dead.length}\n  ${dead.join('\n  ')}` : 'dead-css: none');
process.exit(dead.length && !write ? 1 : 0);

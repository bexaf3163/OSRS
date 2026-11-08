// npm run funding-coverage — writes docs/FUNDING_COVERAGE.md from src/data/authored/fundingCoverage.json, fundingMethods.json and
// generated/fundingWiki.json: which of the wiki's free-to-play money-making guides the funding system can plan, and which it
// cannot and why. No network; the data files are the record.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dataFile } from '../check/paths.ts';

interface Entry { id: string; status: 'supported' | 'unsupported'; family?: string; reason?: string; methods?: string[]; note?: string }
interface Coverage { version: number; generatedAt: string; source: string; entries: Entry[]; extras: Entry[] }
interface Method { id: string; title: string; intensity?: string; rate: { basis: string; perHour: { typical: number }; unit: string }; sources: { title: string; url: string; revision?: number }[] }

const read = <T>(name: string): T => JSON.parse(readFileSync(dataFile(`${name}.json`), 'utf8')) as T;
const cov = read<Coverage>('fundingCoverage');
const wiki = read<{ generatedAt: string; methods: Method[]; notBuilt: { id: string; title: string; reason: string }[] }>('fundingWiki');
const methods = [...read<{ methods: Method[] }>('fundingMethods').methods, ...wiki.methods];
const notPlanned = [
  ...cov.entries.filter((e) => e.status === 'unsupported').map((e) => ({ id: e.id, reason: e.reason ?? 'No reason recorded' })),
  ...wiki.notBuilt.map((n) => ({ id: n.id, reason: `The card cannot be built: ${n.reason}` })),
];
const byReason = new Map<string, string[]>();
for (const e of notPlanned) byReason.set(e.reason, [...(byReason.get(e.reason) ?? []), e.id]);

const lines: string[] = [];
lines.push('# Funding coverage');
lines.push('');
lines.push(`Generated from \`src/data/authored/fundingCoverage.json\` (${cov.generatedAt}) and \`src/data/generated/fundingWiki.json\` (${wiki.generatedAt}). Do not edit by hand: change the data and run \`npm run funding-coverage\`.`);
lines.push('');
lines.push(`**${methods.length} methods are planned by the engine**: ${methods.length - wiki.methods.length} modelled by hand, ${wiki.methods.length} built from their wiki card (\`npm run build-money\`). ${notPlanned.length} guides are not, each for a stated reason.`);
lines.push('');
lines.push('## Planned methods');
lines.push('');
lines.push('| Method | Guide | Pace basis | Units an hour (published) | Attention |');
lines.push('|---|---|---|---|---|');
for (const m of methods) {
  const src = m.sources[0];
  lines.push(`| ${m.title} | ${src ? `[${src.title}](${src.url})${src.revision ? ` (rev ${src.revision})` : ''}` : 'none'} | ${m.rate.basis} | ${Math.round(m.rate.perHour.typical).toLocaleString('en-US')} ${m.rate.unit} | ${m.intensity ?? 'moderate'} |`);
}
lines.push('');
lines.push('A method is offered only when the account can do it now (levels, quests, membership, tool, sale restrictions), its first batch is affordable, and its product can be sold. Income counted is dependable income only (a drop chance of 1/16 or better); rare drops are upside and never a plan. A method a few levels away is shown with the levels that open it.');
lines.push('');
lines.push('## Not planned, and why');
lines.push('');
for (const [reason, list] of [...byReason].sort((a, b) => b[1].length - a[1].length)) lines.push(`- **${reason}** (${list.length}): ${list.join(', ')}`);
lines.push('');
lines.push('## Other ways the engine can close a shortage');
lines.push('');
for (const x of cov.extras ?? []) lines.push(`- **${x.id}** (${x.status}): ${x.note ?? x.family}`);
lines.push('');

mkdirSync(new URL('../../docs/', import.meta.url), { recursive: true });
writeFileSync(new URL('../../docs/FUNDING_COVERAGE.md', import.meta.url), lines.join('\n'));
console.log(`docs/FUNDING_COVERAGE.md: ${methods.length} planned, ${notPlanned.length} not planned, ${(cov.extras ?? []).length} other ways`);

// npm run funding-coverage — writes docs/FUNDING_COVERAGE.md from src/data/fundingCoverage.json and fundingMethods.json: which of the wiki's free-to-play
// money-making guides the funding system can plan, which it cannot and why. No network; the data files are the record.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DATA_DIR } from './paths.ts';

interface Entry { id: string; status: 'supported' | 'unsupported'; family: string; reason?: string; methods?: string[]; note?: string }
interface Coverage { version: number; generatedAt: string; source: string; entries: Entry[]; extras: Entry[] }
interface Method { id: string; title: string; kind?: string; intensity?: string; rate: { basis: string; perHour: { typical: number } }; sources: { title: string; url: string; revision?: number }[] }

const read = <T>(name: string): T => JSON.parse(readFileSync(`${DATA_DIR}/${name}.json`, 'utf8')) as T;
const cov = read<Coverage>('fundingCoverage');
const methods = read<{ methods: Method[] }>('fundingMethods').methods;

const supported = cov.entries.filter((e) => e.status === 'supported');
const unsupported = cov.entries.filter((e) => e.status === 'unsupported');
const byReason = new Map<string, Entry[]>();
for (const e of unsupported) byReason.set(e.reason ?? 'No reason recorded', [...(byReason.get(e.reason ?? 'No reason recorded') ?? []), e]);

const lines: string[] = [];
lines.push('# Funding coverage');
lines.push('');
lines.push(`Generated from \`src/data/fundingCoverage.json\` (${cov.generatedAt}) against ${cov.source}. Do not edit by hand: change the data and run \`npm run funding-coverage\`.`);
lines.push('');
lines.push(`${cov.entries.length} guides were read. **${supported.length} are planned by the engine**, ${unsupported.length} are not, each for a stated reason.`);
lines.push('');
lines.push('## Planned methods');
lines.push('');
lines.push('| Method | Guide | Pace basis | Units an hour (published, typical) | Attention |');
lines.push('|---|---|---|---|---|');
for (const m of methods) {
  const src = m.sources[0];
  lines.push(`| ${m.title} | ${src ? `[${src.title}](${src.url})${src.revision ? ` (rev ${src.revision})` : ''}` : 'none'} | ${m.rate.basis} | ${Math.round(m.rate.perHour.typical).toLocaleString('en-US')} | ${m.intensity ?? 'moderate'} |`);
}
lines.push('');
lines.push('A method is offered only when the account can do it now (levels, quests, membership, tool, sale restrictions), its first batch is affordable, and its product can be sold. Income counted is dependable income only (a drop chance of 1/16 or better); rare drops are upside and never a plan.');
lines.push('');
lines.push('## Not planned, and why');
lines.push('');
for (const [reason, list] of [...byReason].sort((a, b) => b[1].length - a[1].length)) {
  lines.push(`- **${reason}** (${list.length}): ${list.map((e) => e.id).join(', ')}`);
}
lines.push('');
lines.push('## Other ways the engine can close a shortage');
lines.push('');
for (const x of cov.extras ?? []) lines.push(`- **${x.id}** (${x.status}): ${x.note ?? x.family}`);
lines.push('');

mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
writeFileSync(new URL('../docs/FUNDING_COVERAGE.md', import.meta.url), lines.join('\n'));
console.log(`docs/FUNDING_COVERAGE.md: ${supported.length} planned, ${unsupported.length} not planned, ${(cov.extras ?? []).length} other ways`);

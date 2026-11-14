// Holds every quest draft in src/data/drafts/ against its Quest Helper facts and its Wiki quest card (checkDraft in
// scripts/data/quest-draft.ts). A contradiction fails; what no source confirms is printed as unknown and never passes
// for a fact.   npm run check-drafts
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkDraft, type QhFacts, type QuestDraft } from '../data/quest-draft.ts';

const dir = fileURLToPath(new URL('../../src/data/drafts/', import.meta.url));
const read = (name: string) => JSON.parse(readFileSync(`${dir}${name}`, 'utf8'));
let failed = 0;
for (const name of readdirSync(dir).filter((f) => f.endsWith('.json') && !f.endsWith('.qh.json')).sort()) {
  const draft = read(name) as QuestDraft;
  const fails = checkDraft(draft, read(name.replace(/\.json$/, '.qh.json')) as QhFacts);
  failed += fails.length;
  const lines = draft.stages.stages.reduce((n, s) => n + s.do.length, 0);
  console.log(`${fails.length ? 'FAIL' : 'PASS'}  ${draft.quest}: ${draft.stages.stages.length} stages, ${lines} lines, ${draft.unknown.length} unknown`);
  for (const fail of fails) console.log(`      ✗ ${fail}`);
  for (const line of draft.unknown) console.log(`      ? ${line}`);
}
if (failed) { console.log(`${failed} contradiction(s)`); process.exit(1); }

// Holds every quest draft in src/data/drafts/ against its Quest Helper facts and its Wiki quest card (checkDraft in
// scripts/data/quest-draft.ts), then walks its stages over the planner's surface collision data (replayStages). A
// contradiction or a line off the ground fails; what no source confirms is printed as unknown and never passes for a
// fact.   npm run check-drafts
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { collisionSubset } from '../../src/domain/travel/worldRouting.ts';
import { checkDraft, replayStages, type QhFacts, type QuestDraft } from '../data/quest-draft.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = `${root}src/data/drafts/`;
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const topology = collisionSubset(read(`${root}src/data/generated/worldRouting.json`));
let failed = 0;
for (const name of readdirSync(dir).filter((f) => f.endsWith('.json') && !f.endsWith('.qh.json')).sort()) {
  const draft = read(`${dir}${name}`) as QuestDraft;
  const walk = replayStages(draft.stages.stages, draft.step.mapLocation, topology);
  const fails = [...checkDraft(draft, read(`${dir}${name.replace(/\.json$/, '.qh.json')}`) as QhFacts), ...walk.fails];
  failed += fails.length;
  const lines = draft.stages.stages.reduce((n, s) => n + s.do.length, 0);
  console.log(`${fails.length ? 'FAIL' : 'PASS'}  ${draft.quest}: ${draft.stages.stages.length} stages, ${lines} lines, ${draft.unknown.length} unknown;`
    + ` walk: ${walk.proven} of ${walk.located} located lines proven, ${walk.unchecked} outside the walking data`);
  for (const fail of fails) console.log(`      ✗ ${fail}`);
  for (const line of [...draft.unknown, ...walk.unproven]) console.log(`      ? ${line}`);
}
if (failed) { console.log(`${failed} contradiction(s)`); process.exit(1); }

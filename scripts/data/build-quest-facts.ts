// Refresh canonical quest requirements/rewards; authored walkthroughs and historical step IDs stay in place.
import { readFileSync, writeFileSync } from 'node:fs';
import { wikiArticle } from './wiki.ts';
import { questFacts } from './quest-facts.ts';
import { deriveQuests } from '../../src/data/quests.ts';
import type { Step } from '../../src/types/index.ts';

const steps = JSON.parse(readFileSync(new URL('../../src/data/authored/steps.json', import.meta.url), 'utf8')) as Step[];
const quests = deriveQuests(steps).filter(q => q.qp > 0);
const items = [];
const retrievedAt = new Date().toISOString();
for (const quest of quests) {
  const step = steps.find(s => s.id === quest.stepId)!;
  // A step that covers one subquest ("Recipe for Disaster — Another Cook's Quest") reads that subquest's own card.
  const sub = step.title.split(' — ');
  const page = sub.length === 2 ? sub.join('/') : decodeURIComponent(new URL(step.wikiUrl!).pathname.split('/').pop()!).replaceAll('_', ' ');
  // Membership comes from the route step (checked against Quest Helper): many Members cards do not state it.
  items.push({ ...questFacts(await wikiArticle(page), quest.parts.length ? quest.parts : [step.id], retrievedAt), members: step.membersOnly === true });
}
if (!items.length || new Set(items.map(q => q.id)).size !== quests.length) throw new Error('Incomplete or duplicated quest catalogue');
writeFileSync(new URL('../../src/data/generated/questFacts.json', import.meta.url), JSON.stringify({ items }, null, 2) + '\n');
console.log(`Verified ${items.length} quests with source revisions`);

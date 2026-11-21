// Builds src/data/generated/itemFacts.json: for every item the training data names, the Grand Exchange facts of the OSRS Wiki's
// real-time prices API (members flag, four-hour buy limit, high alchemy value). The F2P checks read it: an F2P method may use only
// items free players can use. Untradeable items are absent. Run: npm run build-item-facts (needs a network).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const json = (p: string) => JSON.parse(readFileSync(`${root}${p}`, 'utf8'));
const methods = json('src/data/authored/trainingMethods.json').methods as { needs?: { name?: string; anyOf?: string[] }[] }[];
const processing = json('src/data/generated/processing.json') as { recipes: { inputs: { name: string }[]; output: { name: string } | null }[] };
const skilling = json('src/data/generated/skilling.json') as { resources: { products: { name: string }[] }[]; tools: Record<string, { tiers: { item: string }[] }> };
const names = new Set<string>([
  ...methods.flatMap((m) => (m.needs ?? []).flatMap((n) => [n.name ?? [], ...(n.anyOf ?? [])].flat())),
  ...processing.recipes.flatMap((r) => [...r.inputs.map((i) => i.name), ...(r.output ? [r.output.name] : [])]),
  ...skilling.resources.flatMap((r) => r.products.map((p) => p.name)),
  ...Object.values(skilling.tools).flatMap((t) => t.tiers.map((x) => x.item)),
]);
const res = await fetch('https://prices.runescape.wiki/api/v1/osrs/mapping', { headers: { 'User-Agent': 'osrs-path-builder' }, signal: AbortSignal.timeout(30_000) });
if (!res.ok) throw new Error(`mapping: HTTP ${res.status}`);
const byName = new Map((await res.json() as { id: number; name: string; members: boolean; limit?: number; highalch?: number }[]).map((m) => [m.name.toLowerCase(), m]));
const items: Record<string, { id: number; members: boolean; limit: number | null; highAlch: number | null }> = {};
for (const name of [...names].sort()) {
  const m = byName.get(name.toLowerCase());
  if (m) items[name] = { id: m.id, members: m.members, limit: m.limit ?? null, highAlch: m.highalch ?? null };
}
writeFileSync(`${root}src/data/generated/itemFacts.json`, JSON.stringify({ source: 'OSRS Wiki real-time prices API /mapping (scripts/data/build-item-facts.ts)', items }, null, 1) + '\n');
console.log(`itemFacts: ${Object.keys(items).length} of ${names.size} named items are tradeable`);

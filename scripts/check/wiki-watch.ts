// The Wiki watch (npm run wiki-watch, weekly in .github/workflows/wiki-watch.yml): which Wiki pages our data cites have changed
// since they were last reviewed, and which quests the Wiki lists that it did not list then. Needs a network.
//   --report <file>  writes the Markdown report (empty sections are left out)
//   --accept         stores today's revisions and quest lists as reviewed (src/data/generated/wikiRevisions.json)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const API = 'https://oldschool.runescape.wiki/api.php';
const WIKI = 'https://oldschool.runescape.wiki/w/';
// The Wiki asks automated clients to name a contact: the project's public page.
const UA = 'osrs-route-money-builder (https://github.com/bexaf3163/OSRS)';
const BASELINE = new URL('src/data/generated/wikiRevisions.json', root);
// A quest is a page with a quest or miniquest infobox; the quest categories also hold guides and lists ("Quest points").
const INFOBOXES = ['Template:Infobox Quest', 'Template:Infobox Miniquest'];
// GitHub refuses an issue body above 65,536 characters.
const MAX_REPORT = 60_000;
const args = process.argv.slice(2);

interface Baseline { checked: string; revisions: Record<string, number>; quests: string[] }

// Every Wiki link in the data is watched, so new content joins the watch by carrying its link; wikiRevisions.json itself is left out.
const files = execFileSync('git', ['ls-files', 'src/data/authored/*.json', 'src/data/generated/*.json', 'scripts/data/*.json'], { cwd: root, encoding: 'utf8' })
  .split('\n').filter((f) => f && !f.endsWith('wikiRevisions.json'));
// A title keeps its own brackets ("Alan (Scrambled!)"); a bracket that only closes the surrounding text is dropped.
const balanced = (t: string) => { while (t.endsWith(')') && t.split(')').length > t.split('(').length) t = t.slice(0, -1); return t; };
// A full stop that ends a sentence is dropped; a title with dots of its own keeps its last one ("Another Slice of H.A.M.").
const sentenceEnd = (t: string) => { t = t.replace(/[,;:]+$/, ''); return t.endsWith('.') && !t.slice(0, -1).includes('.') ? t.slice(0, -1) : t; };
const titles = [...new Set(files.flatMap((f) => [...readFileSync(new URL(f, root), 'utf8').matchAll(/https:\/\/oldschool\.runescape\.wiki\/w\/([^"#?\s\\]+)/g)]
  .map((m) => balanced(sentenceEnd(decodeURIComponent(m[1]).replace(/_/g, ' '))))))]
  .filter((t) => !/^(File|Special|Category):/.test(t)).sort();

async function api(params: Record<string, string>): Promise<any> {
  const res = await fetch(`${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Wiki API ${res.status}`);
  await new Promise((r) => setTimeout(r, 300));
  return res.json();
}

/** The current revision of every cited page, under the title our data uses (normalised and redirected titles map back). */
async function revisionsOf(list: string[]): Promise<{ revisions: Record<string, number>; missing: string[] }> {
  const revisions: Record<string, number> = {};
  const missing: string[] = [];
  for (let i = 0; i < list.length; i += 50) {
    const batch = list.slice(i, i + 50);
    const { query } = await api({ action: 'query', prop: 'info', titles: batch.join('|'), redirects: '1' });
    const hop = new Map<string, string>([...(query.normalized ?? []), ...(query.redirects ?? [])].map((x: { from: string; to: string }) => [x.from, x.to]));
    const page = new Map<string, { lastrevid?: number; missing?: boolean }>((query.pages ?? []).map((p: { title: string }) => [p.title, p]));
    for (const title of batch) {
      let t = title;
      for (let n = 0; n < 3 && hop.has(t); n++) t = hop.get(t)!;
      const p = page.get(t);
      if (!p || p.missing || !p.lastrevid) missing.push(title);
      else revisions[title] = p.lastrevid;
    }
  }
  return { revisions, missing };
}

async function questsOnWiki(): Promise<string[]> {
  const out: string[] = [];
  for (const eititle of INFOBOXES) {
    let cont: string | undefined;
    do {
      const data = await api({ action: 'query', list: 'embeddedin', eititle, einamespace: '0', eilimit: '500', ...(cont ? { eicontinue: cont } : {}) });
      out.push(...data.query.embeddedin.map((m: { title: string }) => m.title).filter((t: string) => !t.includes('/')));
      cont = data.continue?.eicontinue;
    } while (cont);
  }
  return [...new Set(out)].sort();
}

// Every character a Markdown link or a URL could misread is encoded: brackets, ?, # and &.
const link = (t: string) => `[${t.replace(/[[\]]/g, '\\$&')}](${WIKI}${encodeURIComponent(t.replace(/ /g, '_')).replace(/%2F/g, '/').replace(/\(/g, '%28').replace(/\)/g, '%29')})`;
const baseline: Baseline | null = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
const { revisions, missing } = await revisionsOf(titles);
const quests = await questsOnWiki();

if (args.includes('--accept') || !baseline) {
  writeFileSync(BASELINE, JSON.stringify({ checked: new Date().toISOString().slice(0, 10), revisions, quests } satisfies Baseline, null, 1) + '\n');
  console.log(`Reviewed as of today: ${Object.keys(revisions).length} pages, ${quests.length} quests${baseline ? '' : ' (first baseline)'}.`);
}

const known = baseline ?? { checked: 'today', revisions, quests };
const changed = Object.entries(revisions).filter(([t, rev]) => known.revisions[t] !== undefined && known.revisions[t] !== rev);
const unseen = Object.keys(revisions).filter((t) => known.revisions[t] === undefined);
const newQuests = quests.filter((q) => !known.quests.includes(q));
const sections: [string, string[]][] = [
  [`New quests on the Wiki since ${known.checked}`, newQuests.map(link)],
  ['Cited pages changed since they were reviewed', changed.map(([t, rev]) => `${link(t)}: [what changed](${API.replace('api.php', 'index.php')}?${new URLSearchParams({ title: t, diff: String(rev), oldid: String(known.revisions[t]) })})`)],
  ['Cited pages that no longer exist', missing.map(link)],
  ['Newly cited pages, not yet reviewed', unseen.map(link)],
];
const full = [`# Wiki watch, ${new Date().toISOString().slice(0, 10)}`, '',
  `${titles.length} cited pages and ${quests.length} quests checked against the review of ${known.checked}. After reviewing, run \`npm run wiki-watch -- --accept\` and commit the baseline.`,
  ...sections.filter(([, rows]) => rows.length).flatMap(([title, rows]) => ['', `## ${title} (${rows.length})`, '', ...rows.map((r) => `- ${r}`)])].join('\n') + '\n';
const report = full.length <= MAX_REPORT ? full
  : full.slice(0, full.lastIndexOf('\n', MAX_REPORT)) + '\n\nThe list is cut here to fit an issue: run `npm run wiki-watch` for all of it.\n';
const at = args.indexOf('--report');
if (at >= 0 && args[at + 1]) writeFileSync(args[at + 1], report);
console.log(sections.map(([title, rows]) => `${title}: ${rows.length}`).join('\n'));

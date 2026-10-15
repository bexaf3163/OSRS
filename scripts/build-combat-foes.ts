// Builds src/data/combatFoes.json from the OSRS Wiki: what the combat estimate needs of a training opponent, for every version of the article
// (the level 12 and the level 27 Minotaur are separate): hitpoints, levels, the defence bonuses the player's hit is rolled against, and what it does
// back (attack level and bonus, style, max hit, speed, aggression). monsters.json (build-gear) keeps one version per opponent for the gear advisor;
// validate.ts checks the two agree. It needs a network. Run: npm run build-combat-foes. No numbers of our own: only the infobox.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${root}src/data/combatFoes.json`;
const UA = 'OSRS-Put tracker (https://github.com/bexaf3163/OSRS)';
const API = 'https://oldschool.runescape.wiki/api.php';

/** The opponents of the training steps whose time and food are estimated. */
const PAGES = ['Minotaur', 'Hill Giant', 'Cow', 'Flesh Crawler', 'Moss giant'];

let last = 0;
async function wikitext(page: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const wait = last + 400 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const res = await fetch(`${API}?${new URLSearchParams({ action: 'parse', page, prop: 'wikitext', format: 'json', formatversion: '2' })}`, { headers: { 'User-Agent': UA } });
    if (res.ok) return ((await res.json()) as { parse: { wikitext: string } }).parse.wikitext;
    if (attempt >= 6 || (res.status !== 429 && res.status < 500)) throw new Error(`${page}: ${res.status}`);
    await new Promise((r) => setTimeout(r, 4000 * attempt));
  }
}

/** The infobox fields as written: "|hitpoints1 = 10". */
function fields(text: string): Map<string, string> {
  const box = /\{\{Infobox Monster([\s\S]*?)\n\}\}/.exec(text)?.[1] ?? '';
  const out = new Map<string, string>();
  for (const m of box.matchAll(/^\|\s*([a-z0-9 ]+?)\s*=\s*(.*)$/gim)) out.set(m[1].toLowerCase(), m[2].trim());
  return out;
}

const num = (v: string | undefined): number | null => {
  const m = /^[+-]?\d+/.exec((v ?? '').replace(/,/g, '').trim());
  return m ? Number(m[0]) : null;
};
const plain = (v: string | undefined) => (v ?? '').replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/<[^>]*>/g, '').trim();

export interface CombatFoe {
  name: string;
  version?: string;
  combat: number;
  members: boolean;
  hitpoints: number;
  attackLevel: number;
  strengthLevel: number;
  defenceLevel: number;
  magicLevel: number;
  attackBonus: number;
  defence: { stab: number; slash: number; crush: number; magic: number };
  /** Melee type of its attack: crush, slash or stab; anything else (magic, ranged) is written as is. */
  attackStyle: string;
  maxHit: number;
  /** Ticks between its attacks. */
  speedTicks: number;
  aggressive: boolean;
}

const foes: CombatFoe[] = [];
const problems: string[] = [];
for (const page of PAGES) {
  const f = fields(await wikitext(page));
  const versions: string[] = [];
  for (let i = 1; f.has(`version${i}`); i++) versions.push(f.get(`version${i}`)!);
  const at = (key: string, i: number) => f.get(`${key}${i + 1}`) ?? f.get(key);
  for (let i = 0; i < Math.max(1, versions.length); i++) {
    const version = versions[i];
    if (version && /unused|beta/i.test(version)) continue;
    const row = {
      combat: num(at('combat', i)), hitpoints: num(at('hitpoints', i)), attackLevel: num(at('att', i)), strengthLevel: num(at('str', i)),
      defenceLevel: num(at('def', i)), magicLevel: num(at('mage', i)), attackBonus: num(at('attbns', i)),
      stab: num(at('dstab', i)), slash: num(at('dslash', i)), crush: num(at('dcrush', i)), magic: num(at('dmagic', i)),
      maxHit: num(at('max hit', i)), speedTicks: num(at('attack speed', i)),
    };
    const missing = Object.entries(row).filter(([, v]) => v === null).map(([k]) => k);
    if (missing.length) { problems.push(`${page}${version ? ` (${version})` : ''}: no ${missing.join(', ')}`); continue; }
    const members = /yes/i.test(at('members', i) ?? '');
    const foe: CombatFoe = {
      name: page, ...(version ? { version } : {}), combat: row.combat!, members, hitpoints: row.hitpoints!,
      attackLevel: row.attackLevel!, strengthLevel: row.strengthLevel!, defenceLevel: row.defenceLevel!, magicLevel: row.magicLevel!, attackBonus: row.attackBonus!,
      defence: { stab: row.stab!, slash: row.slash!, crush: row.crush!, magic: row.magic! },
      attackStyle: plain(at('attack style', i)).toLowerCase().split(/[,\s]+/)[0], maxHit: row.maxHit!, speedTicks: row.speedTicks!,
      aggressive: /yes/i.test(at('aggressive', i) ?? ''),
    };
    // Versions that differ only by where they stand ("1", "2"... of the Hill Giant) carry the same numbers: the first is kept.
    const same = (a: CombatFoe) => JSON.stringify({ ...a, version: undefined }) === JSON.stringify({ ...foe, version: undefined });
    if (!foes.some(same)) foes.push(foe);
  }
}
if (problems.length) console.warn(`Skipped:\n  ${problems.join('\n  ')}`);
writeFileSync(OUT, JSON.stringify({
  source: 'OSRS Wiki: Infobox Monster of each article, every version (scripts/build-combat-foes.ts)',
  generatedAt: new Date().toISOString().slice(0, 10),
  foes,
}, null, 2) + '\n');
console.log(`Written ${foes.length} versions to ${OUT}: ${foes.map((f) => `${f.name}${f.version ? ` ${f.version}` : ''}`).join(', ')}`);

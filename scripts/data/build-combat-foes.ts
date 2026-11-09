// Builds src/data/generated/combatFoes.json from the OSRS Wiki: what the combat estimate needs of a training opponent, for every version of the article
// (the level 12 and the level 27 Minotaur are separate): hitpoints, levels, the defence bonuses the player's hit is rolled against, and what it does
// back (attack level and bonus, style, max hit, speed, aggression). monsters.json (build-gear) keeps one version per opponent for the gear advisor;
// validate.ts checks the two agree. It needs a network. Run: npm run build-combat-foes. No numbers of our own: only the infobox.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { wikitext } from './wiki.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const OUT = `${root}src/data/generated/combatFoes.json`;

/** The opponents whose fights are estimated, read from the data that names them so new content inherits them: the route
 * steps' foes and threats, the NPCs of the combat training methods, and the trainers' spots (scripts/data/trainers.defs.json). */
const TRAINER_FOES = (JSON.parse(readFileSync(`${root}scripts/data/trainers.defs.json`, 'utf8')) as { spots: { foe: string }[] }).spots.map((s) => s.foe);
const STEPS = JSON.parse(readFileSync(`${root}src/data/authored/steps.json`, 'utf8')) as { foes?: string[]; threats?: string[] }[];
const METHODS = (JSON.parse(readFileSync(`${root}src/data/authored/trainingMethods.json`, 'utf8')) as { methods: { skill: string | string[]; npcNames?: string[] }[] }).methods;
const COMBAT = new Set(['attack', 'strength', 'defence', 'ranged', 'magic']);
const PAGES = [...new Set([...STEPS.flatMap((s) => [...(s.foes ?? []), ...(s.threats ?? [])]),
  ...METHODS.filter((m) => [m.skill].flat().some((s) => COMBAT.has(s))).flatMap((m) => m.npcNames ?? []), ...TRAINER_FOES,
  // Fights the route walks past or defers (combat audit S3-02, S3-03), so no step names them as its foes.
  'Black Knight', 'Delrith'])];


/** The infobox fields as written: "|hitpoints1 = 10". */
function fields(text: string): Map<string, string> {
  const box = /\{\{Infobox Monster([\s\S]*?)\n\}\}/.exec(text)?.[1] ?? '';
  const out = new Map<string, string>();
  // Spaces only, never a line break: an empty field ("|xpbonus = ") must not take the next line as its value.
  for (const m of box.matchAll(/^\|[ \t]*([a-z0-9 ]+?)[ \t]*=[ \t]*(.*)$/gim)) out.set(m[1].toLowerCase(), m[2].trim());
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
  /** ranged: the standard ranged defence, what arrows roll against (OSRS Wiki, Ranged: "Standard: Arrows…"); absent when the infobox has none. */
  defence: { stab: number; slash: number; crush: number; magic: number; ranged?: number };
  /** Melee type of its attack: crush, slash or stab; anything else (magic, ranged) is written as is. */
  attackStyle: string;
  maxHit: number;
  /** Ticks between its attacks. */
  speedTicks: number;
  aggressive: boolean;
  /** The infobox's experience bonus in percent (Brutus: +100, each point of damage gives twice the combat XP); absent when there is none. */
  xpBonus?: number;
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
    // Since the 2024 split the infobox gives dlight/dstandard/dheavy; older articles still have one drange.
    const ranged = num(at('dstandard', i)) ?? num(at('drange', i));
    const xpBonus = num(at('xpbonus', i));
    const foe: CombatFoe = {
      name: page, ...(version ? { version } : {}), combat: row.combat!, members, hitpoints: row.hitpoints!,
      attackLevel: row.attackLevel!, strengthLevel: row.strengthLevel!, defenceLevel: row.defenceLevel!, magicLevel: row.magicLevel!, attackBonus: row.attackBonus!,
      defence: { stab: row.stab!, slash: row.slash!, crush: row.crush!, magic: row.magic!, ...(ranged !== null ? { ranged } : {}) },
      attackStyle: plain(at('attack style', i)).toLowerCase().split(/[,\s]+/)[0], maxHit: row.maxHit!, speedTicks: row.speedTicks!,
      aggressive: /yes/i.test(at('aggressive', i) ?? ''),
      ...(xpBonus ? { xpBonus } : {}),
    };
    // Versions that differ only by where they stand ("1", "2"... of the Hill Giant) carry the same numbers: the first is kept.
    const same = (a: CombatFoe) => JSON.stringify({ ...a, version: undefined }) === JSON.stringify({ ...foe, version: undefined });
    if (!foes.some(same)) foes.push(foe);
  }
}
if (problems.length) console.warn(`Skipped:\n  ${problems.join('\n  ')}`);
writeFileSync(OUT, JSON.stringify({
  source: 'OSRS Wiki: Infobox Monster of each article, every version (scripts/data/build-combat-foes.ts)',
  generatedAt: new Date().toISOString().slice(0, 10),
  foes,
}, null, 2) + '\n');
console.log(`Written ${foes.length} versions to ${OUT}: ${foes.map((f) => `${f.name}${f.version ? ` ${f.version}` : ''}`).join(', ')}`);

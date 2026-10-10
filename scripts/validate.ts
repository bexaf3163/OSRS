// Data checks: the V2 route (steps.json, stages.json, f2p-items.json) and the skills, goals, XP, plugins and reference data.
// Used by check-data.ts and the tests. No network.

import type {
  FoeData, GoalsData, LevelSkill, MembersSkillsData, PluginsData, ReferenceData, Skill, Stage, Step, WikiItemDetail, XpData,
} from '../src/types/index.ts';
import { xpForLevel } from '../src/lib/xp.ts';
import { titleTargets } from '../src/lib/targets.ts';
import { RETIRED_STEPS } from '../src/lib/progress.ts';

export interface GuideData {
  skills: Skill[];
  /** The members skills — src/data/members-skills.json. */
  members: MembersSkillsData;
  levels: LevelSkill[];
  goals: GoalsData;
  xp: XpData;
  plugins: PluginsData;
  reference: ReferenceData;
}

export const EXPECTED = { skills: 12, members: 8, f2pQp: 46, baseQp: 1 };

export interface Route {
  steps: Step[];
  stages: Stage[];
  items: WikiItemDetail[];
  /** The opponents of the steps (monsters.json): for the combat pace — health, from which the XP per opponent comes. */
  monsters?: FoeData;
  /** Where the steps' NPCs stand (npcLocations.json) — for "Where to go" and the step map points. */
  npcs?: Record<string, { x: number; y: number; plane: number; area: string; page: string; steps?: string[] }[]>;
  /** The place dictionary (majorLocations.json): shops and places where items come from. */
  places?: Record<string, { x: number; y: number; plane: number; label: string }>;
}

export interface Report {
  lines: string[];
  errors: number;
  warnings: number;
}

/** Known typos and slips that have already appeared in the route texts. */
const TYPOS: [RegExp, string][] = [
  [/\s->\s/, '→ instead of ->'], [/ {2,}/, 'double space'], [/\s[,.;:!?](?!\d)/, 'space before punctuation'],
  [/Karamja rum/, 'Karamjan rum'],
  // Names from the game (the client cache and the OSRS Wiki): the bartender on Karamja is Zembo; the Chronicle book
  // has the actions Wield, Teleport, Check charges — there is no "Rub"; the canoe station has "Float Log / Float Canoe"
  // and "Paddle Log / Paddle Canoe", there is no bare "Float" or "Paddle" in the menu.
  [/\bZambo\b/, 'Zembo'], [/\bRub\b/, 'Chronicle has no Rub action — right-click → Teleport'],
  [/"(Float|Paddle)"/, '"Float Log" or "Float Canoe", "Paddle Log" or "Paddle Canoe"'],
];

/** All the strings of an object — for checking the reference, skills and goals texts. */
function strings(o: unknown, out: string[] = []): string[] {
  if (typeof o === 'string') out.push(o);
  else if (Array.isArray(o)) o.forEach((x) => strings(x, out));
  else if (o && typeof o === 'object') Object.values(o).forEach((x) => strings(x, out));
  return out;
}

/** The route's food and how many health points it restores (OSRS Wiki). */
const FOOD = new Map([
  ['Cooked chicken', 3], ['Shrimps', 3], ['Trout', 7], ['Salmon', 9], ['Lobster', 12], ['Swordfish', 14],
]);

/** Food without a name and quantity — a beginner does not know what to take. */
const VAGUE = /(\d+(–\d+)?\s+(pieces\s+of\s+)?food|bring food|^food\.?$|food for (the )?fight)/i;

/** An NPC name as in the game (Latin): the plugin finds and highlights the NPC by it. */
const NPC_NAME = /^[A-Z][A-Za-z' .-]{1,40}$/;

/** A world map tile: the OSRS surface and dungeons fit into these bounds. */
function badPoint(p: { x: number; y: number; plane: number }): boolean {
  const int = (n: unknown) => Number.isInteger(n);
  return !int(p.x) || !int(p.y) || !int(p.plane) || p.x < 1000 || p.x > 4200 || p.y < 2400 || p.y > 13000 || p.plane < 0 || p.plane > 3;
}

/** The step texts the user sees, with a caption saying where they are. */
function userTexts(s: Step): [string, string][] {
  const out: [string, string][] = [];
  const add = (where: string, t?: string) => { if (t) out.push([where, t]); };
  add('Where', s.where); add('How', s.how); add('Bring', s.bring); add('Reward', s.reward); add('Done when', s.doneWhen);
  add('Pro-tip', s.proTip); add('Safespot', s.safespot); add('Image caption', s.imageCaption);
  add('What changed in V2', s.v2ChangesSummary); add('With membership', s.membersAlternative);
  add('NPC: place', s.npc?.location); add('NPC: dialogue', s.npc?.dialogue); add('Warning', s.warning);
  add('Map point', s.mapLocation?.label);
  s.resourceSpots?.forEach((p, i) => { add(`Point ${i + 1}`, p.label); add(`Point ${i + 1}: note`, p.note); });
  s.quickSteps?.forEach((q, i) => add(`Step ${i + 1}`, q));
  s.fields?.forEach((f) => add(f.label, f.text));
  s.tips?.forEach((t) => add('Tip', t));
  for (const it of [...(s.itemsRequired ?? []), ...(s.itemsRecommended ?? [])]) add(`Where to get ${it.nameEn}`, it.howToGet);
  s.branches?.forEach((b) => add(`Quick variant "${b.label}"`, b.replacementText));
  return out;
}

/** The first letter of a text: emoji and quotes are skipped; if the text starts with a number ("3 balls of wool"), there is no letter. */
function firstLetter(t: string): string | undefined {
  const m = t.match(/[\p{L}\p{N}]/u)?.[0];
  return m && /\p{L}/u.test(m) ? m : undefined;
}

function balanced(t: string): boolean {
  let depth = 0;
  for (const ch of t) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth < 0) return false;
  }
  return depth === 0 && (t.match(/“/g)?.length ?? 0) === (t.match(/”/g)?.length ?? 0) && (t.match(/"/g)?.length ?? 0) % 2 === 0;
}

export function validate(d: GuideData | null, route: Route): Report {
  const lines: string[] = [];
  let errors = 0;
  let warnings = 0;
  const ok = (msg: string) => lines.push(`  ✓ ${msg}`);
  const fail = (msg: string) => { errors++; lines.push(`  ✗ ${msg}`); };
  const warn = (msg: string) => { warnings++; lines.push(`  ! ${msg}`); };
  const check = (cond: boolean, good: string, bad: string) => (cond ? ok(good) : fail(bad));

  const { steps, stages, items } = route;
  const ids = steps.map((s) => s.id);
  const idSet = new Set(ids);
  const f2p = steps.filter((s) => !s.membersOnly);
  const members = steps.filter((s) => s.membersOnly);

  // --- Steps ---
  lines.push('The V2 route');
  ok(`Steps ${steps.length}: F2P ${f2p.length} (${f2p[0]?.id}…${f2p[f2p.length - 1]?.id}), Members ${members.length}`);
  check(idSet.size === ids.length, 'Step codes are not repeated', 'There are repeated step codes');
  const badIds = steps.filter((s) => !/^S\d-\d{2}$/.test(s.id) || Number(s.id[1]) !== s.stage).map((s) => s.id);
  check(!badIds.length, 'Every step code matches its stage (S<stage>-<number>)', `The code does not match the stage: ${badIds.join(', ')}`);
  // A retired step keeps its number, so it leaves a gap: the active steps are never renumbered (saves and notes refer to them).
  const retired = new Set(RETIRED_STEPS);
  const gaps = steps.filter((s, i) => {
    const prev = steps[i - 1];
    let want = prev && prev.stage === s.stage ? Number(prev.id.slice(3)) + 1 : 1;
    while (retired.has(`S${s.stage}-${String(want).padStart(2, '0')}`)) want++;
    return Number(s.id.slice(3)) !== want;
  }).map((s) => s.id);
  check(!gaps.length, 'Within every stage the numbers run in order from 01 (a retired step leaves its number free)', `The numbers do not run in order: ${gaps.join(', ')}`);

  const stageIds = new Set(stages.map((s) => s.id));
  const noStage = steps.filter((s) => !stageIds.has(s.stage)).map((s) => s.id);
  check(!noStage.length, `Stages ${stages.length}, every step has a stage`, `Steps without a stage in stages.json: ${noStage.join(', ')}`);
  const membersStages = new Set(stages.filter((s) => s.membersOnly).map((s) => s.id));
  const mixed = steps.filter((s) => Boolean(s.membersOnly) !== membersStages.has(s.stage)).map((s) => s.id);
  check(!mixed.length, 'Members steps are only in Members stages, and vice versa', `The step mode does not match the stage: ${mixed.join(', ')}`);

  const noCore = steps.filter((s) => !['quest', 'skill', 'gear', 'prep'].includes(s.type) || !s.title || !s.doneWhen).map((s) => s.id);
  check(!noCore.length, 'Every step has a type, a title and "Done when"', `Without a type, title or "Done when": ${noCore.join(', ')}`);
  const questsNoWiki = steps.filter((s) => s.type === 'quest' && !s.wikiUrl).map((s) => s.id);
  check(!questsNoWiki.length, 'Every quest has a wiki link', `Quests without a wiki link: ${questsNoWiki.join(', ')}`);
  const noFloor = steps.filter((s) => (s.npc || s.floor !== undefined) && !(s.npc?.floor || s.floor)).map((s) => s.id);
  check(!noFloor.length, 'Every NPC and place with a floor has the floor stated', `The floor is not stated: ${noFloor.join(', ')}`);
  const badFloor = steps.flatMap((s) => [s.npc?.floor, s.floor].filter(Boolean).filter((f) => !/^(Ground|\d(st|nd|rd|th)) floor$/.test(f!)).map(() => s.id));
  check(!badFloor.length, 'The floors are written in the UK numbering ("1st floor")', `An unrecognised floor: ${badFloor.join(', ')}`);

  // --- Dependencies and points ---
  lines.push('Dependencies and quest points');
  const refs = steps.flatMap((s) => s.requires.map((r) => ({ from: s.id, to: r })));
  const broken = refs.filter((r) => !idSet.has(r.to));
  check(!broken.length, `Step references: ${refs.length}, all lead to existing codes`, `References to non-existent steps: ${broken.map((r) => `${r.from}→${r.to}`).join(', ')}`);
  const forward = refs.filter((r) => ids.indexOf(r.to) > ids.indexOf(r.from));
  check(!forward.length, 'The dependencies point only to steps higher in the list — there are no cycles', `Forward dependencies: ${forward.map((r) => `${r.from}→${r.to}`).join(', ')}`);
  const f2pToMembers = refs.filter((r) => !steps.find((s) => s.id === r.from)?.membersOnly && steps.find((s) => s.id === r.to)?.membersOnly);
  check(!f2pToMembers.length, 'F2P steps do not depend on Members steps', `F2P depends on Members: ${f2pToMembers.map((r) => `${r.from}→${r.to}`).join(', ')}`);

  const f2pQp = EXPECTED.baseQp + f2p.reduce((sum, s) => sum + (s.qp ?? 0), 0);
  check(f2pQp === EXPECTED.f2pQp, `F2P: ${f2pQp} quest points (${EXPECTED.baseQp} for Learning the Ropes + the steps)`, `F2P: ${f2pQp} quest points, expected ${EXPECTED.f2pQp}`);
  ok(`Members adds ${members.reduce((sum, s) => sum + (s.qp ?? 0), 0)} quest points`);
  const qpNotQuest = steps.filter((s) => s.qp && s.type !== 'quest').map((s) => s.id);
  if (qpNotQuest.length) fail(`Points on non-quest steps: ${qpNotQuest.join(', ')}`);
  const qpMismatch = steps.filter((s) => {
    const m = s.reward?.match(/(\d+) QP/);
    return (m ? Number(m[1]) : 0) !== (s.qp ?? 0) && !(s.qp === undefined && !m);
  }).map((s) => `${s.id} (qp ${s.qp ?? 0}, in "Reward" ${s.reward?.match(/(\d+) QP/)?.[1] ?? 0})`);
  check(!qpMismatch.length, 'The points of each quest match the "Reward" text', `They do not match the "Reward": ${qpMismatch.join('; ')}`);
  // --- Step requirements (readiness): levels and quests from the quest article ---
  const REQ_SKILLS = new Set(['attack', 'strength', 'defence', 'ranged', 'prayer', 'magic', 'runecraft', 'hitpoints', 'crafting', 'mining',
    'smithing', 'fishing', 'cooking', 'firemaking', 'woodcutting', 'agility', 'herblore', 'thieving', 'fletching', 'slayer', 'farming',
    'construction', 'hunter', 'sailing']);
  const questAt = new Map(steps.flatMap((s, i) => (s.inGame?.completionTrigger?.type === 'QUEST_COMPLETED' ? [[s.inGame.completionTrigger.questName ?? '', i] as const] : [])));
  const badReq: string[] = [];
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  steps.forEach((s, i) => {
    const text = (s.fields ?? []).filter((f) => f.label.startsWith('Requirement')).map((f) => f.text).join(' ');
    for (const r of s.requirements ?? []) {
      if (r.type === 'skill') {
        if (!REQ_SKILLS.has(r.skill) || !Number.isInteger(r.min) || r.min < 1 || r.min > 99) badReq.push(`${s.id}: ${r.skill} ${r.min}`);
        else if (!text.includes(`${cap(r.skill)} ${r.min}`)) badReq.push(`${s.id}: "${cap(r.skill)} ${r.min}" is not in the "Requirements" field`);
      } else {
        const at = questAt.get(r.quest);
        if (at === undefined) badReq.push(`${s.id}: the quest "${r.quest}" is not from the route`);
        else if (at >= i) badReq.push(`${s.id}: the quest "${r.quest}" is later on the route than the step`);
        else if (steps[at].membersOnly && !s.membersOnly) badReq.push(`${s.id}: an F2P step requires the Members quest "${r.quest}"`);
        if (!text.includes(r.quest)) badReq.push(`${s.id}: "${r.quest}" is not in the "Requirements" field`);
      }
    }
    // Conversely: everything the "Requirements" field names as a level or a route quest is recorded in requirements too.
    for (const m of text.matchAll(/\b([A-Z][a-z]+) (\d{1,2})\b/g)) {
      if (REQ_SKILLS.has(m[1].toLowerCase()) && !(s.requirements ?? []).some((r) => r.type === 'skill' && r.skill === m[1].toLowerCase() && r.min === Number(m[2]))) {
        badReq.push(`${s.id}: "${m[0]}" from the "Requirements" field is not in requirements`);
      }
    }
    for (const q of questAt.keys()) {
      if (q && text.includes(q) && !(s.requirements ?? []).some((r) => r.type === 'quest' && r.quest === q) && !text.includes(`(and so ${q}`) && !text.match(new RegExp(`and so[^)]*${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))) {
        badReq.push(`${s.id}: the quest "${q}" from the "Requirements" field is not in requirements`);
      }
    }
  });
  // The goal of an earning step matches "Done when": "20,000+ coins in the bank" ↔ moneyGoal 20000.
  for (const s of steps.filter((x) => x.moneyGoal !== undefined)) {
    const n = Number((s.doneWhen.match(/(\d{1,3}(?:,\d{3})+|\d+)\+? coins/)?.[1] ?? '').replace(/,/g, ''));
    if (!Number.isInteger(s.moneyGoal) || s.moneyGoal! <= 0 || n !== s.moneyGoal) badReq.push(`${s.id}: moneyGoal ${s.moneyGoal} does not match "Done when"`);
  }
  const withReq = steps.filter((s) => s.requirements?.length).length;
  check(!badReq.length, `Step requirements (${withReq}): the skills and levels are right, the quests are from the route and earlier than the step, they match the "Requirements" field`, `Step requirements: ${badReq.join('; ')}`);

  let running = EXPECTED.baseQp;
  const unreachable: string[] = [];
  for (const s of f2p) {
    if (s.minQp !== undefined && running < s.minQp) unreachable.push(`${s.id} waits for ${s.minQp}, and before it ${running} can be earned`);
    running += s.qp ?? 0;
  }
  check(!unreachable.length, 'The quest point thresholds are reachable by the steps above in the list', `Unreachable thresholds: ${unreachable.join('; ')}`);

  const noTargets = steps.filter((s) => s.type === 'skill' && !titleTargets(s.title).length).map((s) => s.id);
  check(!noTargets.length, 'Every skill step has level goals recognised in the title', `Goals not recognised in the title: ${noTargets.join(', ')}`);
  const review = steps.filter((s) => s.updatedInV2 && !s.v2ChangesSummary).map((s) => s.id);
  check(!review.length, `Steps marked "updated in V2": ${steps.filter((s) => s.updatedInV2).length}, all have an explanation`, `No explanation for the update: ${review.join(', ')}`);

  // --- Items ---
  lines.push('Items');
  const itemIds = new Map(items.map((i) => [i.id, i]));
  const stepItems = steps.flatMap((s) => [...(s.itemsRequired ?? []), ...(s.itemsRecommended ?? [])].map((it) => ({ s: s.id, it })));
  const noItem = stepItems.filter(({ it }) => !it.wikiItemId || !itemIds.has(it.wikiItemId) || itemIds.get(it.wikiItemId)!.iconUrl !== it.iconUrl);
  check(!noItem.length, `Items in steps: ${stepItems.length}, all have an ID and an icon from the database`, `Not in the database or the icon does not match: ${noItem.map(({ s, it }) => `${s}:${it.nameEn}`).join(', ')}`);
  check(items.length >= 120, `The item database has ${items.length} entries (120+ needed)`, `The database has only ${items.length} items, 120+ needed`);
  const itemGaps = items.filter((i) => !i.examine || !i.iconUrl || !i.wikiUrl).map((i) => i.nameEn);
  check(!itemGaps.length, 'Every database item has a description, an icon and a wiki link', `Incomplete items: ${itemGaps.join(', ')}`);
  const noHow = stepItems.filter(({ it }) => !it.howToGet.trim()).map(({ s, it }) => `${s}:${it.nameEn}`);
  check(!noHow.length, 'Every step item says where to get it', `Where to get it is not stated: ${noHow.join(', ')}`);
  const food = stepItems.filter(({ it }) => FOOD.has(it.nameEn));
  const noHeal = food.filter(({ it }) => it.heals !== FOOD.get(it.nameEn)).map(({ s, it }) => `${s}:${it.nameEn} (${it.heals ?? 'none'} instead of ${FOOD.get(it.nameEn)})`);
  check(!noHeal.length, `The food in the steps (${food.length}) states how much it heals`, `A wrong or empty "heals": ${noHeal.join(', ')}`);
  // An image caption is also the alt text for screen reading; without it the diagram is nameless.
  const noCaption = steps.filter((s) => s.imageUrl && !s.imageCaption).map((s) => s.id);
  if (noCaption.length) warn(`An image without a caption: ${noCaption.join(', ')}`);
  else ok('Every step image has a caption');

  // --- The map and the in-game highlight ---
  lines.push('The map and RuneLite');
  const located = steps.filter((s) => s.mapLocation);
  const points = steps.flatMap((s) => [
    ...(s.mapLocation ? [{ s: s.id, p: s.mapLocation }] : []),
    ...(s.resourceSpots ?? []).map((p) => ({ s: s.id, p })),
  ]);
  const badPoints = points.filter(({ p }) => badPoint(p) || !p.label?.trim() || (p.zoom !== undefined && (!Number.isInteger(p.zoom) || p.zoom < -3 || p.zoom > 3)));
  check(!badPoints.length, `Map points ${points.length} (steps with a map ${located.length}): the coordinates, floor and caption are fine`,
    `A wrong point: ${badPoints.map(({ s, p }) => `${s} ${p.x},${p.y},${p.plane}`).join('; ')}`);
  // Map points with items: an item is from the step's list (otherwise "Go here" in the RuneLite panel would hang in the air).
  const badSpotItems = steps.flatMap((s) => (s.resourceSpots ?? []).flatMap((p) => (p.items ?? [])
    .filter((n) => ![...(s.itemsRequired ?? []), ...(s.itemsRecommended ?? [])].some((i) => i.nameEn === n))
    .map((n) => `${s.id} "${p.label}": ${n}`)));
  const badSpotNpc = steps.flatMap((s) => (s.resourceSpots ?? []).filter((p) => p.npc !== undefined && !NPC_NAME.test(p.npc)).map((p) => `${s.id} "${p.label}"`));
  check(!badSpotItems.length && !badSpotNpc.length, 'The items and NPCs at map points are from the step and have English names',
    `Map points: ${[...badSpotItems, ...badSpotNpc].join('; ')}`);
  // Where items come from (from) and where the steps' NPCs are: an item has a place, an NPC has a map point, the names are as in the game.
  if (route.npcs && route.places) {
    const npcs = route.npcs;
    const places = route.places;
    const ids = new Set(steps.map((s) => s.id));
    const npcAt = (name: string, stepId: string) => npcs[name]?.find((r) => r.steps?.includes(stepId)) ?? npcs[name]?.find((r) => !r.steps);
    const badFrom = steps.flatMap((s) => [...(s.itemsRequired ?? []), ...(s.itemsRecommended ?? [])]
      .filter((i) => i.from !== undefined && !npcAt(i.from, s.id) && !places[i.from]).map((i) => `${s.id} ${i.nameEn} ← ${i.from}`));
    const badNpc = Object.entries(npcs).flatMap(([name, rows]) => {
      const general = rows.filter((r) => !r.steps).length;
      return [
      ...(!NPC_NAME.test(name) ? [`the name "${name}"`] : []),
      ...(general !== 1 ? [`${name}: general entries ${general} (one is needed)`] : []),
      ...rows.flatMap((r) => [
        ...(badPoint(r) ? [`${name}: the tile ${r.x},${r.y},${r.plane}`] : []),
        ...(!r.area?.trim() || !r.page?.trim() ? [`${name}: no place or article`] : []),
        ...(r.steps ?? []).filter((id) => !ids.has(id)).map((id) => `${name}: there is no step ${id}`),
      ]),
      ];
    });
    check(!badFrom.length && !badNpc.length, 'Where items come from and where the steps\' NPCs are — the places exist on the map',
      `Places: ${[...badFrom, ...badNpc].join('; ')}`);
    const used = new Set(steps.flatMap((s) => [...(s.inGame?.npcNames ?? []), ...(s.itemsRequired ?? []).map((i) => i.from ?? '')]));
    const unused = Object.keys(npcs).filter((n) => !used.has(n));
    if (unused.length) warn(`NPCs from npcLocations.json are not needed by any step: ${unused.join(', ')}`);
  }
  // The wiki "Map" link and the preview point are the same place: a discrepancy means only one of them was fixed.
  const drift = steps.filter((s) => {
    const m = s.mapUrl?.match(/#\/m=(\d+),(\d+),(\d+)/);
    return m && s.mapLocation && (Number(m[1]) !== s.mapLocation.x || Number(m[2]) !== s.mapLocation.y || Number(m[3]) !== s.mapLocation.plane);
  }).map((s) => s.id);
  check(!drift.length, 'The preview point matches the wiki map link', `The point and the map link differ: ${drift.join(', ')}`);
  // The switch is the step point and the map places together: one place and one step point on another tile — that is already two.
  const lonelySpots = steps.filter((s) => {
    if (!s.resourceSpots) return false;
    const start = s.mapLocation;
    const apart = start && !s.resourceSpots.some((p) => p.x === start.x && p.y === start.y && p.plane === start.plane);
    return s.resourceSpots.length + (apart ? 1 : 0) < 2;
  }).map((s) => s.id);
  check(!lonelySpots.length, 'The point switch is only where there are two or more', `One point on the step map: ${lonelySpots.join(', ')}`);

  const TRIGGERS = new Set(['QUEST_COMPLETED', 'SKILL_LEVEL', 'ITEM_OWNED', 'CHAT_MESSAGE', 'VARBIT_CHANGED']);
  // The quest name in RuneLite: like the step (a dash in the name is a hyphen) or like the step's wiki article
  // ("Triumph at Oziach" — the last stage of Dragon Slayer I). Whether it exists in RuneLite is checked by RouteTargetsTest.
  const questNamesOf = (s: Step) => [s.title.replace(/ — /g, ' - '),
    ...(s.wikiUrl ? [decodeURIComponent(s.wikiUrl.replace(/^.*\/w\//, '')).replace(/_/g, ' ')] : [])];
  const triggerQuests = new Map<string, string>();
  const badGame: string[] = [];
  for (const s of steps) {
    const g = s.inGame;
    if (!g) continue;
    if (g.worldPoint && badPoint(g.worldPoint)) badGame.push(`${s.id}: worldPoint`);
    for (const t of g.groundTiles ?? []) if (badPoint(t) || !t.label.trim()) badGame.push(`${s.id}: the tile ${t.x},${t.y}`);
    for (const key of ['npcNames', 'objectNames', 'dialogChoices', 'highlightItems'] as const) {
      if (g[key]?.some((n) => !n.trim())) badGame.push(`${s.id}: an empty name in ${key}`);
    }
    const t = g.completionTrigger;
    if (!t) continue;
    if (!TRIGGERS.has(t.type)) badGame.push(`${s.id}: an unknown trigger ${t.type}`);
    // A quest is counted by the name from the game; the name of a quest step is exactly this name.
    if (t.type === 'QUEST_COMPLETED') {
      if (s.type !== 'quest' || !questNamesOf(s).includes(t.questName ?? '')) badGame.push(`${s.id}: questName "${t.questName}" does not match the step's quest`);
      const twin = triggerQuests.get(t.questName ?? '');
      if (twin) badGame.push(`${s.id}: the quest "${t.questName}" is already marked by ${twin} — both steps would close at once`);
      triggerQuests.set(t.questName ?? '', s.id);
    }
    // The levels are exactly the goals from the step title: otherwise the step would close earlier or later than written.
    if (t.type === 'SKILL_LEVEL') {
      const want = titleTargets(s.title).map((x) => `${x.skill} ${x.level}`).sort().join(', ');
      const got = (t.levels ?? []).map((x) => `${x.skill} ${x.level}`).sort().join(', ');
      if (!t.levels?.length || want !== got) badGame.push(`${s.id}: the auto-mark levels "${got}" ≠ the goals from the title "${want}"`);
    } else if (t.levels) badGame.push(`${s.id}: levels exist only for SKILL_LEVEL`);
    if (t.type === 'ITEM_OWNED' && !t.items?.length) badGame.push(`${s.id}: ITEM_OWNED without items`);
    if (t.items && !['QUEST_COMPLETED', 'SKILL_LEVEL', 'ITEM_OWNED'].includes(t.type)) badGame.push(`${s.id}: items exist only for state conditions`);
    for (const i of t.items ?? []) {
      if (!i.names?.length || i.names.some((n) => !n.trim())) badGame.push(`${s.id}: an auto-mark item without a name`);
      if (!Number.isInteger(i.count) || i.count < 1) badGame.push(`${s.id}: the quantity ${i.names?.join('/')} — ${i.count}`);
      if (i.id !== undefined && (!Number.isInteger(i.id) || i.id <= 0)) badGame.push(`${s.id}: ID ${i.id}`);
    }
    if (t.type === 'CHAT_MESSAGE') {
      try { new RegExp(t.chatPattern ?? ''); } catch { badGame.push(`${s.id}: chatPattern is not a regular expression`); }
      if (!t.chatPattern) badGame.push(`${s.id}: no chatPattern`);
    }
    if (t.type === 'VARBIT_CHANGED' && (!Number.isInteger(t.varbitId) || !Number.isInteger(t.targetValue))) badGame.push(`${s.id}: varbitId and targetValue are required`);
  }
  const withGame = steps.filter((s) => s.inGame);
  const auto = withGame.filter((s) => s.inGame!.completionTrigger);
  check(!badGame.length, `The in-game highlight at ${withGame.length} steps, the auto-mark at ${auto.length}: the fields are fine`, `Highlight errors: ${badGame.join('; ')}`);

  // The waypoints: in order, with a caption (the HUD shows it: "Point 2/5: the bridge").
  const badRoute = steps.flatMap((s) => (s.inGame?.pathWaypoints ?? [])
    .filter((p) => badPoint(p) || !p.label?.trim())
    .map((p) => `${s.id} ${p.x},${p.y}`));
  const routed = steps.filter((s) => s.inGame?.pathWaypoints?.length);
  const shortRoute = routed.filter((s) => s.inGame!.pathWaypoints!.length < 2).map((s) => s.id);
  check(!badRoute.length && !shortRoute.length, `Waypoints at ${routed.length} steps: the coordinates and captions are fine`,
    `Waypoints: ${[...badRoute, ...shortRoute.map((id) => `${id}: one point is just a worldPoint`)].join('; ')}`);

  // Quick variants: a known skill and a level 1–99, a quest from the route, an item with a name, a map point.
  const SKILLS = new Set(['attack', 'strength', 'defence', 'ranged', 'prayer', 'magic', 'runecraft', 'hitpoints', 'crafting', 'mining',
    'smithing', 'fishing', 'cooking', 'firemaking', 'woodcutting', 'agility', 'herblore', 'thieving', 'fletching', 'slayer', 'farming',
    'construction', 'hunter', 'sailing']);
  const questTitles = new Set(steps.filter((s) => s.type === 'quest').map((s) => s.title));
  const badBranch: string[] = [];
  for (const s of steps) {
    const ids = new Set<string>();
    for (const b of s.branches ?? []) {
      const c = b.condition;
      if (!b.id || ids.has(b.id)) badBranch.push(`${s.id}: a repeated or empty variant id`);
      ids.add(b.id);
      if (!b.label?.trim()) badBranch.push(`${s.id}/${b.id}: no label`);
      if (c.type === 'SKILL_LEVEL' && (!SKILLS.has(c.skill ?? '') || !Number.isInteger(c.minLevel) || c.minLevel! < 1 || c.minLevel! > 99)) badBranch.push(`${s.id}/${b.id}: the skill or level`);
      if (c.type === 'QUEST_COMPLETED' && !questTitles.has(c.questName ?? '')) badBranch.push(`${s.id}/${b.id}: the quest "${c.questName}" is not from the route`);
      if (c.type === 'ITEM_OWNED' && !c.itemName?.trim()) badBranch.push(`${s.id}/${b.id}: no itemName`);
      if (!['SKILL_LEVEL', 'QUEST_COMPLETED', 'ITEM_OWNED'].includes(c.type)) badBranch.push(`${s.id}/${b.id}: an unknown condition ${c.type}`);
      if (b.replacementTarget && (badPoint(b.replacementTarget) || !b.replacementTarget.label?.trim())) badBranch.push(`${s.id}/${b.id}: the point`);
      if (b.timeSavingSeconds !== undefined && !(b.timeSavingSeconds > 0)) badBranch.push(`${s.id}/${b.id}: timeSavingSeconds`);
    }
  }
  const branched = steps.filter((s) => s.branches?.length);
  check(!badBranch.length, `Quick variants at ${branched.length} steps: the conditions and points are fine`, `Quick variants: ${badBranch.join('; ')}`);

  // The departure check: for a step where everything is obtained along the way there is nothing to check at the bank — that is fine, but
  // inStep is only on required items (the recommended ones are not checked at the bank anyway).
  const recInStep = steps.flatMap((s) => (s.itemsRecommended ?? []).filter((i) => i.inStep).map((i) => `${s.id} ${i.nameEn}`));
  check(!recInStep.length, `Items "along the step" are marked at ${steps.filter((s) => s.itemsRequired?.some((i) => i.inStep)).length} steps`,
    `inStep on recommended items: ${recInStep.join(', ')}`);

  // The training pace: the skill and level are those in the step title; the XP to a level is by the game formula.
  const COMBAT = new Set(['attack', 'strength', 'defence']);
  const PACING_SKILLS = new Set(['fishing', 'woodcutting', 'cooking', 'mining', ...COMBAT]);
  const foeHp = new Map((route.monsters?.foes ?? []).map((f) => [f.name, f.hitpoints]));
  const badPacing = steps.flatMap((s) => {
    const p = s.pacing;
    if (!p) return [];
    const out: string[] = [];
    if (!PACING_SKILLS.has(p.skill)) out.push(`${s.id}: the skill ${p.skill}`);
    if (p.targetExp !== xpForLevel(p.targetLevel)) out.push(`${s.id}: XP ${p.targetExp} ≠ ${xpForLevel(p.targetLevel)} for ${p.targetLevel}`);
    if (!(p.expPerAction > 0)) out.push(`${s.id}: XP per action ${p.expPerAction}`);
    const forms = p.actionName.split('|');
    if (!(forms.length === 1 || forms.length === 2) || forms.some((f) => !f.trim())) out.push(`${s.id}: the action forms "${p.actionName}"`);
    for (const skill of [p.skill, ...(p.also ?? [])]) {
      if (!titleTargets(s.title).some((t) => t.skill === skill && t.level === p.targetLevel)) out.push(`${s.id}: the goal ${skill} ${p.targetLevel} is not in the title`);
    }
    // Several skills — only combat: they are trained in turn, changing the attack style.
    if (p.also && (!COMBAT.has(p.skill) || p.also.some((a) => !COMBAT.has(a) || a === p.skill) || new Set(p.also).size !== p.also.length)) {
      out.push(`${s.id}: also ${p.also.join(', ')}`);
    }
    // Combat: the action is an opponent, the XP of the style skill is 4 per point of damage, that is 4 × its health.
    if (COMBAT.has(p.skill)) {
      const hp = foeHp.get(s.foes?.[0] ?? '');
      if (hp === undefined) out.push(`${s.id}: a combat pace without an opponent from monsters.json`);
      else if (p.expPerAction !== 4 * hp) out.push(`${s.id}: the XP per opponent ${p.expPerAction} ≠ 4 × ${hp}`);
    }
    if (p.secondsPerAction !== undefined && !(p.secondsPerAction > 0)) out.push(`${s.id}: seconds per action ${p.secondsPerAction}`);
    return out;
  });
  const paced = steps.filter((s) => s.pacing).length;
  check(!badPacing.length, `The training pace at ${paced} steps: the skill, level and XP agree with the title and the formula`, `The training pace: ${badPacing.join('; ')}`);

  // Wiki markup in the item database: HTML entities and "[UK]/[US]" are a sign of the old text cleaning.
  const entities = items.flatMap((i) => [...(i.buyLocations ?? []).map((b) => b.location), ...(i.freeSpawns ?? [])]
    .filter((t) => /&(#\d+|[a-z]+);|\[(UK|US)\]/i.test(t)).map((t) => `${i.nameEn}: ${t}`));
  check(!entities.length, 'There are no HTML entities or [UK]/[US] marks in the shop and spawn places', `Uncleaned wiki text: ${entities.slice(0, 5).join('; ')}`);

  // --- Text ---
  lines.push('Text');
  const vague = steps.flatMap((s) => userTexts(s).filter(([, t]) => VAGUE.test(t)).map(([where]) => `${s.id} "${where}"`));
  check(!vague.length, 'The food is named and counted everywhere', `Food without a name or quantity: ${vague.join(', ')}`);
  const lower: string[] = [];
  const typos: string[] = [];
  const unbalanced: string[] = [];
  for (const s of steps) {
    for (const [where, t] of [['Title', s.title] as [string, string], ...userTexts(s)]) {
      const ch = firstLetter(t);
      if (ch && ch !== ch.toUpperCase() && !/^[a-z]/.test(t)) lower.push(`${s.id} "${where}"`);
      for (const [re, hint] of TYPOS) if (re.test(t)) typos.push(`${s.id} "${where}": ${hint}`);
      if (!balanced(t)) unbalanced.push(`${s.id} "${where}"`);
    }
  }
  for (const st of stages) {
    const ch = firstLetter(st.title);
    if (ch && ch !== ch.toUpperCase()) lower.push(`stage ${st.id}`);
  }
  check(!lower.length, 'All step and stage texts start with a capital letter', `Starts with a lowercase letter: ${lower.join(', ')}`);
  check(!typos.length, 'There are no known typos or ASCII arrows', `Typos: ${typos.join('; ')}`);
  check(!unbalanced.length, 'Brackets and quotes are closed', `Unclosed brackets or quotes: ${unbalanced.join(', ')}`);

  if (d) {
    // The typos and the same spelling rules — in the skills, goals and reference texts too: reference, skills, goals, plugins.
    const guideTypos = strings(d).flatMap((t) => TYPOS.filter(([re, hint]) => re.test(t) && !/double space|space before/.test(hint)).map(([, hint]) => `"${t.slice(0, 40)}…": ${hint}`));
    check(!guideTypos.length, 'There are no known typos in the skills, goals and reference texts', `Typos in the skills, goals and reference texts: ${guideTypos.join('; ')}`);

    // --- Skills, goals and XP ---
    lines.push('Skills, goals and XP');
    check(d.skills.length === EXPECTED.skills, `Skills ${d.skills.length}: ${d.skills.map((s) => `${s.id}(${s.plan.ranges.length})`).join(' ')}`, `Expected ${EXPECTED.skills} skills, found ${d.skills.length}`);
    let planErrors = 0;
    for (const s of d.skills) {
      const bad = s.plan.ranges.filter((r, i) => r.code !== `${s.id}-${i + 1}` || (r.to !== null && r.to <= r.from));
      if (bad.length) { planErrors++; fail(`${s.id}: wrong plan rows ${bad.map((r) => r.code).join(', ')}`); }
    }
    if (!planErrors) ok('Every skill has a training plan with codes in order');

    // Members skills: a plan row must be found for any level 1–99, otherwise "Now by the plan" disappears.
    const ms = d.members.skills;
    check(ms.length === EXPECTED.members, `Members skills ${ms.length}: ${ms.map((s) => `${s.id}(${s.plan.ranges.length})`).join(' ')}`,
      `Expected ${EXPECTED.members} members skills, found ${ms.length}`);
    const holes = ms.filter((s) => {
      const r = s.plan.ranges;
      return r[0].from !== 1 || r[r.length - 1].to !== null
        || r.some((x, i) => x.code !== `${s.id}-${i + 1}` || (i > 0 && r[i - 1].to !== x.from) || (x.to !== null && x.to <= x.from));
    }).map((s) => s.id);
    check(!holes.length, 'The members skill plans run from level 1 without gaps, the codes in order',
      `A members skill plan not from level 1, with a gap or not in order: ${holes.join(', ')}`);
    const f2pLevels = new Set(d.levels.map((l) => l.id));
    const badMembers = ms.filter((s) => s.membersOnly !== true || s.levelSkills.length !== 1 || f2pLevels.has(s.levelSkills[0])
      || d.skills.some((f) => f.id === s.id) || s.wiki !== `https://oldschool.runescape.wiki/w/${s.nameEn}`).map((s) => s.id);
    check(!badMembers.length, 'Members skills have their own level, their own code and a wiki link',
      `A members skill without its own level, with a foreign code or without a wiki link: ${badMembers.join(', ')}`);
    const goalRows = d.goals.rows.filter((r) => r.id !== 'qp');
    check(goalRows.length === d.levels.length, `"Goals by stage": ${goalRows.length} skills × ${d.goals.stages.length} stages`, '"Goals by stage" is incomplete');
    const xpBad = d.xp.points.filter((p) => xpForLevel(p.level) !== p.xp).map((p) => `${p.level}: ${p.xp} ≠ ${xpForLevel(p.level)}`);
    check(!xpBad.length, `The XP formula matches all ${d.xp.points.length} rows of the XP table`, `The formula differs from the XP table: ${xpBad.join('; ')}`);
  }

  lines.push('');
  lines.push(`Total: errors ${errors}, warnings ${warnings}`);
  return { lines, errors, warnings };
}

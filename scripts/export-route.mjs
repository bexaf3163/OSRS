// Exports the whole route as one readable Markdown file: every step with everything the program shows for it (requirements, items, quick options,
// walkthrough, in-game targets, the quest stage tables line by line) and the target levels. It reads the data files only: no build, no network.
//
//   node scripts/export-route.mjs [output.md]        (default: docs/route-export.md)
//
// The step list is assembled the way src/data/index.ts does it: steps.json, with the stage table of questStages.json attached and, for a quest
// with a "route", the walkthrough taken from it. Part 1 is the route of a free-to-play account, Part 2 the members-only steps.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const pkg = read('package.json');
const stepsJson = read('src/data/steps.json');
const stages = read('src/data/stages.json');
const goals = read('src/data/goals.json');
const stageTables = read('src/data/questStages.json').quests;

const steps = stepsJson.map((s) => {
  const q = stageTables[s.id];
  if (!q) return s;
  const walk = (q.route ?? []).flatMap((p) => p.steps);
  return { ...s, questStages: q, ...(walk.length ? { quickSteps: walk } : {}) };
});

const out = [];
const w = (line = '') => out.push(line);
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const tile = (t) => (Array.isArray(t) ? `${t[0]}, ${t[1]}, plane ${t[2]}` : `${t.x}, ${t.y}, plane ${t.plane}`);
const list = (a) => (a ?? []).map(clean).filter(Boolean).join(', ');

/** Keys printed explicitly; any other key of a step is dumped at the end as JSON, so nothing the data holds is lost. */
const HANDLED = new Set([
  'id', 'stage', 'type', 'title', 'qp', 'minQp', 'requires', 'softRequires', 'requirements', 'optional', 'wikiUrl', 'quickGuideUrl', 'mapUrl', 'npc', 'floor',
  'itemsRequired', 'itemsRecommended', 'loadouts', 'carryover', 'tasks', 'rewardChoice', 'bondBranch', 'quickSteps', 'safespot', 'imageUrl', 'imageCaption', 'proTip',
  'mapLocation', 'resourceSpots', 'mapPreviewImage', 'warning', 'inGame', 'branches', 'pacing', 'foes', 'where', 'bring', 'how', 'tips', 'reward', 'doneWhen',
  'moneyGoal', 'threats', 'styleGear', 'useOn', 'magicPlan', 'questStages', 'fields', 'targets', 'updatedInV2', 'v2ChangesSummary', 'membersOnly',
  'membersAlternative',
]);

function itemLine(i) {
  const bits = [`${i.nameEn}${i.amount !== undefined && i.amount !== '' ? ` x${i.amount}` : ''}`];
  const head = bits[0];
  const notes = [];
  if (i.anyOf?.length) notes.push(`any of: ${list(i.anyOf)}`);
  if (i.from) notes.push(`from: ${i.from}`);
  if (i.heals) notes.push(`heals ${i.heals}`);
  if (i.inStep) notes.push('obtained during the step');
  if (i.phase) notes.push(`loadout: ${i.phase}`);
  if (i.wikiItemId) notes.push(`item id ${i.wikiItemId}`);
  return `  - ${head}${i.howToGet ? ` - ${clean(i.howToGet)}` : ''}${notes.length ? ` [${notes.join('; ')}]` : ''}`;
}

function lineOf(l, n) {
  const meta = [];
  if (l.at) meta.push(`at ${tile(l.at)}`);
  if (l.has) meta.push(`done when the bag has: ${l.has}`);
  if (l.need) meta.push(`done when handed in: ${l.need}`);
  if (l.hl) {
    const h = [];
    if (l.hl.npc?.length) h.push(`NPC ids ${l.hl.npc.join('/')}`);
    if (l.hl.obj?.length) h.push(`object ids ${l.hl.obj.join('/')}`);
    if (l.hl.on?.length) h.push(`objects ${l.hl.on.join('/')}`);
    if (l.hl.item?.length) h.push(`items ${l.hl.item.join('/')}`);
    meta.push(`highlighted: ${h.join('; ')}`);
  }
  for (const p of l.pre ?? []) {
    const where = p.at ? `get it at ${tile(p.at)}${p.t ? ` (${clean(p.t)})` : ''}${p.on?.length ? `, objects ${p.on.join('/')}` : ''}${p.npc ? `, NPC ${p.npc}` : ''}` : 'bank or Grand Exchange';
    meta.push(`must have: ${p.item}${p.n > 1 ? ` x${p.n}` : ''}${p.alt?.length ? ` (or ${list(p.alt)})` : ''} - ${where}`);
  }
  if (l.mh) meta.push(`strongest hit: ${l.mh}`);
  if (l.k) meta.push(`key ${l.k}`);
  const lines = [`      ${n}. ${clean(l.t)}`];
  if (l.s && clean(l.s) !== clean(l.t)) lines.push(`         In the game list: ${clean(l.s)}`);
  for (const m of meta) lines.push(`         - ${m}`);
  return lines.join('\n');
}

function stageTable(q) {
  w(`- Quest stage table (game variable: ${q.var[0]} ${q.var[1]}). The game shows the row with the largest value not above the variable.`);
  const rows = [...q.stages].sort((a, b) => a.at - b.at);
  let prev = null;
  for (const r of rows) {
    const key = JSON.stringify([r.do, r.go ?? null, r.items ?? null]);
    w(`  - Value ${r.at} and above:`);
    if (prev && prev.key === key) {
      w(`      The same lines as value ${prev.at}.`);
      continue;
    }
    prev = { key, at: r.at };
    if (r.go) w(`      Go to: ${typeof r.go === 'string' ? r.go : `${clean(r.go.label)} (${tile(r.go)})${r.go.npc ? `, NPC ${r.go.npc}` : ''}`}`);
    if (r.items) {
      w(`      Items for this stage:${r.items.length ? '' : ' none'}`);
      for (const i of r.items) w(`        - ${i.name}${i.count ? ` x${i.count}` : ''}${i.where ? ` - ${clean(i.where)}` : ''}${i.inStep ? ' [obtained during the stage]' : ''}${i.alt?.length ? ` [or ${list(i.alt)}]` : ''}`);
    }
    r.do.forEach((l, i) => w(lineOf(l, i + 1)));
  }
}

function step(s) {
  w(`### ${s.id} - ${clean(s.title)}`);
  w();
  const stage = stages.find((x) => x.id === s.stage);
  const flags = [`stage ${s.stage}${stage ? ` (${clean(stage.title)})` : ''}`, `type ${s.type}`];
  if (s.membersOnly) flags.push('members only');
  if (s.optional) flags.push('optional');
  if (s.bondBranch) flags.push('the way to a Bond (skipped on a members account)');
  if (s.qp) flags.push(`${s.qp} quest point${s.qp > 1 ? 's' : ''}`);
  if (s.minQp) flags.push(`needs ${s.minQp} quest points`);
  w(`- ${flags.join('; ')}`);
  if (s.requires?.length) w(`- Comes after: ${s.requires.join(', ')}`);
  if (s.softRequires?.length) w(`- Better after (not required): ${s.softRequires.join(', ')}`);
  if (s.membersAlternative) w(`- Members alternative: ${clean(s.membersAlternative)}`);
  if (s.requirements?.length) {
    w('- Requirements:');
    for (const r of s.requirements) {
      w(r.type === 'quest' ? `  - Quest: ${r.quest}` : `  - ${r.skill} ${r.min}${r.when === 'during' ? ' (needed during the quest; you can start without it)' : ''}${r.boostable ? ' (can be boosted)' : ''}`);
    }
  }
  if (s.where) w(`- Where: ${clean(s.where)}`);
  if (s.floor) w(`- Floor: ${clean(s.floor)}`);
  if (s.mapLocation) w(`- Map: ${clean(s.mapLocation.label)} (${tile(s.mapLocation)})${s.mapLocation.note ? ` - ${clean(s.mapLocation.note)}` : ''}`);
  if (s.resourceSpots?.length) {
    w('- Other places on the map:');
    for (const p of s.resourceSpots) w(`  - ${clean(p.label)} (${tile(p)})${p.npc ? ` [NPC ${p.npc}]` : ''}${p.items?.length ? ` [items: ${list(p.items)}]` : ''}${p.note ? ` - ${clean(p.note)}` : ''}`);
  }
  if (s.npc) w(`- NPC: ${s.npc.nameEn} - ${clean(s.npc.location)}${s.npc.floor ? `, ${clean(s.npc.floor)}` : ''}${s.npc.dialogue ? `. Dialogue: ${clean(s.npc.dialogue)}` : ''}`);
  if (s.bring) w(`- Bring: ${clean(s.bring)}`);
  if (s.how) w(`- How: ${clean(s.how)}`);
  if (s.warning) w(`- Warning: ${clean(s.warning)}`);
  if (s.proTip) w(`- Pro tip: ${clean(s.proTip)}`);
  for (const t of s.tips ?? []) w(`- Tip: ${clean(t)}`);
  for (const f of s.fields ?? []) w(`- ${clean(f.label)}: ${clean(f.text)}`);
  if (s.safespot) w(`- Safespot: ${clean(s.safespot)}`);
  if (s.reward) w(`- Reward: ${clean(s.reward)}`);
  if (s.rewardChoice) w(`- The reward is a choice: the program shows the option that fits your levels (${s.rewardChoice}).`);
  if (s.moneyGoal) w(`- Money goal: ${s.moneyGoal.toLocaleString('en-US')} coins in the bag and the bank by the end of the step`);
  w(`- Done when: ${clean(s.doneWhen)}`);
  if (s.targets?.length) w(`- Skill goals: ${s.targets.map((t) => `${t.skill} ${t.level}`).join(', ')}`);
  if (s.pacing) {
    const p = s.pacing;
    w(`- Pace: ${p.skill}${p.also?.length ? ` (also ${list(p.also)})` : ''} to level ${p.targetLevel} (${p.targetExp.toLocaleString('en-US')} XP): ${p.actionName}, ${p.expPerAction} XP each${p.secondsPerAction ? `, about ${p.secondsPerAction} s each` : ''}`);
  }
  if (s.foes?.length) w(`- Fights in melee: ${list(s.foes)}`);
  if (s.threats?.length) w(`- Other opponents (food advice): ${list(s.threats)}`);
  if (s.styleGear) w(`- Shows the ${s.styleGear} gear advice for your levels and coins`);
  if (s.magicPlan) w(`- Shows the cost of reaching Magic ${s.magicPlan.target} with combat spells (from ${s.magicPlan.from})`);
  for (const u of s.useOn ?? []) w(`- Use ${u.item} on ${u.target}${u.kind ? ` (${u.kind})` : ''}`);
  if (s.imageCaption) w(`- Picture: ${clean(s.imageCaption)}`);

  if (s.itemsRequired?.length) { w('- Items required:'); s.itemsRequired.forEach((i) => w(itemLine(i))); }
  if (s.itemsRecommended?.length) { w('- Items recommended:'); s.itemsRecommended.forEach((i) => w(itemLine(i))); }
  if (s.loadouts?.length) {
    w('- Inventories by phase:');
    for (const l of s.loadouts) {
      w(`  - ${clean(l.title)}${l.from !== undefined ? ` (from quest value ${l.from})` : ''}${l.freeSlots !== undefined ? `, keep ${l.freeSlots} slots free` : ''}${l.note ? ` - ${clean(l.note)}` : ''}`);
      for (const t of l.take) w(`      take ${t.nameEn} x${t.amount}${t.note ? ` - ${clean(t.note)}` : ''}`);
      if (l.leave?.length) w(`      leave behind: ${list(l.leave)}`);
    }
  }
  for (const c of s.carryover ?? []) w(`- Keep for ${c.forStep}: ${c.item} x${c.count} (${c.where}) - ${clean(c.why)}`);
  for (const t of s.tasks ?? []) {
    const c = t.check;
    const how = !c ? 'you tick it' : c.kind === 'worn' ? `checked from the worn items: ${list(c.items)}`
      : c.kind === 'owned' ? `checked from the bag and bank: ${c.count ?? 1} x ${list(c.items)}`
        : c.kind === 'level' ? `checked from the level: ${c.skill} ${c.level}` : `checked from the quest list: ${c.name}`;
    w(`- Also tracked (does not block the step): ${clean(t.text)}${t.qp ? ` +${t.qp} QP.` : ''} [${how}]`);
  }

  if (s.branches?.length) {
    w('- Quick options (offered when you qualify):');
    for (const b of s.branches) {
      const c = b.condition;
      const cond = c.type === 'SKILL_LEVEL' ? `${c.skill} ${c.minLevel}` : c.type === 'QUEST_COMPLETED' ? `quest ${c.questName}` : `item ${c.itemName}`;
      w(`  - ${clean(b.label)} [${b.id}] - needs ${cond}${b.timeSavingSeconds ? `; saves about ${b.timeSavingSeconds} s` : ''}`);
      for (const n of b.needs ?? []) w(`      also: ${clean(n.label)} - ${n.count} of ${list(n.items)}${n.unless?.length ? ` (not needed with ${list(n.unless)})` : ''}`);
      if (b.replacementTarget) w(`      goes to: ${clean(b.replacementTarget.label)} (${tile(b.replacementTarget)})`);
      if (b.replacementText) w(`      instead: ${clean(b.replacementText)}`);
    }
  }

  const g = s.inGame;
  if (g) {
    w('- In the game (RuneLite plugin):');
    if (g.goal) w(`  - Goal line: ${clean(g.goal)}`);
    if (g.worldPoint) w(`  - Arrow to: ${clean(g.worldPoint.label ?? '')} (${tile(g.worldPoint)})`);
    for (const [i, p] of (g.pathWaypoints ?? []).entries()) w(`  - Stop ${i + 1}: ${clean(p.label ?? '')} (${tile(p)})`);
    for (const t of g.groundTiles ?? []) w(`  - Marked tile: ${clean(t.label)} (${tile(t)})`);
    if (g.npcNames?.length) w(`  - NPCs highlighted: ${list(g.npcNames)}`);
    if (g.npcIds?.length) w(`  - NPC ids: ${g.npcIds.join(', ')}`);
    if (g.objectNames?.length) w(`  - Objects highlighted: ${list(g.objectNames)}`);
    if (g.objectIds?.length) w(`  - Object ids: ${g.objectIds.join(', ')}`);
    if (g.highlightItems?.length) w(`  - Items highlighted in the bag: ${list(g.highlightItems)}`);
    if (g.dialogChoices?.length) w(`  - Dialogue choices to pick: ${g.dialogChoices.map((d) => `“${clean(d)}”`).join(' → ')}`);
    const t = g.completionTrigger;
    if (t) {
      // The app keeps the carried-over items on top of a quest or level trigger (lib/carryover.ts routeTrigger): the export says so too.
      const extra = [...(t.items ?? [])];
      if ((t.type === 'QUEST_COMPLETED' || t.type === 'SKILL_LEVEL') && !t.anyOf) {
        const have = new Set(extra.flatMap((i) => i.names.map((n) => n.toLowerCase())));
        for (const c of s.carryover ?? []) if (!have.has(c.item.toLowerCase())) extra.push({ names: [c.item], count: c.count });
      }
      const also = extra.length && (t.type === 'QUEST_COMPLETED' || t.type === 'SKILL_LEVEL') ? ` and holding ${extra.map((i) => `${i.count} x ${list(i.names)}`).join('; ')}` : '';
      const what = t.type === 'QUEST_COMPLETED' ? `quest completed: ${t.questName}${also}`
        : t.type === 'SKILL_LEVEL' ? `levels reached: ${(t.levels ?? []).map((l) => `${l.skill} ${l.level}`).join(', ')}${also}`
          : t.type === 'ITEM_OWNED' ? `${t.anyOf ? 'any of' : 'all of'}: ${(t.items ?? []).map((i) => `${i.count} x ${list(i.names)}`).join('; ')}`
            : t.type === 'CHAT_MESSAGE' ? `game message matching: ${t.chatPattern}`
              : `variable ${t.varbitId} ${t.atLeast ? 'at least ' : '= '}${t.targetValue}`;
      w(`  - Marked done automatically when: ${what}`);
    } else {
      w('  - No automatic completion: you mark this step yourself.');
    }
  }

  if (s.quickSteps?.length) {
    w('- Walkthrough:');
    s.quickSteps.forEach((l, i) => w(`  ${i + 1}. ${clean(l)}`));
  }
  if (s.questStages?.route?.length) {
    w('- Quest outline (sections, as in the Quest Helper panel):');
    for (const p of s.questStages.route) {
      w(`  - ${clean(p.title)}`);
      p.steps.forEach((l, i) => w(`      ${i + 1}. ${clean(l)}`));
    }
  }
  if (s.questStages?.stages?.length) stageTable(s.questStages);

  const rest = Object.keys(s).filter((k) => !HANDLED.has(k));
  for (const k of rest) w(`- ${k}: ${JSON.stringify(s[k])}`);
  w();
}

// ---------- The document ----------
const f2p = steps.filter((s) => s.membersOnly !== true);
const members = steps.filter((s) => s.membersOnly === true);
const today = new Date().toISOString().slice(0, 10);

w(`# OSRS Path - full route export (app version ${pkg.version})`);
w();
w(`Exported ${today} from the program's data files (steps.json, questStages.json, stages.json, goals.json). Every step is written out with everything the program shows for it: where to go, what to bring and where each item comes from, the quick options, the walkthrough, what the game plugin highlights and when it ticks the step off by itself, and, for quests, the stage table line by line (what the game shows for each value of the quest variable).`);
w();
w(`- Part 1 is the free-to-play route in order (${f2p.length} steps, stages ${[...new Set(f2p.map((s) => s.stage))].join(', ')}). Stage 6 is the optional way to a Bond: a members account skips it.`);
w(`- Part 2 is the members route (${members.length} steps, stages ${[...new Set(members.map((s) => s.stage))].join(', ')}), done after Dragon Slayer I.`);
w('- Part 3 is the target levels at the end of each stage.');
w();
w('## Stages');
w();
for (const st of stages) {
  const ids = steps.filter((s) => s.stage === st.id).map((s) => s.id);
  w(`- Stage ${st.id}${st.membersOnly ? ' (members)' : ''}: ${clean(st.title)} - ${ids.join(', ')}`);
}
w();

const part = (title, list_) => {
  w(`## ${title}`);
  w();
  let at = null;
  for (const s of list_) {
    if (s.stage !== at) {
      at = s.stage;
      const st = stages.find((x) => x.id === at);
      w(`## Stage ${at}${st ? ` - ${clean(st.title)}` : ''}`);
      w();
    }
    step(s);
  }
};
part(`Part 1 - F2P route (${f2p.length} steps)`, f2p);
part(`Part 2 - Members route (${members.length} steps)`, members);

w('## Part 3 - Target levels at the end of each stage');
w();
w(clean(goals.intro));
w();
w(`| Skill | ${goals.stages.join(' | ')} |`);
w(`|---|${goals.stages.map(() => '---').join('|')}|`);
for (const r of goals.rows) w(`| ${r.label} | ${r.values.map((v) => v.raw).join(' | ')} |`);
if (goals.note) { w(); w(clean(goals.note)); }
w();

const target = path.resolve(root, process.argv[2] ?? 'docs/route-export.md');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${out.join('\n')}\n`);
console.log(`wrote ${path.relative(root, target)}: ${f2p.length} F2P steps, ${members.length} members steps, ${out.length} lines, ${(fs.statSync(target).size / 1024).toFixed(0)} KB`);

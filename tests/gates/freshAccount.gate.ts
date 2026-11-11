// Route gate: a fresh F2P account played turn by turn through the one planner. Each turn the decided action is applied as the game
// would answer it (earn coins, buy, equip, withdraw, gather, train to the target, do the quest step and take its rewards), and the next
// decision is made from the new state. It fails when the planner stops at a check (VERIFY or MANUAL_WAIT) or does not finish the 23 F2P
// quests. Run: npm run gate:f2p (about ten minutes; not part of npm test).
// Fixed inputs keep it repeatable: the GE prices of tests/fixtures/gePrices.json, earning at a cowhide rate, straight-line walking. The
// game is simplified: training reaches its target at once (melee adds its Hitpoints XP), purchases land in the bag, rewards come with
// the last step, and an item a later step takes "from step X" is in the bag after X. Remaining-time UNKNOWN turns are reported, not failed.
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { allSteps, itemById } from '../../src/data';
import { FOODS } from '../../src/data/threats';
import { buildPlayerState } from '../../src/domain/player/playerState';
import { toolFamilyOf } from '../../src/domain/items/toolTiers';
import { emptyProgress } from '../../src/domain/persistence/progress';
import { questCatalogue } from '../../src/domain/planning/catalogue';
import type { CommittedDecision, PlanningSnapshot } from '../../src/domain/planning/contracts';
import { runtimeDecision, type RuntimePlanInput } from '../../src/domain/planning/runtime';
import { earnAction } from '../../src/domain/planning/earn';
import { gearData, gearPieceByName } from '../../src/domain/combat/gearAdvisor';
import { nameKey } from '../../src/domain/items/itemKey';
import { levelForXp, xpForLevel } from '../../src/domain/player/xp';
import { isReusable } from '../../src/domain/items/reusable';
import { carryOverFrom } from '../../src/domain/prep/shopping';
import { fakePrices } from '../funding/helpers';
import type { Step } from '../../src/types';

const f2pSteps = allSteps.filter(s => !s.membersOnly);
const stepOf = new Map(allSteps.map(s => [s.id, s]));
const fixture = JSON.parse(readFileSync('tests/fixtures/gePrices.json', 'utf8')) as { prices: Record<string, { buy: number; sell: number }> };
const prices = fakePrices(fixture.prices);
// Everything the route, the gear table and the foods name: the bank read covers them (an untracked item would stay unknown).
const named = f2pSteps.flatMap(s => [...(s.itemsRequired ?? []), ...(s.itemsRecommended ?? [])].flatMap(i => [i.nameEn, ...(i.anyOf ?? [])]));
const f2pItems = (JSON.parse(readFileSync('src/data/generated/f2p-items.json', 'utf8')) as { nameEn: string }[]).map(i => i.nameEn);
const NAMES = [...new Set([...named, ...named.flatMap(n => toolFamilyOf(n) ?? []), ...gearData.items.map(p => p.name), ...f2pItems, ...FOODS.map(f => f.name)])];
const rate = { methodId: 'cowhides', title: 'Collect cowhides', netPerHour: { fast: 25_000, typical: 18_000, slow: 12_000 } };
const walk: RuntimePlanInput['walk'] = (from, to) => {
  if (!from) return null;
  const tiles = Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y));
  return { fast: tiles / 150, typical: tiles / 100, slow: tiles / 50, source: 'gate: straight-line walking' };
};
const SKILLS = ['attack', 'strength', 'defence', 'hitpoints', 'ranged', 'prayer', 'magic', 'cooking', 'woodcutting', 'fletching', 'fishing',
  'firemaking', 'crafting', 'smithing', 'mining', 'runecraft'];
const MELEE = new Set(['attack', 'strength', 'defence']);
const MAX_TURNS = 300;

it('a fresh account finishes the 23 F2P quests through planned actions, without a check', () => {
  const xp: Record<string, number> = Object.fromEntries(SKILLS.map(s => [s, s === 'hitpoints' ? xpForLevel(10) : 0]));
  const bag = new Map<string, number>(), bank = new Map<string, number>(), worn: string[] = [];
  const add = (name: string, n: number) => bag.set(name, Math.max(0, (bag.get(name) ?? 0) + n));
  let coins = 0, position = { x: 3222, y: 3218, plane: 0 }, previous: CommittedDecision | undefined, unknownTime = 0, turn = 0;
  const quests: Record<string, { state: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED'; stepId?: string }> =
    Object.fromEntries(questCatalogue.filter(q => !q.members).map(q => [q.id, { state: 'NOT_STARTED' }]));
  const log: string[] = [];
  for (; turn < MAX_TURNS; turn++) {
    const stats = Object.fromEntries(SKILLS.map(s => [s, Math.max(1, levelForXp(xp[s]))]));
    const done = Object.entries(quests).filter(([, q]) => q.state === 'COMPLETED').map(([id]) => id);
    const owned = { bankSeen: true, items: new Map(NAMES.map(n => [n.toLowerCase(), { name: n, carried: bag.get(n) ?? 0, bank: bank.get(n) ?? 0, noted: 0 }])) };
    const equipment = worn.map(n => { const p = gearPieceByName(n); return { id: p?.id ?? 1, name: n, slot: p ? (p.slot === 'neck' ? 'amulet' : p.slot) : 'weapon', count: 1 }; });
    const gear = { equipment, inventory: [...bag].filter(([, c]) => c > 0).map(([name, count]) => ({ id: 1, name, count })), coins, bankCoins: 0 };
    const player = buildPlayerState({ mode: 'f2p', connected: true, player: 'Gate', stats, progress: emptyProgress(), questsDone: done, owned, gear, position });
    const qp = questCatalogue.filter(q => done.includes(q.id)).reduce((s, q) => s + (q.rewards.questPoints ?? 0), 0);
    const snapshot = { scope: { characterId: 'Gate', mode: 'f2p', gameSessionId: 'gate', snapshotRevision: turn + 1 }, player, combat: { stats, gear },
      bankRead: { kind: 'current' }, xp: Object.fromEntries(SKILLS.map(s => [s, { known: true, value: xp[s], source: 'game' }])),
      manual: { 'Shield of Arrav:partner': true }, questPoints: { known: true, value: qp, source: 'game' },
      quests: Object.fromEntries(Object.entries(quests).map(([id, q]) => [id, { ...q, source: 'game' }])) } as unknown as PlanningSnapshot;
    const earn: RuntimePlanInput['earn'] = (step, gp, _budget, goalId) => earnAction(snapshot, step, goalId, gp, rate);
    const d = runtimeDecision({ snapshot, intent: { kind: 'auto' }, previous, progress: emptyProgress(), prices, steps: f2pSteps,
      detail: id => itemById.get(id), ironman: false, earn, walk });
    if (!d) break;
    previous = d;
    const a = d.activeAction;
    if (!d.estimatedRemaining) unknownTime++;
    log.push(`${turn}: ${d.objectiveId} | ${a.kind} | ${a.title} | cb ${stats.attack}/${stats.strength}/${stats.defence}/${stats.hitpoints} | ${coins} gp`);
    expect(['VERIFY', 'MANUAL_WAIT'], `turn ${turn}: ${a.title}\n${log.slice(-8).join('\n')}`).not.toContain(a.kind);
    const execution: Step | undefined = a.executionStep ?? (a.stepId ? stepOf.get(a.stepId) : undefined);
    const countOf = (name: string) => {
      const item = (execution?.itemsRequired ?? []).find(i => nameKey(i.nameEn) === nameKey(name) || i.anyOf?.some(x => nameKey(x) === nameKey(name)));
      const n = Number(String(item?.amount ?? 1).replace('+', ''));
      return Number.isFinite(n) && n > 0 ? n : 1;
    };
    const subject = /^(.+?) (acquired|usable in inventory|worn|observed worn)/.exec(a.completionEvidence[0]?.predicate ?? '')?.[1] ?? null;
    const nameFrom = (key: string) => NAMES.find(n => nameKey(n) === key || n.toLowerCase() === key) ?? key;
    if (a.destination) position = a.destination;
    switch (a.kind) {
      case 'QUEST': {
        const q = questCatalogue.find(x => x.id === a.goalId)!;
        const at = q.stepIds.indexOf(a.stepId!);
        const step = stepOf.get(a.stepId!);
        if (step?.mapLocation) position = { x: step.mapLocation.x, y: step.mapLocation.y, plane: step.mapLocation.plane };
        for (const i of execution?.itemsRequired ?? []) if (!isReusable(i.nameEn) && !gearPieceByName(i.nameEn)) add(i.nameEn, -countOf(i.nameEn));
        if (at === q.stepIds.length - 1) {
          quests[q.id] = { state: 'COMPLETED' };
          for (const [s, amount] of Object.entries(q.rewards.xp)) xp[s] = (xp[s] ?? 0) + amount;
          coins += q.rewards.coins ?? 0;
          for (const r of q.resourceFlow?.receives ?? []) add(r.name, r.count);
        } else {
          quests[q.id] = { state: 'IN_PROGRESS', stepId: q.stepIds[at + 1] };
          for (const later of q.stepIds.slice(at + 1).map(id => stepOf.get(id))) {
            for (const item of later?.itemsRequired ?? []) if (carryOverFrom(item) === a.stepId) add(item.nameEn, Number(item.amount) || 1);
          }
        }
        if (at === 0) for (const r of (q.resourceFlow?.receives ?? []).filter(r => r.when === 'start')) add(r.name, r.count);
        break;
      }
      case 'BUY': {
        const name = a.title.replace(/^Get /, ''), unit = prices.buy(name)?.price;
        add(name, unit && a.gpCost ? Math.max(1, Math.round(a.gpCost.amount / unit)) : countOf(name));
        coins -= a.gpCost?.amount ?? 0;
        break;
      }
      case 'WITHDRAW': { const name = subject ?? nameFrom(a.id.split(':').slice(2).join(':')); add(name, bank.get(name) ?? 0); bank.set(name, 0); break; }
      case 'EQUIP': {
        const name = a.title.replace(/^Equip /, '').replace(/ before the fight$/, ''), slot = gearPieceByName(name)?.slot;
        add(name, -1);
        for (let i = worn.length - 1; i >= 0; i--) if (slot && gearPieceByName(worn[i])?.slot === slot) { add(worn[i], 1); worn.splice(i, 1); }
        worn.push(name);
        break;
      }
      case 'GATHER': { const name = subject ?? nameFrom(a.id.split(':').slice(2).join(':')); add(name, countOf(name)); break; }
      case 'EARN': { const m = /Earn ([\d,]+) gp/.exec(a.title); coins += m ? Number(m[1].replace(/,/g, '')) : 0; break; }
      case 'TRAIN': {
        const m = /TRAIN:([a-z]+):(\d+)/.exec(a.id) ?? /Train ([a-z]+) to (\d+)/.exec(a.title);
        if (m) {
          const gain = Math.max(0, xpForLevel(Number(m[2])) - xp[m[1]]);
          xp[m[1]] += gain;
          if (MELEE.has(m[1])) xp.hitpoints += Math.floor(gain * 1.33 / 4);
        }
        const e = /then earn ([\d,]+) gp/.exec(a.title);
        if (e) coins += Number(e[1].replace(/,/g, ''));
        break;
      }
    }
  }
  console.log(`Route gate: ${turn} turns, ${Object.values(quests).filter(q => q.state === 'COMPLETED').length} of 23 quests, remaining time unknown on ${unknownTime} turns.`);
  expect(Object.entries(quests).filter(([, q]) => q.state !== 'COMPLETED').map(([id]) => id), log.slice(-8).join('\n')).toEqual([]);
}, 1_800_000);

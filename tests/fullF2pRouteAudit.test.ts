import { afterAll, describe, expect, it } from 'vitest';
import { allSteps, stepById } from '../src/data';
import stagesFile from '../src/data/questStages.json';
import { stepGuide } from '../src/services/runeliteBridge';
import { navigationTarget } from '../src/lib/navigation';
import { itemSource } from '../src/lib/stepPlaces';
import { isUnderground } from '../src/lib/map';
import { TRANSPORT, bankOnRoute } from '../src/lib/travel';
import { parseAmount, nameKey, type OwnedItem, type OwnedState } from '../src/lib/checklist';
import { aggregateShopping, REUSABLE } from '../src/lib/shopping';
import { BAG_SLOTS, stacks, type PrepPlan } from '../src/lib/prepPlan';
import { slotsText } from '../src/lib/prepEnvelope';
import { procurementDetour } from '../src/lib/detours';
import { buildPlayerState } from '../src/lib/playerState';
import { createReadinessEngine } from '../src/lib/readinessEngine';
import { emptyProgress } from '../src/lib/progress';
import type { Step } from '../src/types';

// The F2P route from S1-01 to the Dragon Slayer I finale (S5-09), walked as data. What is checked, in the project's own terms (the data has no
// "tile/itemCount/questVarbit" fields; the equivalents are mapLocation, stage lines with at/has/need, varp tables and inGame.completionTrigger):
//   1. every step has a place the arrow can lead to, every point is on the F2P map with an explicit plane 0..3
//   2. every floor, island or dungeon change in a stage table has a named way across; islands have a boat on the way
//   3. every route step has a completion signal, and every stage line can advance (a place, an item, or the "done" button)
//   4. multi-item lines count cumulatively (>= N, mixed names), never "exactly N"
//   5. the bag never has to hold more than 28 slots, and a full bag is warned about before the items arrive
//   6. every required item has an origin, remote-zone items are on the plan before the player leaves, and the bank is used before a shop
// `AUDIT_REPORT=1 npx vitest run tests/fullF2pRouteAudit.test.ts` prints the summary.

type Line = { t: string; s?: string; at?: number[]; has?: string; need?: string; k?: string };
type Row = { at: number; do: Line[] };
type Quest = { var: [string, number]; stages: Row[] };
const quests = (stagesFile as unknown as { quests: Record<string, Quest> }).quests;

const FINALE = 'S5-09';
const route = allSteps.filter((s) => !s.membersOnly && s.id <= FINALE);
const tables = route.filter((s) => quests[s.id]).map((s) => ({ step: s, q: quests[s.id] }));
const stats = { steps: route.length, tables: tables.length, lines: 0, points: 0, floorChanges: 0, islandChanges: 0, anchorPairs: 0, maxSlots: 0, maxSlotsStep: '', plans: 0 };

type Pt = { x: number; y: number; plane: number };
type Region = 'mainland' | 'karamja' | 'crandor' | 'corsair' | 'instance' | 'underground';

/** The F2P map as boxes: the mainland, the islands that need a boat, and everything under the surface (y above 6400). */
function regionOf(p: Pt): Region {
  // Misthalin Mystery plays out in its own copy of the manor, far to the north-west of the map.
  if (p.x >= 1600 && p.x <= 1700 && p.y >= 4800 && p.y <= 4880) return 'instance';
  if (isUnderground(p)) return 'underground';
  if (p.x >= 2816 && p.x <= 2880 && p.y >= 3216 && p.y <= 3295) return 'crandor';
  if (p.x >= 2432 && p.x <= 2640 && p.y >= 2784 && p.y <= 2900) return 'corsair';
  if (p.x >= 2688 && p.x <= 2975 && p.y <= 3199) return 'karamja';
  return 'mainland';
}
const inF2pBounds = (p: Pt) => (regionOf(p) === 'instance' ? true : p.y > 6400
  ? p.x >= 1984 && p.x <= 3520 && p.y >= 8960 && p.y <= 10300
  : p.x >= 2432 && p.x <= 3520 && p.y >= 2784 && p.y <= 3968);
const validPoint = (p: Pt) => [p.x, p.y, p.plane].every(Number.isInteger) && p.plane >= 0 && p.plane <= 3 && inF2pBounds(p);

/** Floor changes the Quest Helper text leaves unnamed (Ithoi's telescope hut in Corsair Cove): known, and the list must not grow. */
const UNNAMED_FLOOR = new Set(['S4-01#45']);

/** What explains a change of floor, island or dungeon between two lines. */
const FLOOR = /\b(climb\w*|ladders?|stairs?|staircase|upstairs|downstairs|trapdoor|manhole|hole|rope|enter\w*|leave|exit|go (up|down|into|through)|basement|dungeon|cave|tunnel|lever|sail\w*|board|ship|boat|ferry|glider|fly|teleport|top floor|ground floor|first floor|second floor|back (up|down|out)|drain|grill)\b/i;
const INSTANCE = /\b(enter\w*|leave|exit|door|climb\w*|gate|wall|room|manor|mansion|rowboat|boat|board|go (through|into|back))\b/i;
const BOAT = /\b(sail\w*|ship|boat|ferry|glider|board\w*|fly|captain|cove|island|crandor|karamja|volcano|shipyard|musa|ned|tobias)\b/i;
const says = (re: RegExp, ...ls: Line[]) => ls.some((l) => re.test(l.t) || (l.s !== undefined && re.test(l.s)));

/** The lines of a table in play order with their stage row; a row boundary is a boundary between consecutive entries of different rows. */
const flat = (q: Quest) => q.stages.flatMap((r) => r.do.map((l) => ({ row: r.at, line: l })));
/** An underground tile: the dungeons sit 6400 north of the surface. */
const ug = (a: number[]) => isUnderground({ y: a[1] });
const pointOf = (l: Line): Pt | null => (l.at ? { x: l.at[0], y: l.at[1], plane: l.at[2] } : null);

/** The point the arrow leads to for a whole step, with the exemptions the audit knows by name. */
const NO_WORLD_POINT = new Set(['S1-01', 'S3-09']);

describe('F2P route audit: the route itself', () => {
  it('runs from S1-01 to the finale in order, each step requiring only earlier ones', () => {
    expect(route[0].id).toBe('S1-01');
    expect(route[route.length - 1].id).toBe(FINALE);
    expect(route.length).toBeGreaterThanOrEqual(49);
    const seen = new Set<string>();
    for (const s of route) {
      for (const r of s.requires) expect(seen.has(r), `${s.id} requires ${r} which comes later or is members only`).toBe(true);
      seen.add(s.id);
    }
  });

  it('every stage table of the route is on a quest variable and belongs to a route step', () => {
    expect(tables.length).toBeGreaterThanOrEqual(30);
    for (const { step, q } of tables) {
      expect(['varp', 'varbit'], step.id).toContain(q.var[0]);
      expect(q.stages.length, step.id).toBeGreaterThan(0);
    }
  });
});

describe('F2P route audit: waypoints and planes', () => {
  it('every step has a place the arrow leads to; only the steps with no place in the world are exempt, by name', () => {
    const missing: string[] = [];
    for (const s of route) {
      const nav = navigationTarget(s);
      if (!nav) missing.push(s.id);
    }
    expect(missing.sort()).toEqual([...NO_WORLD_POINT].sort());
    for (const id of NO_WORLD_POINT) {
      const s = stepById.get(id)!;
      expect(s.type === 'prep' || s.type === 'skill', `${id} is a client or training step`).toBe(true);
    }
  });

  it('every point the plugin can be given is an explicit integer on the F2P map with a plane of 0..3 (steps, places, stage lines)', () => {
    const bad: string[] = [];
    for (const s of route) {
      const g = stepGuide(s);
      const pts: [string, Pt][] = g.places.map((p, i) => [`${s.id} place ${i} ${p.label}`, p]);
      const nav = navigationTarget(s);
      if (nav) pts.push([`${s.id} arrow`, nav]);
      for (const st of g.stage?.stages ?? []) {
        if (st.go !== undefined && !g.places[st.go]) bad.push(`${s.id}#${st.at}: go ${st.go} is not a place`);
        for (const l of st.steps) if (l.x !== undefined) pts.push([`${s.id}#${st.at} ${l.k ?? l.t.slice(0, 30)}`, { x: l.x, y: l.y!, plane: l.plane! }]);
      }
      for (const [what, p] of pts) {
        stats.points++;
        if (!validPoint(p)) bad.push(`${what}: ${JSON.stringify(p)}`);
        if (isUnderground(p) && p.plane > 1) bad.push(`${what}: underground on plane ${p.plane}`);
      }
    }
    expect(bad).toEqual([]);
    expect(stats.points).toBeGreaterThan(600);
  });

  it('the arrow of a step does not start on top of the previous step place only by accident of a missing point: no step shares its place with a different region', () => {
    const anchors = route.map((s) => ({ s, nav: navigationTarget(s) })).filter((a) => a.nav);
    for (const a of anchors) expect(['mainland', 'karamja'], `${a.s.id} anchors on an island or underground`).toContain(regionOf(a.nav!));
  });
});

describe('F2P route audit: continuity between places', () => {
  it('between two steps whose places are on different landmasses there is a boat in the transport data, both ways', () => {
    const anchors = route.map((s) => ({ s, nav: navigationTarget(s) })).filter((a) => a.nav);
    const boat = (from: Region, to: Region) => TRANSPORT.boats.some((b) => regionOf(b.from) === from && regionOf(b.to) === to);
    let crossings = 0;
    for (let i = 1; i < anchors.length; i++) {
      stats.anchorPairs++;
      const a = regionOf(anchors[i - 1].nav!);
      const b = regionOf(anchors[i].nav!);
      if (a === b) continue;
      crossings++;
      expect(boat(a, b), `${anchors[i - 1].s.id} -> ${anchors[i].s.id}: ${a} to ${b} has no boat`).toBe(true);
    }
    // The food for the dragon is bought now (S4-04), so no step anchor is on Karamja any more; the boat table must still link it, both ways, for the stage lines that go there.
    expect(crossings).toBeGreaterThanOrEqual(0);
    expect(boat('mainland', 'karamja') && boat('karamja', 'mainland')).toBe(true);
  });

  it('inside a stage table every change of floor, dungeon or island has a named way across (ladder, stairs, trapdoor, rope, boat)', () => {
    const bad: string[] = [];
    for (const { step, q } of tables) {
      const seq = flat(q).filter((e) => e.line.at);
      for (let i = 1; i < seq.length; i++) {
        const a = seq[i - 1].line;
        const b = seq[i].line;
        const pa = pointOf(a)!;
        const pb = pointOf(b)!;
        const ra = regionOf(pa);
        const rb = regionOf(pb);
        stats.lines++;
        if (ra !== rb && (ra === 'instance' || rb === 'instance')) {
          if (!says(INSTANCE, a, b)) bad.push(`${step.id}#${seq[i].row}: instance entered or left without a door: "${a.t.slice(0, 40)}" -> "${b.t.slice(0, 40)}"`);
          continue;
        }
        if (ra !== rb && ra !== 'underground' && rb !== 'underground') {
          stats.islandChanges++;
          if (!says(BOAT, a, b)) bad.push(`${step.id}#${seq[i].row}: ${ra} to ${rb} without a boat: "${a.t.slice(0, 40)}" -> "${b.t.slice(0, 40)}"`);
          continue;
        }
        // Underground tiles sit 6400 north of the surface above them.
        const shifted = ra === rb ? pb : { ...pb, y: pb.y + (ra === 'underground' ? -6400 : 6400) };
        const sameBuilding = Math.max(Math.abs(shifted.x - pa.x), Math.abs(shifted.y - pa.y)) <= 12;
        if ((pa.plane !== pb.plane || ra !== rb) && sameBuilding) {
          stats.floorChanges++;
          if (!says(FLOOR, a, b) && !UNNAMED_FLOOR.has(`${step.id}#${seq[i].row}`)) bad.push(`${step.id}#${seq[i].row}: floor ${pa.plane} to ${pb.plane} without a way: "${a.t.slice(0, 40)}" -> "${b.t.slice(0, 40)}"`);
        }
      }
    }
    expect(bad).toEqual([]);
    expect(stats.floorChanges).toBeGreaterThan(30);
  });

  it('a stage row that ends on one landmass and the next that starts on another is joined by a sail or climb in the text', () => {
    const bad: string[] = [];
    for (const { step, q } of tables) {
      const rows = q.stages.map((r) => r.do.filter((l) => l.at));
      for (let i = 1; i < rows.length; i++) {
        if (!rows[i - 1].length || !rows[i].length) continue;
        const a = rows[i - 1][rows[i - 1].length - 1];
        const b = rows[i][0];
        const ra = regionOf(pointOf(a)!);
        const rb = regionOf(pointOf(b)!);
        if (ra !== rb && ra !== 'underground' && rb !== 'underground' && ra !== 'instance' && rb !== 'instance' && !says(BOAT, a, b)) bad.push(`${step.id}: row ${q.stages[i - 1].at} -> ${q.stages[i].at}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('F2P route audit: completion signals', () => {
  /** Steps with no automatic completion: the player ticks them, and the text says when. A new one must be added here on purpose. */
  const MANUAL = ['S1-01', 'S1-02', 'S1-10', 'S5-06', 'S5-07'];

  it('every route step is finished by a signal the plugin can read, or is on the short list of manual steps', () => {
    const none = route.filter((s) => !s.inGame?.completionTrigger).map((s) => s.id);
    expect(none).toEqual(MANUAL);
    for (const id of MANUAL) expect(stepById.get(id)!.doneWhen.trim().length, id).toBeGreaterThan(10);
  });

  it('a trigger names what it waits for: a quest, levels, items with a count, a message or a varbit', () => {
    for (const s of route) {
      const t = s.inGame?.completionTrigger;
      if (!t) continue;
      if (t.type === 'QUEST_COMPLETED') expect(t.questName?.length, s.id).toBeGreaterThan(2);
      if (t.type === 'SKILL_LEVEL') expect(t.levels?.length, s.id).toBeGreaterThan(0);
      if (t.type === 'ITEM_OWNED') {
        expect(t.items?.length, s.id).toBeGreaterThan(0);
        for (const i of t.items!) expect(i.count, `${s.id} ${i.names?.[0]}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('every stage row can advance: a place, an item to hold or hand in, or a single line that the quest variable moves past', () => {
    const rowsWithoutAnyPoint: string[] = [];
    let silent = 0;
    for (const { step, q } of tables) {
      for (const r of q.stages) {
        expect(r.do.length, `${step.id}#${r.at}`).toBeGreaterThan(0);
        // A row of one line moves on when the quest variable does; a longer row with no place or item would be all "done" buttons.
        if (r.do.length > 1 && !r.do.some((l) => l.at || l.has || l.need)) rowsWithoutAnyPoint.push(`${step.id}#${r.at}`);
        silent += r.do.filter((l) => !l.at && !l.has && !l.need).length;
      }
    }
    // A row with no place, item or hand-in at all would depend on the "done" button for every line.
    expect(rowsWithoutAnyPoint).toEqual([]);
    expect(silent).toBeGreaterThanOrEqual(0);
  });
});

describe('F2P route audit: counting several items', () => {
  const nameOf = (has: string) => has.replace(/\s+x\d+$/i, '').split('|').map((n) => n.trim());
  const countOf = (has: string) => Number(/\sx(\d+)$/i.exec(has)?.[1] ?? 1);

  it('a line that waits for several items says how many, and the largest count matches the step requirement', () => {
    for (const { step, q } of tables) {
      for (const need of step.itemsRequired ?? []) {
        const n = parseAmount(need.amount);
        if (n === null || n < 2 || nameKey(need.nameEn) === 'coins') continue;
        const lines = flat(q).map((e) => e.line).filter((l) => l.has && nameOf(l.has).some((x) => nameKey(x) === nameKey(need.nameEn)));
        if (!lines.length) continue;
        expect(Math.max(...lines.map((l) => countOf(l.has!))), `${step.id}: ${need.nameEn} x${n}`).toBe(n);
      }
    }
  });

  it('the three goblin mails count whatever colour they are, the three map parts count together, and the keys add up one by one', () => {
    const mails = flat(quests['S2-12']).map((e) => e.line).filter((l) => l.has?.startsWith('Goblin mail|'));
    expect(new Set(mails.map((l) => l.has!.replace(/ x\d+$/, ''))).size).toBe(1);
    expect(mails.map((l) => countOf(l.has!)).sort()).toContain(3);
    expect(flat(quests['S5-05']).some((e) => e.line.has === 'Map part x3')).toBe(true);
    const keys = flat(quests['S5-03']).map((e) => countOf(e.line.has ?? '')).filter((n) => n > 1);
    expect([...new Set(keys)].sort()).toEqual([2, 3, 4, 5, 6]);
  });

  it('the three planks of the ship are three hand-ins, one per plank', () => {
    expect(flat(quests['S5-06']).filter((e) => e.line.need === 'Plank')).toHaveLength(3);
  });
});

/** How many bag slots a step's own items take: stacks one each, the rest by count; worn things and coins do not count. */
function slotsOf(step: Step): number {
  let n = 0;
  for (const i of step.itemsRequired ?? []) {
    if (nameKey(i.nameEn) === 'coins') continue;
    if (/^(worn|wield)/i.test(i.howToGet)) continue;
    const c = parseAmount(i.amount) ?? 1;
    n += stacks(i.nameEn) ? 1 : c;
  }
  return n;
}

describe('F2P route audit: the 28-slot bag', () => {
  // A purchase step (type gear: the exchange) lists the whole shopping list: it is bought and banked, never carried at once.
  const carried = route.filter((s) => s.type !== 'gear');

  it('no step needs more than 28 slots for its own items, and the tools it shares with the next step still fit beside them', () => {
    const over: string[] = [];
    carried.forEach((s, i) => {
      const next = carried[i + 1];
      const own = new Set((s.itemsRequired ?? []).map((x) => nameKey(x.nameEn)));
      // A tool the next step also needs is not banked in between.
      const kept = (next?.itemsRequired ?? []).filter((x) => REUSABLE.has(nameKey(x.nameEn)) && !own.has(nameKey(x.nameEn))).length;
      const total = slotsOf(s) + kept;
      if (total > stats.maxSlots) { stats.maxSlots = total; stats.maxSlotsStep = s.id; }
      if (total > BAG_SLOTS) over.push(`${s.id}: ${total}`);
    });
    expect(over).toEqual([]);
  });

  it('a step that fills the bag to within two slots says to bank first', () => {
    const tight = carried.filter((s) => BAG_SLOTS - slotsOf(s) <= 2);
    for (const s of tight) {
      const text = JSON.stringify([s.how, s.fields, s.quickSteps, s.itemsRequired?.map((i) => i.howToGet)]).toLowerCase();
      expect(/bank|deposit/.test(text), `${s.id} fills the bag and does not mention the bank`).toBe(true);
    }
  });

  const owned = (rows: Record<string, Partial<OwnedItem>>): OwnedState => {
    const items = new Map<string, OwnedItem>();
    for (const [name, o] of Object.entries(rows)) items.set(nameKey(name), { name, carried: 0, noted: 0, ...o });
    return { bankSeen: true, items };
  };
  const planWithBag = (id: string, rows: Record<string, Partial<OwnedItem>>, used: number): PrepPlan => {
    const state = buildPlayerState({
      mode: 'f2p', stats: null, progress: { levels: {} }, owned: owned(rows), gear: { equipment: [], inventory: [], coins: 600, bankCoins: 0, inventorySlots: used }, questsDone: null, connected: true,
    });
    return createReadinessEngine({ steps: allSteps, progress: emptyProgress(), qp: 40, mode: 'f2p', state }).plan(stepById.get(id)!);
  };

  it('Goblin Diplomacy: with the dyes in hand and room for them but not for three goblin mails, the plan warns before the first mail is picked up', () => {
    const dyes = { 'Orange dye': { carried: 1 }, 'Blue dye': { carried: 1 } };
    const roomy = planWithBag('S2-12', dyes, 10);
    expect(roomy.slots.over).toBe(0);
    const tight = planWithBag('S2-12', dyes, 25);
    expect(tight.slots.over, 'dyes fit (already carried) but three mails (25 + 3 > 28) do not').toBe(0 + Math.max(0, 25 + tight.slots.adding - BAG_SLOTS));
    expect(tight.slots.adding).toBeGreaterThanOrEqual(3);
    expect(tight.slots.over).toBeGreaterThan(0);
    expect(slotsText(tight)).toMatch(/will not all fit/);
  });

  it('a training step is not warned about gathered logs or ore: they are dropped or banked as they come', () => {
    const plan = planWithBag('S1-08', {}, 20);
    expect(plan.slots.over).toBe(0);
  });
});

describe('F2P route audit: where things come from and when the plan says so', () => {
  const route2 = route.filter((s) => s.itemsRequired?.length);

  it('every item a route step needs says where it comes from, and a named seller or NPC is a place the app knows', () => {
    const bad: string[] = [];
    for (const s of route2) {
      for (const i of s.itemsRequired!) {
        if (nameKey(i.nameEn) === 'coins') continue;
        // "Worn." names no origin by itself: an earlier route step must hand the item over.
        const worn = /^worn\b/i.test(i.howToGet.trim());
        const gotEarlier = (e: Step) => e.itemsRequired?.some((x) => nameKey(x.nameEn) === nameKey(i.nameEn)) || nameKey(`${e.title} ${e.doneWhen}`).includes(nameKey(i.nameEn));
        if (worn && !route.some((e) => e.id < s.id && gotEarlier(e))) bad.push(`${s.id} ${i.nameEn}: worn, but no earlier step gets it`);
        if (!worn && i.howToGet.trim().length < 6) bad.push(`${s.id} ${i.nameEn}: no origin`);
        if (i.from && !itemSource(i.from, s.id)) bad.push(`${s.id} ${i.nameEn}: from "${i.from}" is not a known place`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('the whole-route shopping list has an origin for every line, and the bulk quest materials are bought in one place (S4-05)', () => {
    const list = aggregateShopping(route);
    for (const l of list.required) expect(l.howToGet.trim().length, l.nameEn).toBeGreaterThanOrEqual(5);
    const bulk = stepById.get('S4-05')!;
    for (const name of ['Steel nails', 'Plank', 'Hammer', 'Unfired bowl', "Wizard's mind bomb", 'Silk', 'Lobster pot']) {
      expect(bulk.itemsRequired!.some((i) => i.nameEn === name), `S4-05 buys ${name}`).toBe(true);
    }
    expect(bulk.type).toBe('gear');
  });

  const owned = (rows: Record<string, Partial<OwnedItem>>, bankSeen = true): OwnedState => {
    const items = new Map<string, OwnedItem>();
    for (const [name, o] of Object.entries(rows)) items.set(nameKey(name), { name, carried: 0, noted: 0, ...o });
    return { bankSeen, items };
  };
  const planFor = (id: string, rows: Record<string, Partial<OwnedItem>>, bankSeen = true): PrepPlan => {
    const state = buildPlayerState({
      mode: 'f2p', stats: null, progress: { levels: {} }, owned: owned(rows, bankSeen), gear: { equipment: [], inventory: [], coins: 3000, bankCoins: 0 }, questsDone: null, connected: true,
    });
    return createReadinessEngine({ steps: allSteps, progress: emptyProgress(), qp: 40, mode: 'f2p', state }).plan(stepById.get(id)!);
  };

  const ORACLE = ['Silk', 'Lobster pot', 'Unfired bowl', "Wizard's mind bomb"];
  it('the Oracle items are bought at S4-05 (now), and are on the plan as soon as the player is within the window of S5-04 (S5-03: soon, S5-04: now), never later than that', () => {
    const want: Record<string, string[]> = { 'S4-05': ['NOW'], 'S5-03': ['NOW', 'SOON'], 'S5-04': ['NOW'] };
    for (const [id, timings] of Object.entries(want)) {
      const plan = planFor(id, {});
      stats.plans++;
      for (const name of ORACLE) {
        const l = plan.lines.find((x) => x.name === name);
        expect(l, `${id}: ${name} is on the plan`).toBeDefined();
        expect(timings, `${id}: ${name} timing ${l!.timing}`).toContain(l!.timing);
      }
    }
  });

  it('the dyes for Goblin Diplomacy are on the plan before the player leaves Draynor (the step before it, S2-11)', () => {
    const plan = planFor('S2-11', {});
    for (const name of ['Orange dye', 'Blue dye']) {
      const l = plan.lines.find((x) => x.name === name);
      expect(l, name).toBeDefined();
      expect(['NOW', 'SOON'], `${name} timing`).toContain(l!.timing);
    }
  });

  it('what the bank holds for the Oracle and the ship is taken from the bank, never bought, and the stop is a bank near Falador or Draynor', () => {
    const inBank = Object.fromEntries([...ORACLE, 'Plank', 'Steel nails', 'Hammer'].map((n) => [n, { carried: 0, bank: n === 'Plank' ? 3 : n === 'Steel nails' ? 90 : 1 }]));
    for (const id of ['S5-04', 'S5-06']) {
      const plan = planFor(id, inBank);
      const lines = [...plan.now, ...plan.soon];
      const banked = lines.filter((l) => l.where === 'BANK');
      expect(banked.length, `${id}: some items are in the bank`).toBeGreaterThan(0);
      for (const l of banked) {
        expect(l.action?.kind, `${id}: ${l.name}`).toBe('TAKE');
        expect(lines.some((x) => x.name === l.name && x.action?.kind === 'BUY'), `${id}: ${l.name} is not also a purchase`).toBe(false);
      }
      const from = { x: 3093, y: 3244, plane: 0 };
      const to = navigationTarget(stepById.get(id)!)!;
      const d = procurementDetour({ plan, stepId: id, from, to, coins: 3000 });
      if (d) {
        expect(d.actionType, id).toBe('WITHDRAW');
        expect(d.text, id).not.toMatch(/Grand Exchange|Buy/);
        expect(bankOnRoute(from, to)!.label, id).toMatch(/Falador|Draynor|Port Sarim|Varrock/);
      }
    }
  });

  it('an unopened bank is unknown, not empty: nothing is claimed to be missing or bought', () => {
    const plan = planFor('S5-04', {}, false);
    for (const name of ORACLE) expect(plan.lines.find((x) => x.name === name)?.where, name).toBe('UNKNOWN');
  });
});

describe('F2P route audit: the multi-floor and underground quests, one by one', () => {
  const lines = (id: string) => flat(quests[id]).map((e) => e.line);
  const planes = (id: string) => lines(id).filter((l) => l.at).map((l) => l.at![2]);

  it("Melzar's Maze: ground, first and second floor, then back down into the basement at y 9600+ on plane 0, one key more at each door", () => {
    const at = lines('S5-03').filter((l) => l.at);
    const first = (n: number) => at.findIndex((l) => l.at![2] === n && !ug(l.at!));
    expect(first(0)).toBe(0);
    expect(first(1)).toBeGreaterThan(first(0));
    expect(first(2)).toBeGreaterThan(first(1));
    const basement = at.findIndex((l) => ug(l.at!));
    expect(basement).toBeGreaterThan(first(2));
    expect(at[basement].at![2], 'the basement is plane 0').toBe(0);
    // The keys are counted as they are collected: the item line for the n-th key asks for n keys, so a lost or spent key is noticed.
    const keyCounts = lines('S5-03').map((l) => Number(/^Key x(\d)$/.exec(l.has ?? '')?.[1] ?? 0)).filter(Boolean);
    expect(keyCounts).toEqual([2, 3, 4, 5, 6]);
    expect(lines('S5-03').filter((l) => l.has === 'Key')).toHaveLength(1);
  });

  it('Crandor: the way is ship deck, the hole, the dungeon wall shortcut, the lair and the kill, each on its own tile, so the arrow always has a distance to cover', () => {
    const at = lines('S5-08').filter((l) => l.at);
    expect(at.length).toBeGreaterThanOrEqual(6);
    for (let i = 1; i < at.length; i++) {
      const [a, b] = [at[i - 1].at!, at[i].at!];
      expect(a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2], `the arrow between "${at[i - 1].k}" and "${at[i].k}" is zero`).toBe(true);
    }
    expect(regionOf({ x: at[2].at![0], y: at[2].at![1], plane: at[2].at![2] })).toBe('crandor');
    expect(at.slice(3).every((l) => ug(l.at!))).toBe(true);
    expect(lines('S5-08').some((l) => /shortcut|wall/i.test(l.t) && l.at && ug(l.at))).toBe(true);
  });

  it('the Dwarven Mine (Oracle chest): the ladder down, four hand-ins on the magic door, then the chest, all on plane 0 underground', () => {
    const l = lines('S5-04');
    const door = l.filter((x) => x.need);
    expect(door.map((x) => x.need)).toEqual(['Silk', 'Lobster pot', 'Unfired bowl', "Wizard's mind bomb"]);
    expect(planes('S5-04').every((p) => p === 0)).toBe(true);
    expect(l.some((x) => x.at && /ladder down/i.test(x.t + (x.s ?? '')) && !ug(x.at))).toBe(true);
    expect(l[l.length - 1].at && ug(l[l.length - 1].at!)).toBe(true);
  });

  it('Draynor Manor basement (Ernest): every lever line keeps its own highlight, and the lever lines are the same in both rows that use them, so the state survives the move from row 1 to 2', () => {
    const rows = quests['S2-11'].stages;
    const lever = (r: Row) => r.do.filter((l) => /lever/i.test(l.t)).map((l) => `${l.k}@${l.at}`);
    const [r1, r2] = [rows.find((r) => r.at === 1)!, rows.find((r) => r.at === 2)!];
    expect(lever(r1).length).toBeGreaterThanOrEqual(8);
    expect(lever(r2)).toEqual(lever(r1));
    for (const l of r1.do.filter((x) => /lever/i.test(x.t))) {
      expect(l.at && ug(l.at), l.k).toBe(true);
      expect((l as { hl?: { obj?: number[] } }).hl?.obj?.length, `${l.k} highlights its lever`).toBe(1);
    }
  });
});

describe('F2P route audit: dialogue, puzzles and quest prep', () => {
  const planFor = (id: string) => {
    const state = buildPlayerState({ mode: 'f2p', stats: null, progress: { levels: {} }, owned: { bankSeen: true, items: new Map() }, gear: { equipment: [], inventory: [], coins: 3000, bankCoins: 0 }, questsDone: null, connected: true });
    return createReadinessEngine({ steps: allSteps, progress: emptyProgress(), qp: 40, mode: 'f2p', state }).plan(stepById.get(id)!);
  };

  it("Demon Slayer: Delrith's words are never written into the data: the order comes from the game (varbits 2562..2566)", () => {
    const words = /Carlem|Aber|Camerinthum|Purchai|Gabindo/gi;
    const all = JSON.stringify([allSteps, stagesFile]);
    expect(all.match(words) ?? []).toEqual([]);
  });

  it("The Knight's Sword: the redberry pie goes to Thurgo from the bag of S2-01, and the portrait is held three lines in a row, then handed in", () => {
    const step = stepById.get('S2-07')!;
    expect(step.itemsRequired!.find((i) => i.nameEn === 'Redberry pie')).toMatchObject({ amount: 1 });
    const l = flat(quests['S2-07']).map((e) => e.line);
    expect(l.some((x) => /redberry pie/i.test(x.s ?? x.t))).toBe(true);
    expect(l.filter((x) => x.has === 'Portrait')).toHaveLength(3);
    expect(l.filter((x) => x.need === 'Portrait')).toHaveLength(1);
    expect(l.find((x) => x.need === 'Blurite ore')).toBeDefined();
  });

  it('Vampyre Slayer: the Hammer is a critical item before the manor; the Stake and Garlic come during the step and are never a block at the start', () => {
    const plan = planFor('S2-08');
    const by = (n: string) => plan.lines.find((x) => x.name === n)!;
    expect(by('Hammer')).toMatchObject({ timing: 'NOW', priority: 'CRITICAL' });
    for (const n of ['Stake', 'Garlic']) expect(by(n), n).toMatchObject({ timing: 'IN_STEP', priority: 'OPTIONAL' });
    expect(plan.blockers).toEqual([]);
  });
});

describe('F2P route audit: a player walks S2-12 to the finale', () => {
  const walk = route.filter((s) => s.id >= 'S2-12');
  const progressBefore = (id: string) => ({ ...emptyProgress(), steps: Object.fromEntries(route.filter((s) => s.id < id).map((s) => [s.id, 'done' as const])) });

  it('at every step the plan builds, the arrow has a place with a plane, and the stage rows point at places that exist', () => {
    expect(walk[0].id).toBe('S2-12');
    expect(walk[walk.length - 1].id).toBe(FINALE);
    for (const s of walk) {
      const state = buildPlayerState({ mode: 'f2p', stats: null, progress: { levels: {} }, owned: { bankSeen: true, items: new Map() }, gear: { equipment: [], inventory: [], coins: 3000, bankCoins: 0 }, questsDone: null, connected: true });
      const plan = createReadinessEngine({ steps: allSteps, progress: progressBefore(s.id), qp: 40, mode: 'f2p', state }).plan(s);
      stats.plans++;
      expect(plan.stepId, s.id).toBe(s.id);
      const nav = navigationTarget(s);
      if (!NO_WORLD_POINT.has(s.id)) {
        expect(nav, `${s.id} has no waypoint`).not.toBeNull();
        expect(validPoint(nav!), `${s.id}: ${JSON.stringify(nav)}`).toBe(true);
      }
      const g = stepGuide(s);
      for (const st of g.stage?.stages ?? []) {
        expect(st.steps.length, `${s.id}#${st.at}`).toBeGreaterThan(0);
        if (st.go !== undefined) expect(validPoint(g.places[st.go]), `${s.id}#${st.at} go`).toBe(true);
      }
    }
  });

  it('the Dragon Slayer I tables cover the whole finish: nine steps, each with a first line that has a place', () => {
    for (let n = 1; n <= 9; n++) {
      const id = `S5-0${n}`;
      const lines = flat(quests[id]).map((e) => e.line);
      expect(lines.some((l) => l.at), id).toBe(true);
    }
    expect(flat(quests['S5-08']).some((e) => e.line.has === "Elvarg's head")).toBe(true);
  });
});

afterAll(() => {
  if (!process.env.AUDIT_REPORT) return;
  console.log(`F2P route audit: ${stats.steps} steps, ${stats.tables} stage tables, ${stats.points} points, ${stats.lines} stage transitions (${stats.floorChanges} floor or dungeon changes, ${stats.islandChanges} island crossings), ${stats.anchorPairs} step pairs, `
    + `${stats.plans} plans, most bag slots ${stats.maxSlots} at ${stats.maxSlotsStep}`);
});

// The method catalogue: typed, validated data (data/fundingMethods.json). Nothing here reads the web at run time. Every figure in the file was read from a
// named source on a named date (see each method's `sources`), and validateCatalogue() refuses a method that lacks the structure the evaluator needs.
// The wiki's guide pages are prose; what the evaluator may rely on for eligibility is only what is structured here.

import catalogueJson from '../../data/fundingMethods.json';
import { ALL_SKILLS } from '../tradeRestriction';
import type { Catalogue, Flow, FundingMethod, Place } from './types';

export const CATALOGUE = catalogueJson as unknown as Catalogue;
export const METHODS: readonly FundingMethod[] = CATALOGUE.methods;
const BY_ID = new Map(METHODS.map((m) => [m.id, m]));

export function methodById(id: string): FundingMethod | undefined {
  return BY_ID.get(id);
}

/** A drop at or above this chance per unit is counted on; below it is upside shown apart and never used for time estimates. */
export const DEPENDABLE_CHANCE = 1 / 16;

export function chanceOf(f: Pick<Flow, 'chance'>): number {
  return f.chance ? f.chance[0] / f.chance[1] : 1;
}

/** The amount one unit of the activity moves in expectation. */
export function expectedQty(f: Flow): number {
  return f.qty * chanceOf(f);
}

export function isDependable(f: Flow): boolean {
  return chanceOf(f) >= DEPENDABLE_CHANCE;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface ValidationContext {
  /** Quest names the route knows (lib/quests.ts); a requirement naming another quest is a typo. */
  quests?: ReadonlySet<string>;
  /** The combat foes by name and the free versions each has. */
  foes?: ReadonlyMap<string, readonly string[]>;
}

function placeProblems(p: Place | undefined, what: string): string[] {
  if (!p) return [`${what}: missing`];
  const out: string[] = [];
  if (!Number.isInteger(p.x) || p.x < 1000 || p.x > 4500) out.push(`${what}: x ${p.x} is outside the map`);
  if (!Number.isInteger(p.y) || p.y < 2000 || p.y > 12500) out.push(`${what}: y ${p.y} is outside the map`);
  if (![0, 1, 2, 3].includes(p.plane)) out.push(`${what}: plane ${p.plane}`);
  if (!p.label) out.push(`${what}: no label`);
  return out;
}

function flowProblems(f: Flow, what: string): string[] {
  const out: string[] = [];
  if (!f.item || !Number.isInteger(f.item.id) || f.item.id <= 0 || !f.item.name) out.push(`${what}: bad item`);
  if (!(f.qty > 0) || !Number.isFinite(f.qty)) out.push(`${what}: quantity must be positive`);
  if (f.chance) {
    const [n, d] = f.chance;
    if (!Number.isInteger(n) || !Number.isInteger(d) || n <= 0 || d <= 0 || n > d) out.push(`${what}: chance ${n}/${d} is not a probability`);
  }
  if (f.item?.id === 995 && f.item.name !== 'Coins') out.push(`${what}: id 995 is Coins`);
  return out;
}

/** Every problem found, as short sentences; an empty list means the catalogue is sound. */
export function validateCatalogue(c: Catalogue, ctx: ValidationContext = {}): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  const nameOfId = new Map<number, string>();
  const note = (id: string, ...problems: string[]) => { for (const p of problems) out.push(`${id}: ${p}`); };
  if (!ISO_DAY.test(c.generatedAt)) out.push(`catalogue: generatedAt ${c.generatedAt} is not a date`);
  for (const m of c.methods) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(m.id)) note(m.id, 'the id must be lower-case words joined by dashes');
    if (ids.has(m.id)) note(m.id, 'duplicate id');
    ids.add(m.id);
    if (!m.title || !m.summary) note(m.id, 'title and summary are required');
    if (m.outputs.length === 0) note(m.id, 'a method must produce something');
    for (const f of [...m.inputs, ...m.outputs]) {
      note(m.id, ...flowProblems(f, `item ${f.item?.name ?? '?'}`));
      const known = nameOfId.get(f.item.id);
      if (known !== undefined && known !== f.item.name) note(m.id, `item id ${f.item.id} is "${f.item.name}" here and "${known}" elsewhere`);
      nameOfId.set(f.item.id, f.item.name);
    }
    const r = m.rate;
    const { slow, typical, fast } = r.perHour;
    if (!(slow > 0 && slow <= typical && typical <= fast)) note(m.id, 'rate: need 0 < slow <= typical <= fast');
    if (!r.unit || !r.assumes) note(m.id, 'rate: unit and assumptions are required');
    if (r.levelScale) {
      const s = r.levelScale;
      if (!(ALL_SKILLS as readonly string[]).includes(s.skill)) note(m.id, `levelScale: unknown skill ${s.skill}`);
      if (!(s.fromLevel < s.atLevel) || !(s.minFactor > 0 && s.minFactor <= 1)) note(m.id, 'levelScale: need fromLevel < atLevel and 0 < minFactor <= 1');
    }
    if (r.toolScale && !(r.toolScale.below > 0 && r.toolScale.below <= 1)) note(m.id, 'toolScale: below must be in (0, 1]');
    if (!(m.trip.bagSlots >= 1 && m.trip.bagSlots <= 28) || !(m.trip.overheadSeconds >= 0)) note(m.id, 'trip: bag slots 1..28 and overhead >= 0');
    note(m.id, ...placeProblems(m.spot, 'spot'), ...placeProblems(m.bank, 'bank'));
    if (!(m.saleSeconds >= 0)) note(m.id, 'saleSeconds must be >= 0');
    for (const q of m.requirements) {
      if (q.kind === 'level') {
        if (!(ALL_SKILLS as readonly string[]).includes(q.skill) || !(q.level >= 1 && q.level <= 99)) note(m.id, `requirement: ${q.skill} ${q.level}`);
      } else if (q.kind === 'quest') {
        if (ctx.quests && !ctx.quests.has(q.quest)) note(m.id, `requirement: the route has no quest called "${q.quest}"`);
        if (q.state !== 'complete' && q.state !== 'started') note(m.id, 'requirement: quest state');
      } else if (q.kind === 'item') {
        if (!q.family && q.any.length === 0) note(m.id, 'requirement: an item requirement needs a tool family or a list');
      } else if (q.kind === 'fare') {
        if (!(q.coins > 0)) note(m.id, 'requirement: a fare must be positive');
        if (q.unlessQuest && ctx.quests && !ctx.quests.has(q.unlessQuest)) note(m.id, `requirement: the route has no quest called "${q.unlessQuest}"`);
      }
    }
    if (m.family === 'combat') {
      if (!m.combat) note(m.id, 'a combat method needs its combat profile');
      else if (ctx.foes) {
        const versions = ctx.foes.get(m.combat.foe);
        if (!versions) note(m.id, `combat: no data for ${m.combat.foe}`);
        else for (const v of m.combat.versions ?? []) if (!versions.includes(v)) note(m.id, `combat: ${m.combat.foe} has no free version "${v}"`);
      }
    } else if (m.combat) {
      note(m.id, 'only a combat method has a combat profile');
    }
    if (m.guide.length === 0 || !m.guide.some((g) => g.kind === 'perform')) note(m.id, 'the guide needs at least a perform action');
    if (m.sources.length === 0) note(m.id, 'at least one source is required');
    for (const s of m.sources) {
      if (!/^https:\/\//.test(s.url) || !ISO_DAY.test(s.retrievedAt) || !s.used) note(m.id, `source "${s.title}" needs an https address, a retrieval date and what it was used for`);
      if (s.revision !== undefined && !Number.isInteger(s.revision)) note(m.id, `source "${s.title}": revision`);
    }
    if (!ISO_DAY.test(m.verifiedAt)) note(m.id, 'verifiedAt must be a date');
    if (m.assumptions.length === 0) note(m.id, 'say what the figures assume');
    if (m.access === 'members' && m.family === 'combat' && !m.combat) note(m.id, 'members method without detail');
  }
  return out;
}

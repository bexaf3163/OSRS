// The upgrade roadmap of the Gear page: the items that are better but cannot be worn yet (a lock) and the ones that open next, as one list.
// A row is one requirement and the items it opens (three steel items "need 5 Defence" are one row); every missing level has a bar.

import type { GearSlot } from '../types';
import type { Gain, GearAdvice, LockedItem, MissingRequirement } from '../services/gearAdvisor';

export type ReqSkill = Extract<MissingRequirement, { kind: 'skill' }>['skill'];

export interface RoadmapItem { id: number; name: string; slot: GearSlot; iconUrl?: string; gain?: string }
export interface RoadmapSkill { skill: ReqSkill; need: number; have: number }
export interface RoadmapRow {
  key: string;
  items: RoadmapItem[];
  skills: RoadmapSkill[];
  quests: string[];
  /** Already in the bag or bank: it cannot be skipped, so it goes first. */
  owned?: 'bag' | 'bank';
  /** Levels still to gain over all the skills: the closest goal first. */
  missingLevels: number;
}

/** "+7% DPS", "+3 Def", "+7% DPS, +2 Def"; undefined when the gain is too small to name. */
export function gainLabel(g: Gain): string | undefined {
  if (g.kind === 'defence') return g.after > g.before ? `+${g.after - g.before} Def` : undefined;
  const parts: string[] = [];
  if (g.ratio >= 1.01) parts.push(`+${Math.round((g.ratio - 1) * 100)}% DPS`);
  if (g.defenceAfter !== undefined && g.defenceBefore !== undefined && g.defenceAfter > g.defenceBefore) parts.push(`+${g.defenceAfter - g.defenceBefore} Def`);
  return parts.join(', ') || undefined;
}

const skillsOf = (m: MissingRequirement[]): RoadmapSkill[] =>
  m.flatMap((r) => (r.kind === 'skill' ? [{ skill: r.skill, need: r.need, have: r.have }] : []));
const questsOf = (m: MissingRequirement[]): string[] => m.flatMap((r) => (r.kind === 'quest' ? [r.quest] : []));
const left = (s: RoadmapSkill[]) => s.reduce((n, x) => n + Math.max(0, x.need - x.have), 0);

export function buildRoadmap(advice: Pick<GearAdvice, 'locked' | 'unlocks'>): RoadmapRow[] {
  const rows: RoadmapRow[] = [];
  const byKey = new Map<string, RoadmapRow>();
  const seen = new Set<number>();
  const add = (key: string, item: RoadmapItem, skills: RoadmapSkill[], quests: string[], owned?: 'bag' | 'bank') => {
    seen.add(item.id);
    // An item that already lies in the bag or bank is always its own row.
    const found = owned ? undefined : byKey.get(key);
    if (found) { found.items.push(item); return; }
    const row: RoadmapRow = { key: `${key}|${item.id}`, items: [item], skills, quests, ...(owned ? { owned } : {}), missingLevels: skills.length ? left(skills) : 99 };
    rows.push(row);
    if (!owned) byKey.set(key, row);
  };
  for (const l of advice.locked as LockedItem[]) {
    const skills = skillsOf(l.missing);
    add(JSON.stringify(l.missing), { id: l.item.id, name: l.item.name, slot: l.slot, ...(l.item.iconUrl ? { iconUrl: l.item.iconUrl } : {}), ...(gainLabel(l.gain) ? { gain: gainLabel(l.gain) } : {}) }, skills, questsOf(l.missing), l.owned);
  }
  for (const u of advice.unlocks) {
    if (seen.has(u.item.id)) continue;
    add(`unlock:${u.skill}:${u.level}`, { id: u.item.id, name: u.item.name, slot: u.item.slot, ...(u.item.iconUrl ? { iconUrl: u.item.iconUrl } : {}) },
      [{ skill: u.skill, need: u.level, have: u.have }], []);
  }
  return rows.sort((a, b) => Number(Boolean(b.owned)) - Number(Boolean(a.owned)) || a.missingLevels - b.missingLevels);
}

/** The prayers for the chips: the ones already unlocked, otherwise the first one to aim for. */
export function prayerChips(prayers: GearAdvice['prayers']): { name: string; ready: boolean; title: string }[] {
  if (prayers.length) return prayers.map((p) => ({ name: p.name, ready: true, title: `${p.effect}${p.maxHit ? `, max hit ${p.maxHit}` : ''}` }));
  return [{ name: 'Burst of Strength', ready: false, title: '+5% Strength, from 4 Prayer: bury bones' }];
}

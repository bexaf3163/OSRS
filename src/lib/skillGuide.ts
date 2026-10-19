// The skill leveling guides (src/data/skills/<skill>.json, built by tools/skill-guides from the OSRS Wiki): the step schema, the path for a filter, and what goes to
// the game. A path is a list of level brackets in the order to train them: quest XP skips first, then the methods. Pure logic: the registry loads the files.

import type { Step } from '../types';

export const SKILL_NAMES = [
  'attack', 'strength', 'defence', 'ranged', 'prayer', 'magic', 'runecraft', 'construction', 'hitpoints', 'agility', 'herblore', 'thieving', 'crafting',
  'fletching', 'slayer', 'hunter', 'mining', 'smithing', 'fishing', 'cooking', 'firemaking', 'woodcutting', 'farming',
] as const;
export type SkillName = (typeof SKILL_NAMES)[number];

export type SkillMethodType = 'QUEST' | 'GATHER' | 'CRAFT' | 'COMBAT' | 'MINIGAME';
/** fast: quest skips and the fastest methods; afk: low-effort methods; both: fits either. */
export type GuideLane = 'fast' | 'afk' | 'both';
/**
 * The roadmap's priority: 'fast' (quest XP skips and the fastest methods) or 'afk' (low effort). 'f2p' is the pre-2.70 third filter, the fast lane
 * without members steps; it is still read from older saves. Eligibility (free account or members) is a separate flag since 2.70 (`freeOnly`).
 */
export type GuideMode = 'fast' | 'afk' | 'f2p';

export interface SkillStep {
  id: string;
  skill: SkillName;
  /** The level the step starts at and the level it ends on. */
  levelRange: [number, number];
  methodType: SkillMethodType;
  /** "The Knight's Sword (XP skip)". */
  title: string;
  /** What to cut, mine, kill or make: short. */
  description: string;
  targetLevel: number;
  recommendedXpRate?: string;
  location: {
    name: string;
    /** [x, y, plane]. */
    tile: [number, number, number];
    /** A game object or NPC id when one is known; the names are what the game highlights by default (the same tree or rock has many ids). */
    objectId?: number;
    npcId?: number;
    objectName?: string;
    npcName?: string;
  };
  prerequisites?: {
    questIds?: string[];
    items?: { id: number; name: string; quantity: number }[];
  };
  lane: GuideLane;
  members: boolean;
  /** A quest skip: the quest, its real XP reward on this skill (from the wiki) and the route step that does the same quest, if there is one. */
  reward?: { quest: string; xp: number; routeStepId?: string };
}

export interface SkillGuideFile {
  skill: SkillName;
  /** The level the guide starts at (Hitpoints starts at 10). */
  start: number;
  /** The highest level a free account reaches by this guide; 0 means a members-only skill. */
  f2pCap: number;
  steps: SkillStep[];
}

const MAX_LEVEL = 99;

/**
 * The filter a roadmap opens with. A free account starts on "F2P Only", so the recommended method is always one it can use; the Members filters stay
 * one click away as a labelled preview. A members account (or a members-only skill, which has no free path) starts on "Fastest".
 */
export function defaultGuideMode(guide: Pick<SkillGuideFile, 'f2pCap'>, account: 'f2p' | 'members'): GuideMode {
  return account === 'f2p' && guide.f2pCap > 0 ? 'f2p' : 'fast';
}

/**
 * The candidates of a filter, in the order of preference: quest XP skips first (they skip the slow levels), then the steps made for the lane, then the ones
 * that fit both. The free filter has no members step. The AFK filter keeps only the quests marked for both lanes (a short free one, or one that unlocks the skill).
 */
export function candidatesFor(guide: SkillGuideFile, mode: GuideMode, freeOnly = mode === 'f2p'): SkillStep[] {
  const lane: GuideLane = mode === 'afk' ? 'afk' : 'fast';
  const fit = guide.steps.filter((s) => (freeOnly ? !s.members : true) && (s.lane === lane || s.lane === 'both'));
  const quest = fit.filter((s) => s.methodType === 'QUEST');
  const rest = fit.filter((s) => s.methodType !== 'QUEST');
  return [...quest, ...rest.filter((s) => s.lane === lane), ...rest.filter((s) => s.lane === 'both')];
}

/**
 * The brackets in the order to train them, from `from` (the guide's start by default) to 99. isDone: a quest step whose quest the player has done is skipped.
 * A step that fits both lanes is cut where a step made for the lane begins (iron until 45, then granite), so the lane's own methods are not hidden behind it.
 */
export function buildPath(guide: SkillGuideFile, mode: GuideMode, isDone: (step: SkillStep) => boolean = () => false, from = guide.start, freeOnly = mode === 'f2p'): SkillStep[] {
  const pool = candidatesFor(guide, mode, freeOnly).filter((s) => !isDone(s));
  const out: SkillStep[] = [];
  let level = Math.max(1, from);
  while (level < MAX_LEVEL) {
    const at = level;
    const pick = pool.find((s) => s.levelRange[0] <= at && s.levelRange[1] > at);
    if (!pick) break;
    let end = pick.levelRange[1];
    if (pick.lane === 'both' && pick.methodType !== 'QUEST') {
      for (const s of pool) if (s.lane !== 'both' && s.methodType !== 'QUEST' && s.levelRange[0] > at && s.levelRange[0] < end) end = s.levelRange[0];
    }
    out.push(end === pick.levelRange[1] && level === pick.levelRange[0] ? pick : { ...pick, levelRange: [level, end], targetLevel: end });
    level = end;
  }
  return out;
}

/** The index of the step the player is on: the first whose target level is above the real level; path.length when the whole path is done. */
export function currentIndex(path: readonly SkillStep[], level: number): number {
  const i = path.findIndex((s) => s.targetLevel > level);
  return i < 0 ? path.length : i;
}

/** The first level the free path does not cover, or null when it reaches the cap (a guide that is not free to play: 0). */
export function f2pCovered(guide: SkillGuideFile): number {
  const path = buildPath(guide, 'f2p');
  return path.length ? path[path.length - 1].targetLevel : guide.start;
}

/** "🎯 Iron ore (powermining) (Lvl 17 → 45)": the action chip for the HUD in the game and the desktop card. */
export function chipText(step: Pick<SkillStep, 'title' | 'targetLevel'>, level: number): string {
  return `🎯 ${step.title.replace(/\s*\(XP skip\)\s*$/i, '')} (Lvl ${Math.min(level, step.targetLevel)} → ${step.targetLevel})`;
}

/**
 * Simulates the game's StatChanged: the real level of the tracked skill arrived. The same rule the plugin follows: the cursor is the first step above the level,
 * so reaching the target level moves on, a lower level never moves back, and several levels at once (a lamp) skip over the steps they covered.
 */
export function onStatChanged(path: readonly SkillStep[], cursor: number, level: number): { cursor: number; advanced: boolean } {
  const next = currentIndex(path, level);
  return next > cursor ? { cursor: next, advanced: true } : { cursor, advanced: false };
}

/**
 * The followed skill plan's current step as a route-shaped step for the shopping list (2.70): its tools and materials, so "Follow this plan" changes
 * what to obtain as well as where the game leads. Only the items; nothing else of a route step is invented. null - the step needs no item.
 */
export function followedShoppingStep(skill: SkillName, step: SkillStep): Step | null {
  const items = step.prerequisites?.items ?? [];
  if (!items.length) return null;
  return {
    id: `skill:${skill}`, stage: 0, type: 'skill', requires: [], doneWhen: `The ${skill} plan step reaches level ${step.targetLevel}.`,
    title: `Your ${skill[0].toUpperCase()}${skill.slice(1)} plan: ${step.title}`,
    itemsRequired: items.map((i) => ({ nameEn: i.name, amount: i.quantity, wikiItemId: i.id, howToGet: `For your ${skill} plan (${step.title}).` })),
  } as Step;
}

// ---------------------------------------------------------------- To the game

export interface SkillPathPayload {
  /** The skill as the game names it, lower case. */
  skill: SkillName;
  mode: GuideMode;
  steps: {
    id: string;
    title: string;
    /** The short action line. */
    action: string;
    methodType: SkillMethodType;
    fromLevel: number;
    targetLevel: number;
    location: { name: string; x: number; y: number; plane: number; objectId?: number; npcId?: number; objectName?: string; npcName?: string };
  }[];
}

const MAX_TEXT = 200;
const clip = (s: string, n = MAX_TEXT) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);

export function skillPathPayload(skill: SkillName, mode: GuideMode, path: readonly SkillStep[]): SkillPathPayload {
  return {
    skill,
    mode,
    steps: path.map((s) => ({
      id: s.id,
      title: clip(s.title, 80),
      action: clip(s.description),
      methodType: s.methodType,
      fromLevel: s.levelRange[0],
      targetLevel: s.targetLevel,
      location: {
        name: clip(s.location.name, 80), x: s.location.tile[0], y: s.location.tile[1], plane: s.location.tile[2],
        ...(s.location.objectId ? { objectId: s.location.objectId } : {}),
        ...(s.location.npcId ? { npcId: s.location.npcId } : {}),
        ...(s.location.objectName ? { objectName: s.location.objectName } : {}),
        ...(s.location.npcName ? { npcName: s.location.npcName } : {}),
      },
    })),
  };
}

/**
 * Level groups for the timeline: the path's steps grouped where they start (under 30, 30–39, 40–59, 60+), each group labelled by the levels its steps
 * really cover. A step stays whole, so a group's label is never narrower than its steps: "Levels 30–60" for a step "Lvl 30 → 60" (before 2.70 the
 * label was the fixed bracket, "Levels 30–40", over a step that ran to 60).
 */
export function bracketsOf(path: readonly SkillStep[]): { from: number; to: number; steps: SkillStep[] }[] {
  const edges = [0, 30, 40, 60, 99];
  const groups: { edge: number; steps: SkillStep[] }[] = [];
  for (const step of path) {
    const edge = edges.find((e) => e > step.levelRange[0]) ?? 99;
    const last = groups[groups.length - 1];
    if (last && last.edge === edge) last.steps.push(step);
    else groups.push({ edge, steps: [step] });
  }
  return groups.map((g) => ({
    from: Math.max(1, Math.min(...g.steps.map((x) => x.levelRange[0]))),
    to: Math.max(...g.steps.map((x) => x.targetLevel)),
    steps: g.steps,
  }));
}

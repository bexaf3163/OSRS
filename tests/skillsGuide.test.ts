import { describe, expect, it } from 'vitest';
import { buildEnvelope, envelopeKey, SNAPSHOT_VERSION } from '../src/lib/prepEnvelope';
import { skillGuides } from '../src/data/skillGuideRegistry';
import locationsJson from '../src/data/majorLocations.json';
import { membersSkills } from '../src/data';
import {
  SKILL_NAMES, bracketsOf, buildPath, chipText, currentIndex, f2pCovered, onStatChanged, skillPathPayload,
  type GuideMode, type SkillGuideFile, type SkillStep,
} from '../src/lib/skillGuide';

// The 23 skill guides (src/data/skills/*.json): the schema, the coverage of every filter, the quest skips first, and the StatChanged rule the plugin follows.

const METHODS = ['QUEST', 'GATHER', 'CRAFT', 'COMBAT', 'MINIGAME'];
const LANES = ['fast', 'afk', 'both'];
const MODES: GuideMode[] = ['fast', 'afk', 'f2p'];
const places = (locationsJson as unknown as { locations: Record<string, { x: number; y: number; plane: number }> }).locations;
const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

/** The schema of one file; returns the list of problems (empty when the file is fine). */
function problems(file: SkillGuideFile): string[] {
  const out: string[] = [];
  const bad = (id: string, what: string) => out.push(`${id}: ${what}`);
  if (!isInt(file.start) || file.start < 1 || file.start > 98) bad(file.skill, 'start');
  if (!isInt(file.f2pCap) || file.f2pCap < 0 || file.f2pCap > 99) bad(file.skill, 'f2pCap');
  if (!Array.isArray(file.steps) || !file.steps.length) bad(file.skill, 'no steps');
  const ids = new Set<string>();
  file.steps.forEach((s, i) => {
    const id = s.id;
    if (id !== `${file.skill}-${String(i + 1).padStart(2, '0')}`) bad(String(id), 'id is not skill-NN in order');
    if (ids.has(id)) bad(id, 'duplicate id');
    ids.add(id);
    if (s.skill !== file.skill) bad(id, 'skill differs from the file');
    const [lo, hi] = s.levelRange ?? [];
    if (!isInt(lo) || !isInt(hi) || lo < 1 || hi > 99 || lo >= hi) bad(id, `levelRange ${JSON.stringify(s.levelRange)}`);
    if (s.targetLevel !== hi) bad(id, 'targetLevel is not the end of levelRange');
    if (!METHODS.includes(s.methodType)) bad(id, 'methodType');
    if (!LANES.includes(s.lane)) bad(id, 'lane');
    if (typeof s.members !== 'boolean') bad(id, 'members');
    if (typeof s.title !== 'string' || s.title.length < 3 || s.title.length > 80) bad(id, 'title');
    if (typeof s.description !== 'string' || s.description.length < 10 || s.description.length > 300) bad(id, 'description');
    if (s.recommendedXpRate !== undefined && (typeof s.recommendedXpRate !== 'string' || !s.recommendedXpRate)) bad(id, 'recommendedXpRate');
    const loc = s.location;
    if (!loc || typeof loc.name !== 'string' || !loc.name) bad(id, 'location.name');
    const [x, y, p] = loc?.tile ?? [];
    if (!isInt(x) || !isInt(y) || !isInt(p) || x < 1000 || x > 4400 || y < 2400 || y > 10500 || p < 0 || p > 3) bad(id, `location.tile ${JSON.stringify(loc?.tile)}`);
    for (const k of ['objectId', 'npcId'] as const) if (loc?.[k] !== undefined && (!isInt(loc[k]) || (loc[k] as number) < 1)) bad(id, `location.${k}`);
    for (const k of ['objectName', 'npcName'] as const) if (loc?.[k] !== undefined && (typeof loc[k] !== 'string' || !loc[k])) bad(id, `location.${k}`);
    const pre = s.prerequisites;
    if (pre) {
      for (const q of pre.questIds ?? []) if (typeof q !== 'string' || !q) bad(id, 'prerequisites.questIds');
      for (const it of pre.items ?? []) if (!isInt(it.id) || it.id < 1 || !it.name || !isInt(it.quantity) || it.quantity < 1) bad(id, 'prerequisites.items');
    }
    if (s.methodType === 'QUEST') {
      if (!s.reward || !s.reward.quest || !isInt(s.reward.xp) || s.reward.xp < 1) bad(id, 'a QUEST step needs reward {quest, xp}');
    } else if (s.reward) bad(id, 'only a QUEST step has a reward');
  });
  return out;
}

const files = SKILL_NAMES.map((n) => skillGuides[n] as SkillGuideFile);

describe('skill guides: the data', () => {
  it('there is one guide for each of the 23 skills, named by the skill', () => {
    expect(SKILL_NAMES).toHaveLength(23);
    expect(Object.keys(skillGuides).sort()).toEqual([...SKILL_NAMES].sort());
    for (const n of SKILL_NAMES) expect(skillGuides[n].skill).toBe(n);
  });

  it('every file follows the SkillStep schema', () => {
    const all = files.flatMap(problems);
    expect(all, all.join('\n')).toEqual([]);
    expect(files.reduce((s, f) => s + f.steps.length, 0)).toBeGreaterThan(120);
  });

  it('a place that is in the location dictionary has exactly its tile', () => {
    for (const f of files) {
      for (const s of f.steps) {
        const known = places[s.location.name];
        if (known) expect(s.location.tile, `${s.id} ${s.location.name}`).toEqual([known.x, known.y, known.plane]);
      }
    }
  });

  it('a skill is members-only exactly when its free cap is 0, and it matches the members skills of the app', () => {
    const memberSkillIds = new Set(membersSkills.flatMap((m) => m.levelSkills));
    for (const f of files) {
      const allMembers = f.steps.every((s) => s.members);
      expect(f.f2pCap === 0, `${f.skill}: f2pCap ${f.f2pCap}, all steps members ${allMembers}`).toBe(allMembers);
      expect(memberSkillIds.has(f.skill), f.skill).toBe(f.f2pCap === 0 && f.skill !== 'hitpoints');
    }
  });

  it('a quest reward is the real XP: the level it ends on follows the XP table (quest skips chain)', () => {
    const at = (skill: string, quest: string) => skillGuides[skill as keyof typeof skillGuides].steps.find((s) => s.reward?.quest === quest)!;
    expect(at('smithing', "The Knight's Sword").reward!.xp).toBe(12725);
    expect(at('smithing', "The Knight's Sword").levelRange).toEqual([1, 29]);
    expect(at('fishing', 'Sea Slug').levelRange).toEqual([1, 24]);
    expect(at('attack', 'Waterfall Quest').levelRange).toEqual([1, 30]);
    expect(at('strength', 'Waterfall Quest').levelRange).toEqual([1, 30]);
    expect(at('hitpoints', "Witch's House").reward!.xp).toBe(6325);
    expect(at('agility', 'The Tourist Trap').reward!.xp).toBe(9300);
    // Quest steps of one skill chain: each starts where the previous quest step ended.
    for (const f of files) {
      const quests = f.steps.filter((s) => s.methodType === 'QUEST');
      quests.forEach((q, i) => expect(q.levelRange[0], q.id).toBe(i ? quests[i - 1].levelRange[1] : f.start));
    }
  });
});

describe('skill guides: the paths', () => {
  it('every filter reaches 99 (the free filter reaches the free cap) without a gap', () => {
    const gaps: string[] = [];
    for (const f of files) {
      for (const mode of MODES) {
        if (mode === 'f2p' && f.f2pCap === 0) continue;
        const path = buildPath(f, mode);
        const end = path.length ? path[path.length - 1].targetLevel : f.start;
        const want = mode === 'f2p' ? f.f2pCap : 99;
        if (end < want) gaps.push(`${f.skill}/${mode}: ends at ${end}, want ${want}`);
        // The brackets touch: each starts where the one before ended.
        path.forEach((s, i) => { if (i && s.levelRange[0] !== path[i - 1].targetLevel) gaps.push(`${f.skill}/${mode}: hole before ${s.id}`); });
        if (mode === 'f2p') for (const s of path) if (s.members) gaps.push(`${f.skill}/f2p: members step ${s.id}`);
        if (mode === 'afk') for (const s of path) if (s.lane === 'fast') gaps.push(`${f.skill}/afk: a fast-lane step ${s.id}`);
      }
    }
    expect(gaps, gaps.join('\n')).toEqual([]);
  });

  it('early levels prioritize quest XP skips while the quest is not done, and drop them once it is', () => {
    const noQuest = (done: Set<string>) => (s: SkillStep) => Boolean(s.reward && done.has(s.reward.quest));
    let checked = 0;
    for (const f of files) {
      const first = f.steps.find((s) => s.methodType === 'QUEST' && s.levelRange[0] === f.start && s.lane !== 'afk');
      if (!first) continue;
      checked++;
      const fresh = buildPath(f, 'fast', noQuest(new Set()));
      expect(fresh[0], f.skill).toMatchObject({ methodType: 'QUEST', id: first.id });
      const done = buildPath(f, 'fast', noQuest(new Set([first.reward!.quest])));
      // Herblore is the one skill the quest unlocks: with it done there is no level-1 method, the player is already at 3.
      if (f.skill === 'herblore') { expect(done).toEqual([]); continue; }
      expect(done[0].id, `${f.skill}: the quest is done`).not.toBe(first.id);
      expect(done[0].levelRange[0]).toBe(f.start);
    }
    expect(checked).toBeGreaterThanOrEqual(12);
    // The user-visible cases: Knight's Sword for Smithing (free to play too), Sea Slug for Fishing, Waterfall for both melee skills.
    expect(buildPath(skillGuides.smithing, 'fast')[0].title).toMatch(/Knight's Sword/);
    expect(buildPath(skillGuides.smithing, 'f2p')[0].title).toMatch(/Knight's Sword/);
    expect(buildPath(skillGuides.fishing, 'fast')[0].title).toMatch(/Sea Slug/);
    expect(buildPath(skillGuides.fishing, 'f2p')[0].title).not.toMatch(/Sea Slug/);
    expect(buildPath(skillGuides.attack, 'fast')[0].title).toMatch(/Waterfall/);
    expect(buildPath(skillGuides.mining, 'afk')[0].methodType).not.toBe('QUEST');
  });

  it('a step that fits both lanes is cut where a step of the lane begins', () => {
    const path = buildPath(skillGuides.mining, 'fast', (s) => Boolean(s.reward));
    const iron = path.find((s) => /Iron ore/.test(s.title))!;
    const granite = path.find((s) => /Granite/.test(s.title))!;
    expect(iron.levelRange).toEqual([15, 45]);
    expect(granite.levelRange).toEqual([45, 99]);
    // The AFK lane keeps Motherlode Mine from 30 instead.
    const afk = buildPath(skillGuides.mining, 'afk');
    expect(afk.map((s) => s.title)).toEqual(['Copper and tin', 'Iron ore (powermining)', 'Motherlode Mine']);
  });

  it('the free filter of a members skill is empty, and f2pCovered says how far a free account gets', () => {
    expect(buildPath(skillGuides.agility, 'f2p')).toEqual([]);
    expect(f2pCovered(skillGuides.crafting)).toBe(43);
    expect(f2pCovered(skillGuides.runecraft)).toBe(44);
    expect(f2pCovered(skillGuides.mining)).toBe(99);
  });

  it('the timeline groups the path by level brackets', () => {
    const groups = bracketsOf(buildPath(skillGuides.mining, 'fast'));
    expect(groups.map((g) => [g.from, g.to])).toEqual(expect.arrayContaining([[1, 30]]));
    for (const g of groups) for (const s of g.steps) expect(s.levelRange[0]).toBeLessThan(g.to);
  });
});

describe('skill guides: StatChanged advances the active step', () => {
  const path = buildPath(skillGuides.woodcutting, 'f2p');

  it('reaching the target level moves to the next step and nothing moves it before', () => {
    let cursor = currentIndex(path, 1);
    expect(path[cursor].title).toBe('Regular trees');
    const target = path[cursor].targetLevel;
    for (let level = 1; level < target; level++) {
      const r = onStatChanged(path, cursor, level);
      expect(r, `level ${level}`).toEqual({ cursor, advanced: false });
    }
    const hit = onStatChanged(path, cursor, target);
    expect(hit.advanced).toBe(true);
    cursor = hit.cursor;
    expect(path[cursor].levelRange[0]).toBe(target);
    expect(path[cursor].title).toBe('Oak trees');
  });

  it('a jump over several levels (a lamp) skips the steps it covered, a lower level never moves back, the end of the path stays put', () => {
    const jump = onStatChanged(path, 0, 61);
    expect(path[jump.cursor].title).toBe('Yew trees');
    expect(onStatChanged(path, jump.cursor, 10)).toEqual({ cursor: jump.cursor, advanced: false });
    const done = onStatChanged(path, jump.cursor, 99);
    expect(done).toEqual({ cursor: path.length, advanced: true });
    expect(onStatChanged(path, path.length, 99).advanced).toBe(false);
  });

  it('the HUD chip names the action and the real level range', () => {
    expect(chipText({ title: 'Iron ore (powermining)', targetLevel: 45 }, 17)).toBe('🎯 Iron ore (powermining) (Lvl 17 → 45)');
    expect(chipText({ title: "The Knight's Sword (XP skip)", targetLevel: 29 }, 1)).toBe("🎯 The Knight's Sword (Lvl 1 → 29)");
  });
});

describe('skill guides: what goes to the game', () => {
  it('the payload carries the location, the object and the NPC of every step, within the plugin limits', () => {
    for (const mode of MODES) {
      for (const f of files) {
        if (mode === 'f2p' && f.f2pCap === 0) continue;
        const payload = skillPathPayload(f.skill, mode, buildPath(f, mode));
        expect(payload.steps.length, `${f.skill}/${mode}`).toBeLessThanOrEqual(24);
        for (const s of payload.steps) {
          expect(s.location.x).toBeGreaterThan(0);
          expect(s.location.plane).toBeGreaterThanOrEqual(0);
          expect(s.title.length).toBeLessThanOrEqual(80);
          expect(s.action.length).toBeLessThanOrEqual(200);
        }
      }
    }
    const rock = skillPathPayload('mining', 'fast', buildPath(skillGuides.mining, 'fast')).steps.find((s) => /Iron/.test(s.title))!;
    expect(rock.location).toMatchObject({ x: 3298, y: 3293, plane: 0, objectName: 'Iron rocks' });
  });

  it('the snapshot carries the path only when there is one, and a stopped track sends the same snapshot as before', () => {
    const path = skillPathPayload('mining', 'fast', buildPath(skillGuides.mining, 'fast'));
    const base = { step: null, shopping: null, bankTags: null, gearHint: null, plan: null };
    const withPath = buildEnvelope({ ...base, skillPath: path }, 1);
    expect(withPath.skillPath).toEqual(path);
    expect(withPath.v).toBe(SNAPSHOT_VERSION);
    for (const none of [undefined, null, { ...path, steps: [] }]) {
      const e = buildEnvelope({ ...base, skillPath: none }, 1);
      expect('skillPath' in e).toBe(false);
    }
    expect(envelopeKey({ ...base, skillPath: path })).not.toBe(envelopeKey(base));
  });
});


import { describe, expect, it } from 'vitest';
import { findSkill, items, levelById, membersGuide, membersSkills, plugins, reference, skillById, skills, stepById, stepsFor } from '../src/data';
import { rangeForLevel, skillRange } from '../src/lib/ranges';
import { buildIndex, search } from '../src/lib/search';
import { stepSkills } from '../src/components/RangeHints';
import { emptyProgress } from '../src/lib/progress';

const progress = (levels: Record<string, number>) => ({ ...emptyProgress(), levels });

describe('members skills: plans from the guide', () => {
  it('eight skills with guide codes and RuneLite level ids', () => {
    expect(membersSkills.map((s) => `${s.id}:${s.levelSkills.join()}`)).toEqual([
      'AG:agility', 'TH:thieving', 'SL:slayer', 'FA:farming', 'HE:herblore', 'HU:hunter', 'CN:construction', 'FL:fletching',
    ]);
    for (const s of membersSkills) {
      expect(s.membersOnly).toBe(true);
      expect(s.sections[s.plan.sectionIndex].title).toBe('Training plan');
      expect(s.intro.length).toBeGreaterThan(0);
    }
  });

  it('a plan row is found for any level 1–99', () => {
    for (const s of membersSkills) {
      for (let level = 1; level <= 99; level++) {
        const hit = rangeForLevel(s.plan.ranges, level)!;
        expect(hit.beyond, `${s.id} lvl ${level}`).toBe(false);
        expect(level >= hit.range.from && (hit.range.to === null || level < hit.range.to), `${s.id} lvl ${level}`).toBe(true);
      }
    }
  });

  it('a section is found by code and by level id: old #/skills/agility links do not break', () => {
    expect(findSkill('AG')?.name).toBe('Agility');
    expect(findSkill('agility')?.id).toBe('AG');
    expect(findSkill('slayer')?.id).toBe('SL');
    expect(findSkill('attack')?.id).toBe('ME');
    expect(findSkill('WC')?.id).toBe('WC');
    expect(findSkill('sailing')).toBeUndefined();
    expect(levelById.get('fletching')).toMatchObject({ skill: 'FL', name: 'Fletching', membersOnly: true });
  });

  it('free skills did not get mixed with members skills', () => {
    expect(skills).toHaveLength(12);
    expect(skills.some((s) => s.membersOnly)).toBe(false);
    expect(skillById.size).toBe(20);
  });

  it('route steps with agility and slayer show a plan row', () => {
    expect(stepSkills(stepById.get('S7-04')!).map((s) => s.id)).toEqual(['AG']);
    expect(stepSkills(stepById.get('S8-04')!).map((s) => s.id).sort()).toEqual(['CR', 'RA', 'SL']);
    const ag = skillById.get('AG')!;
    expect(skillRange(ag, progress({ agility: 1 }))?.range.code).toBe('AG-1');
    expect(skillRange(ag, progress({ agility: 25 }))?.range.code).toBe('AG-2');
    expect(skillRange(ag, progress({ agility: 99 }))?.range.code).toBe('AG-9');
    expect(skillRange(skillById.get('SL')!, progress({ slayer: 9 }))?.range.code).toBe('SL-1');
  });

  it('step codes in the plan texts exist', () => {
    const codes = [...new Set(JSON.stringify(membersGuide).match(/S\d-\d\d/g) ?? [])];
    expect(codes.length).toBeGreaterThan(5);
    for (const code of codes) expect(stepById.has(code), code).toBe(true);
  });

  it('search finds members plan rows in Members mode', () => {
    const typeLabel = { quest: 'Quest', skill: 'Skill', gear: 'Gear', prep: 'Preparation' };
    const members = buildIndex({ steps: stepsFor('members'), skills: [...skills, ...membersSkills], reference, plugins, items, typeLabel });
    expect(search(members, 'AG-4')[0].item.href).toBe('#/skills/AG');
    expect(search(members, 'Canifis Rooftop').some((h) => h.item.code === 'AG-4')).toBe(true);
    const f2p = buildIndex({ steps: stepsFor('f2p'), skills, reference, plugins, items, typeLabel });
    expect(search(f2p, 'AG-4').some((h) => h.item.href === '#/skills/AG')).toBe(false);
  });
});

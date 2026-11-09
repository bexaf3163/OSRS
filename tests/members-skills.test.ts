import { describe, expect, it } from 'vitest';
import { findSkill, levelById, membersGuide, membersSkills, skillById, skills, stepById } from '../src/data';

describe('members skills: data', () => {
  it('eight skills with guide codes and RuneLite level ids', () => {
    expect(membersSkills.map((s) => `${s.id}:${s.levelSkills.join()}`)).toEqual([
      'AG:agility', 'TH:thieving', 'SL:slayer', 'FA:farming', 'HE:herblore', 'HU:hunter', 'CN:construction', 'FL:fletching',
    ]);
    for (const s of membersSkills) {
      expect(s.membersOnly).toBe(true);
      expect(s.intro.length).toBeGreaterThan(0);
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

  it('step codes in the plan texts exist', () => {
    const codes = [...new Set(JSON.stringify(membersGuide).match(/S\d-\d\d/g) ?? [])];
    expect(codes.length).toBeGreaterThan(5);
    for (const code of codes) expect(stepById.has(code), code).toBe(true);
  });

});

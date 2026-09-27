import { describe, expect, it } from 'vitest';
import { findSkill, items, levelById, membersGuide, membersSkills, plugins, reference, skillById, skills, stepById, stepsFor } from '../src/data';
import { rangeForLevel, skillRange } from '../src/lib/ranges';
import { buildIndex, search } from '../src/lib/search';
import { stepSkills } from '../src/components/RangeHints';
import { emptyProgress } from '../src/lib/progress';

const progress = (levels: Record<string, number>) => ({ ...emptyProgress(), levels });

describe('навыки подписки: планы из гайда', () => {
  it('восемь навыков с кодами гайда и id уровней RuneLite', () => {
    expect(membersSkills.map((s) => `${s.id}:${s.levelSkills.join()}`)).toEqual([
      'AG:agility', 'TH:thieving', 'SL:slayer', 'FA:farming', 'HE:herblore', 'HU:hunter', 'CN:construction', 'FL:fletching',
    ]);
    for (const s of membersSkills) {
      expect(s.membersOnly).toBe(true);
      expect(s.sections[s.plan.sectionIndex].title).toBe('План прокачки');
      expect(s.intro.length).toBeGreaterThan(0);
    }
  });

  it('строка плана находится для любого уровня 1–99', () => {
    for (const s of membersSkills) {
      for (let level = 1; level <= 99; level++) {
        const hit = rangeForLevel(s.plan.ranges, level)!;
        expect(hit.beyond, `${s.id} ур. ${level}`).toBe(false);
        expect(level >= hit.range.from && (hit.range.to === null || level < hit.range.to), `${s.id} ур. ${level}`).toBe(true);
      }
    }
  });

  it('раздел ищется и по коду, и по id уровня: старые ссылки #/skills/agility не ломаются', () => {
    expect(findSkill('AG')?.name).toBe('Ловкость');
    expect(findSkill('agility')?.id).toBe('AG');
    expect(findSkill('slayer')?.id).toBe('SL');
    expect(findSkill('attack')?.id).toBe('ME');
    expect(findSkill('WC')?.id).toBe('WC');
    expect(findSkill('sailing')).toBeUndefined();
    expect(levelById.get('fletching')).toMatchObject({ skill: 'FL', name: 'Изготовление луков', membersOnly: true });
  });

  it('бесплатные навыки не смешались с навыками подписки', () => {
    expect(skills).toHaveLength(12);
    expect(skills.some((s) => s.membersOnly)).toBe(false);
    expect(skillById.size).toBe(20);
  });

  it('шаги маршрута с ловкостью и истреблением показывают строку плана', () => {
    expect(stepSkills(stepById.get('S7-04')!).map((s) => s.id)).toEqual(['AG']);
    expect(stepSkills(stepById.get('S8-04')!).map((s) => s.id).sort()).toEqual(['CR', 'RA', 'SL']);
    const ag = skillById.get('AG')!;
    expect(skillRange(ag, progress({ agility: 1 }))?.range.code).toBe('AG-1');
    expect(skillRange(ag, progress({ agility: 25 }))?.range.code).toBe('AG-2');
    expect(skillRange(ag, progress({ agility: 99 }))?.range.code).toBe('AG-9');
    expect(skillRange(skillById.get('SL')!, progress({ slayer: 9 }))?.range.code).toBe('SL-1');
  });

  it('коды шагов в тексте планов существуют', () => {
    const codes = [...new Set(JSON.stringify(membersGuide).match(/S\d-\d\d/g) ?? [])];
    expect(codes.length).toBeGreaterThan(5);
    for (const code of codes) expect(stepById.has(code), code).toBe(true);
  });

  it('поиск находит строки плана подписки в режиме Members', () => {
    const typeLabel = { quest: 'Квест', skill: 'Навык', gear: 'Снаряжение', prep: 'Подготовка' };
    const members = buildIndex({ steps: stepsFor('members'), skills: [...skills, ...membersSkills], reference, plugins, items, typeLabel });
    expect(search(members, 'AG-4')[0].item.href).toBe('#/skills/AG');
    expect(search(members, 'Canifis Rooftop').some((h) => h.item.code === 'AG-4')).toBe(true);
    const f2p = buildIndex({ steps: stepsFor('f2p'), skills, reference, plugins, items, typeLabel });
    expect(search(f2p, 'AG-4').some((h) => h.item.href === '#/skills/AG')).toBe(false);
  });
});

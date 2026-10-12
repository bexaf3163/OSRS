import { describe, expect, it } from 'vitest';
import { goals, skillById } from '../src/data';
import { trainingFocus } from '../src/lib/skillFocus';
import { defaultGuideMode } from '../src/lib/skillGuide';
import { guideFor } from '../src/data/skillGuideRegistry';
import { rangeForLevel } from '../src/lib/ranges';

const melee = skillById.get('ME')!;
const focus = (levels: Record<string, number>, stage: number, skill = melee) =>
  trainingFocus({
    levelSkills: skill.levelSkills, stage, goals,
    levelOf: (id) => levels[id] ?? 1,
    rowEnd: (_id, lv) => rangeForLevel(skill.plan.ranges, lv)?.range.to ?? null,
  });

describe('route-aware melee focus', () => {
  it('Attack 21, Strength 14, Defence 1 on stage 3: train a skill the route asks for, not Defence to 10', () => {
    const f = focus({ attack: 21, strength: 14, defence: 1 }, 3);
    expect(f.skill).not.toBe('defence');
    expect(f.source).toBe('route');
    expect(f).toMatchObject({ skill: 'attack', target: 30, stage: 3 });
  });

  it('the stage is satisfied: look ahead to the next goal instead of falling back to Defence 1 -> 10', () => {
    const f = focus({ attack: 30, strength: 25, defence: 1 }, 3);
    expect(f.source).toBe('ahead');
    expect(f).toMatchObject({ skill: 'attack', target: 40, stage: 4 });
  });

  it('Defence is trained when the route asks for it', () => {
    const f = focus({ attack: 40, strength: 36, defence: 1 }, 5);
    expect(f).toMatchObject({ skill: 'defence', target: 33, source: 'route' });
  });

  it('a single skill keeps its own goal, then its training row', () => {
    const wc = skillById.get('WC')!;
    const f = trainingFocus({
      levelSkills: wc.levelSkills, stage: 1, goals,
      levelOf: () => 99, rowEnd: () => null,
    });
    expect(f.source).toBe('generic');
  });
});

describe('roadmap default filter', () => {
  it('a free account opens on F2P Only; members and members-only skills open on Fastest', () => {
    const wc = guideFor('woodcutting');
    expect(wc.f2pCap).toBeGreaterThan(0);
    expect(defaultGuideMode(wc, 'f2p')).toBe('f2p');
    expect(defaultGuideMode(wc, 'members')).toBe('fast');
    expect(defaultGuideMode({ f2pCap: 0 }, 'f2p')).toBe('fast');
  });

  it('the default F2P path has no Members step', async () => {
    const { buildPath } = await import('../src/lib/skillGuide');
    const wc = guideFor('woodcutting');
    const path = buildPath(wc, defaultGuideMode(wc, 'f2p'));
    expect(path.length).toBeGreaterThan(0);
    expect(path.some((s) => s.members)).toBe(false);
  });
});

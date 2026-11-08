import { describe, expect, it } from 'vitest';
import { skillById } from '../../data';
import { trainingFocus } from './skillFocus';
import { defaultGuideMode } from './skillGuide';
import { guideFor } from '../../data/skillGuideRegistry';
import { rangeForLevel } from './ranges';

const melee = skillById.get('ME')!;
const focus = (levels: Record<string, number>, needs: Record<string, number>, skill = melee) =>
  trainingFocus({
    levelSkills: skill.levelSkills, goalOf: (id) => needs[id],
    levelOf: (id) => levels[id] ?? 1,
    rowEnd: (_id, lv) => rangeForLevel(skill.plan.ranges, lv)?.range.to ?? null,
  });

// The planner's Decision names the levels it needs (2.82.3); the old guide's stage goals no longer steer training.
describe('planner-aware melee focus', () => {
  it('Attack 21, Strength 14, Defence 1 and the planner needs Attack 30: train Attack, not Defence to 10', () => {
    const f = focus({ attack: 21, strength: 14, defence: 1 }, { attack: 30 });
    expect(f.skill).not.toBe('defence');
    expect(f).toMatchObject({ skill: 'attack', target: 30, source: 'planner' });
  });

  it('the planner needs nothing: the lagging skill and the end of its training row, labelled generic', () => {
    const f = focus({ attack: 30, strength: 25, defence: 1 }, {});
    expect(f).toMatchObject({ skill: 'defence', source: 'generic' });
    expect(f.target).toBeGreaterThan(1);
  });

  it('Defence is trained when the planner needs it, the biggest gap first', () => {
    const f = focus({ attack: 40, strength: 36, defence: 1 }, { attack: 41, defence: 33 });
    expect(f).toMatchObject({ skill: 'defence', target: 33, source: 'planner' });
  });

  it('a single skill keeps its own goal, then its training row', () => {
    const wc = skillById.get('WC')!;
    const f = trainingFocus({
      levelSkills: wc.levelSkills, goalOf: () => undefined, levelOf: () => 99, rowEnd: () => null,
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
    const { buildPath } = await import('./skillGuide');
    const wc = guideFor('woodcutting');
    const path = buildPath(wc, defaultGuideMode(wc, 'f2p'));
    expect(path.length).toBeGreaterThan(0);
    expect(path.some((s) => s.members)).toBe(false);
  });
});

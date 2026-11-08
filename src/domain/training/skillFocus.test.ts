import { describe, expect, it } from 'vitest';
import { skillById } from '../../data';
import { methodStop, trainingFocus } from './skillFocus';
import { adviseTraining } from './trainingRouter';
import { buildPlayerState } from '../player/playerState';
import { emptyProgress } from '../persistence/progress';

const engineAdvice = (skill: string, stats: Record<string, number>) => adviseTraining({
  skill, target: 99, mode: 'f2p', style: 'chill', untilChange: true,
  state: buildPlayerState({ mode: 'f2p', stats, progress: emptyProgress(), gear: null, questsDone: null, owned: null }),
});
const engineStop = (skill: string, stats: Record<string, number>) => methodStop(engineAdvice(skill, stats));

const melee = skillById.get('ME')!;
const focus = (levels: Record<string, number>, needs: Record<string, number>, skill = melee) =>
  trainingFocus({
    levelSkills: skill.levelSkills, goalOf: (id) => needs[id],
    levelOf: (id) => levels[id] ?? 1,
    stopOf: (id) => engineStop(id, levels),
  });

// The planner's Decision names the levels it needs (2.82.3); the old guide's stage goals no longer steer training.
describe('planner-aware melee focus', () => {
  it('Attack 21, Strength 14, Defence 1 and the planner needs Attack 30: train Attack, not Defence to 10', () => {
    const f = focus({ attack: 21, strength: 14, defence: 1 }, { attack: 30 });
    expect(f.skill).not.toBe('defence');
    expect(f).toMatchObject({ skill: 'attack', target: 30, source: 'planner' });
  });

  it('the planner needs nothing: the lagging skill up to the next method of the training engine, labelled generic', () => {
    const f = focus({ attack: 30, strength: 25, defence: 1 }, {});
    expect(f).toMatchObject({ skill: 'defence', source: 'generic' });
    expect(f.target).toBeGreaterThan(1);
  });

  it('Defence is trained when the planner needs it, the biggest gap first', () => {
    const f = focus({ attack: 40, strength: 36, defence: 1 }, { attack: 41, defence: 33 });
    expect(f).toMatchObject({ skill: 'defence', target: 33, source: 'planner' });
  });

  it('a single skill keeps its own goal, then the next level without an engine method', () => {
    const wc = skillById.get('WC')!;
    const f = trainingFocus({
      levelSkills: wc.levelSkills, goalOf: () => undefined, levelOf: () => 99,
    });
    expect(f.source).toBe('generic');
  });
});

describe('the training engine sets the goal without a planner need', () => {
  it('Woodcutting 1 trains to 15, where Oak trees take over; Smithing 1 to 15, where iron bars do', () => {
    expect(engineStop('woodcutting', { woodcutting: 1 })).toEqual({ level: 15, next: 'Oak trees' });
    expect(engineStop('smithing', { smithing: 1 })).toEqual({ level: 15, next: 'Make Iron bar' });
    // The advice itself runs to that goal: its path and target stop where Oak trees take over.
    const wc = engineAdvice('woodcutting', { woodcutting: 1 });
    expect(wc.target).toBe(15);
    expect(wc.path.at(-1)?.toLevel).toBe(15);
    expect(wc.path.every((l) => l.method.name === 'Regular trees')).toBe(true);
  });

  it('a method that stays best to 99 gives goal 99 with no next method', () => {
    expect(engineStop('prayer', { prayer: 1 })).toEqual({ level: 99, next: null });
  });

  it('the stop becomes the generic goal; a stop at or below the level falls back to the next level', () => {
    const at = (level: number, stop: { level: number; next: string | null }) =>
      trainingFocus({ levelSkills: ['woodcutting'], goalOf: () => undefined, levelOf: () => level, stopOf: () => stop });
    expect(at(1, { level: 15, next: 'Oak trees' })).toEqual({ skill: 'woodcutting', target: 15, source: 'generic', next: 'Oak trees' });
    expect(at(15, { level: 15, next: 'Oak trees' })).toEqual({ skill: 'woodcutting', target: 16, source: 'generic' });
  });
});


import { describe, expect, it } from 'vitest';
import { adviseTraining, trainingMethods } from '../src/lib/trainingRouter';
import { buildPlayerState } from '../src/lib/playerState';
import { emptyProgress } from '../src/lib/progress';

// The owner's report (2.74.20): the melee card kept "Chickens and cows" from 20 to 60 on the relaxed priority. A free skill's card must not pick a
// method the level has outgrown while a method made for that level is open. Magic keeps its strike kit on purpose (alchemy and splashing need a manual setup).
const KEEPS_OUTGROWN = new Set(['magic']);

describe('a free card never recommends a method the level has outgrown', () => {
  const skills = [...new Set(trainingMethods.filter((m) => !m.members).flatMap((m) => m.skills))].filter((s) => !KEEPS_OUTGROWN.has(s)).sort();
  it.each(skills)('%s', (skill) => {
    const wrong: string[] = [];
    for (let level = 5; level < 99; level += 5) for (const priority of ['balanced', 'fastest', 'relaxed'] as const) {
      const levels: Record<string, number> = { attack: 40, strength: 40, defence: 40, ranged: 40, magic: 40, smithing: 40, crafting: 40, [skill]: level };
      const state = buildPlayerState({ mode: 'f2p', stats: null, progress: { ...emptyProgress(), levels }, owned: null, gear: null, questsDone: null, player: null, connected: false });
      const m = adviseTraining({ skill, target: Math.min(99, level + 5), state, mode: 'f2p', style: 'chill', priority }).best?.method;
      // Earth runes at 14: the wiki's own rate beats fire runes there.
      if (m && m.to !== null && level >= m.to && m.id !== 'rc-earth') wrong.push(`${level} ${priority}: ${m.id} (${m.from}-${m.to})`);
    }
    expect(wrong).toEqual([]);
  });

  it('melee from 20 on the relaxed priority is giant frogs, not chickens and cows', () => {
    const state = buildPlayerState({ mode: 'f2p', stats: null, progress: { ...emptyProgress(), levels: { attack: 25 } }, owned: null, gear: null, questsDone: null, player: null, connected: false });
    expect(adviseTraining({ skill: 'attack', target: 30, state, mode: 'f2p', style: 'chill', priority: 'relaxed' }).best?.method.id).toBe('me-frog');
  });
});

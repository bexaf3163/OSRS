import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { adviseTraining } from '../src/domain/training/trainingRouter';
import { buildPlayerState } from '../src/domain/player/playerState';
import { emptyProgress } from '../src/domain/persistence/progress';
import { allLevelSkills } from '../src/data';
import { questCatalogue } from '../src/domain/planning/catalogue';
import { fakePrices } from './funding/helpers';

const prices = fakePrices(JSON.parse(readFileSync('tests/fixtures/gePrices.json', 'utf8')).prices);

// D'hide bodies (63) rank below the 4 shown Crafting methods at these prices, so the build's recipe check covers them.
describe('Members training methods from Wiki recipes', () => {
  it.each([['crafting', 46, 'cr-glass'], ['crafting', 54, 'cr-battlestaff'], ['smithing', 35, 'sm-cannonball'],
    ['cooking', 30, 'ck-karambwan'], ['cooking', 62, 'ck-members-fish'],
    ['runecraft', 30, 'rc-lava'], ['runecraft', 40, 'rc-gotr'], ['fishing', 40, 'fi-tempoross'], ['fishing', 50, 'fi-barb'], ['firemaking', 55, 'fm-wintertodt']] as const)('%s %i offers %s with a known rate', (skill, level, id) => {
    const stats = Object.fromEntries(allLevelSkills.map((s) => [s.id, s.id === skill ? level : 40]));
    const state = buildPlayerState({ mode: 'members', stats, progress: emptyProgress(), gear: null, questsDone: questCatalogue.map((q) => q.id), owned: null } as never);
    const a = adviseTraining({ skill, target: level + 5, state, mode: 'members', prices } as never);
    const offered = [a.best, ...a.others].find((m) => m?.method.id === id);
    expect(offered?.method.xph?.[0]).toBeGreaterThan(0);
  });
});

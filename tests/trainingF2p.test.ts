import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { adviseTraining, trainingMethods } from '../src/domain/training/trainingRouter';
import { buildPlayerState } from '../src/domain/player/playerState';
import { emptyProgress } from '../src/domain/persistence/progress';
import { allLevelSkills } from '../src/data';
import { PROCESSING } from '../src/domain/training/processingRates';
import { SKILLING } from '../src/domain/training/skillingRates';

const facts = JSON.parse(readFileSync('src/data/generated/itemFacts.json', 'utf8')).items as Record<string, { members: boolean }>;
const membersItem = (name: string) => facts[name]?.members === true;

describe('F2P training uses only free-to-play items (itemFacts.json, the Wiki prices API)', () => {
  it('no F2P method needs, processes, makes or gathers a members item', () => {
    const bad: string[] = [];
    for (const m of trainingMethods.filter((x) => !x.members)) {
      const needs = (m.needs ?? []).flatMap((n) => [('name' in n ? n.name : undefined) ?? [], ...(('anyOf' in n ? n.anyOf : undefined) ?? [])].flat());
      const recipes = (PROCESSING.methods[m.id] ?? []).map((id) => PROCESSING.recipes.find((r) => r.id === id)!).filter(Boolean)
        .filter((r) => !r.members).flatMap((r) => [...r.inputs.map((i) => i.name), ...(r.output ? [r.output.name] : [])]);
      const gathered = (SKILLING.methods[m.id] ?? []).flatMap((id) => SKILLING.resources.find((r) => r.id === id)?.products.map((p) => p.name) ?? []);
      for (const name of new Set([...needs, ...recipes, ...gathered])) if (membersItem(name)) bad.push(`${m.id}: ${name}`);
    }
    expect(bad).toEqual([]);
  });
});

describe('the F2P mode shows only F2P methods', () => {
  it('no F2P skill at any level is advised, offered or planned a members method', () => {
    const bad: string[] = [];
    for (const skill of ['attack', 'strength', 'defence', 'ranged', 'prayer', 'magic', 'cooking', 'woodcutting', 'fishing', 'firemaking', 'crafting', 'smithing', 'mining', 'runecraft']) {
      for (let level = 1; level < 99; level += 7) {
        const stats = Object.fromEntries(allLevelSkills.map((s) => [s.id, s.id === skill ? level : 40]));
        const state = buildPlayerState({ mode: 'f2p', stats, progress: emptyProgress(), gear: null, questsDone: null, owned: null } as never);
        const a = adviseTraining({ skill, target: Math.min(99, level + 20), state, mode: 'f2p' });
        for (const m of [a.best?.method, ...a.others.map((o) => o.method), ...a.path.map((l) => l.method)]) if (m?.members) bad.push(`${skill} ${level}: ${m.id}`);
      }
    }
    expect([...new Set(bad)]).toEqual([]);
  }, 60_000);
});

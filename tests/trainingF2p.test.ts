import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { trainingMethods } from '../src/domain/training/trainingRouter';
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

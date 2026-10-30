import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { allStages, allSteps } from '../src/data';
import { emptyProgress } from '../src/lib/progress';
import { SkillsPage } from '../src/pages/Skills';
import { SkillDetailPage } from '../src/pages/SkillDetail';
import { parseHash } from '../src/lib/router';

vi.mock('../src/store', () => ({ useStore: () => ({
  mode: 'f2p', stages: allStages.slice(0, 6), steps: allSteps,
  progress: { ...emptyProgress(), levels: { attack: 30, strength: 21, defence: 10 } },
}) }));
const bridge = vi.hoisted(() => ({ state: 'offline', stats: null as Record<string, number> | null, xp: null }));
vi.mock('../src/bridge', () => ({ useBridge: () => bridge }));
vi.mock('../src/lib/skillTrack', () => ({ useTracked: () => null }));
vi.mock('../src/components/SkillRoadmap', () => ({ RoadmapPane: () => null, useTrackedStep: () => null }));
vi.mock('../src/components/TrainingCard', () => ({ TrainingCard: ({ skill, target, view }: { skill: string; target: number; view?: string }) =>
  createElement('div', { 'data-training-skill': skill, 'data-target': target, 'data-view': view }) }));
vi.mock('../src/components/LevelInput', () => ({ LevelInput: () => null }));
vi.mock('../src/components/LiveXp', () => ({ LiveXp: () => null }));

describe('direct skill access without nested menus', () => {
  it('preparation links select the exact skill and target beyond its default checkpoint', () => {
    const route = parseHash('#/skills/ME/defence?goal=15');
    expect(route).toMatchObject({ page: 'skills', param: 'ME', skill: 'defence', goal: 15 });
    const html = renderToStaticMarkup(<SkillsPage param={route.param} selectedSkill={route.skill} goal={route.goal} />);
    expect(html).toContain('data-training-skill="defence" data-target="15"');
    expect(html).toContain('Goal 15');
    expect(html).not.toContain('Goal 10');
    expect(renderToStaticMarkup(<SkillDetailPage id="WC" selectedSkill="defence" requestedGoal={15} />)).not.toContain('Goal 15');
  });
  it.each(['1', '100', '-2', 'NaN', '10.5', 'Infinity', ''])('rejects an invalid preparation goal %s', goal => {
    expect(parseHash(`#/skills/MI/mining?goal=${goal}`).goal).toBeUndefined();
  });
  it.each([['PR', 'prayer'], ['RC', 'runecraft']])('does not turn %s into an arbitrary default grind; explicit goals remain available', (id, skill) => {
    const html = renderToStaticMarkup(<SkillDetailPage id={id} selectedSkill={skill} />);
    expect(html).toContain('Save dedicated training for membership');
    expect(html).not.toContain('data-training-skill=');
    expect(html).not.toContain('→ Goal');
    expect(renderToStaticMarkup(<SkillDetailPage id={id} selectedSkill={skill} requestedGoal={9} />)).toContain('data-target="9"');
  });
  it('does not mark an unread profile checkpoint reached from unadmitted live character stats', () => {
    bridge.state = 'online';
    bridge.stats = { cooking: 99 };
    try {
      const html = renderToStaticMarkup(<SkillsPage />);
      expect(html).not.toContain('68 reached');
    } finally {
      bridge.state = 'offline';
      bridge.stats = null;
    }
  });
  it('each melee skill has its own icon tile linking straight to that skill', () => {
    const html = renderToStaticMarkup(<SkillsPage />);
    for (const skill of ['attack', 'strength', 'defence']) {
      expect(html).toContain(`href="#/skills/ME/${skill}"`);
      expect(html).toContain(`skill-icons/${skill}.png`);
    }
    expect(html).not.toContain('href="#/skills/ME"');
    expect(html).not.toContain('Training guide</a>');
    expect(html).not.toContain('<details');
  });
  it('Defence stays selected even when the route would normally focus Attack or Strength', () => {
    const html = renderToStaticMarkup(<SkillDetailPage id="ME" selectedSkill="defence" />);
    expect(html).toContain('data-training-skill="defence"');
    expect(html).toContain('<h1>Defence');
    expect(html).toContain('data-view="summary"');
    expect(html).not.toContain('<details');
    expect(html).not.toContain('Levels and live experience');
    expect(html).not.toContain('Path steps with this skill');
  });
  it('invalid skill selections cannot switch to another guide or create an invented skill', () => {
    const html = renderToStaticMarkup(<SkillDetailPage id="WC" selectedSkill="defence" />);
    expect(html).toContain('data-training-skill="woodcutting"');
    expect(html).not.toContain('data-training-skill="defence"');
    expect(renderToStaticMarkup(<SkillDetailPage id="missing" selectedSkill="defence" />)).toContain('Skill not found');
  });
});

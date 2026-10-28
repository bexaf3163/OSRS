import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { allStages, allSteps } from '../src/data';
import { emptyProgress } from '../src/lib/progress';
import { SkillsPage } from '../src/pages/Skills';
import { SkillDetailPage } from '../src/pages/SkillDetail';

vi.mock('../src/store', () => ({ useStore: () => ({
  mode: 'f2p', stages: allStages.slice(0, 6), steps: allSteps,
  progress: { ...emptyProgress(), levels: { attack: 30, strength: 21, defence: 10 } },
}) }));
const bridge = vi.hoisted(() => ({ state: 'offline', stats: null as Record<string, number> | null, xp: null }));
vi.mock('../src/bridge', () => ({ useBridge: () => bridge }));
vi.mock('../src/lib/skillTrack', () => ({ useTracked: () => null }));
vi.mock('../src/components/SkillRoadmap', () => ({ RoadmapPane: () => null, useTrackedStep: () => null }));
vi.mock('../src/components/TrainingCard', () => ({ TrainingCard: ({ skill, target }: { skill: string; target: number }) =>
  createElement('div', { 'data-training-skill': skill, 'data-target': target }) }));
vi.mock('../src/components/LevelInput', () => ({ LevelInput: () => null }));
vi.mock('../src/components/LiveXp', () => ({ LiveXp: () => null }));

describe('direct skill access without nested menus', () => {
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
  });
  it('Defence stays selected even when the route would normally focus Attack or Strength', () => {
    const html = renderToStaticMarkup(<SkillDetailPage id="ME" selectedSkill="defence" />);
    expect(html).toContain('data-training-skill="defence"');
    expect(html).toContain('<h1>Defence');
    expect(html).not.toContain('<details open');
    expect(html).not.toContain(' open=""');
  });
  it('invalid skill selections cannot switch to another guide or create an invented skill', () => {
    const html = renderToStaticMarkup(<SkillDetailPage id="WC" selectedSkill="defence" />);
    expect(html).toContain('data-training-skill="woodcutting"');
    expect(html).not.toContain('data-training-skill="defence"');
    expect(renderToStaticMarkup(<SkillDetailPage id="missing" selectedSkill="defence" />)).toContain('Skill not found');
  });
});

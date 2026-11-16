import { describe, expect, it } from 'vitest';
import { emptyProgress } from '../persistence/progress';
import { questLevelNeeds, questNeedLabel, SKILL_TAB_ORDER } from './questLevelNeeds';

describe('the Members skill tiles', () => {
  it('list every skill once, in the in-game tab order', () => {
    expect(SKILL_TAB_ORDER).toHaveLength(23);
    expect(new Set(SKILL_TAB_ORDER).size).toBe(23);
  });

  it('name the highest level an open quest needs, and only Members accounts see Members quests', () => {
    const members = questLevelNeeds(emptyProgress(), true), free = questLevelNeeds(emptyProgress(), false);
    // Monkey Madness I needs Prayer 43; no free-to-play quest needs Agility.
    expect(members.get('prayer')).toBeGreaterThanOrEqual(43);
    expect(members.get('agility')).toBeGreaterThan(0);
    expect(free.get('agility')).toBeUndefined();
  });

  it('read like the free-to-play marks', () => {
    expect(questNeedLabel(undefined, 5)).toBe('· No quest needs it');
    expect(questNeedLabel(25, 10)).toBe('→ 25 for quests');
    expect(questNeedLabel(25, 30)).toBe('✓ 25 for quests');
  });
});

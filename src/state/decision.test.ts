import { describe, expect, it } from 'vitest';
import { objectiveTitle } from './decision';

describe('planner order titles', () => {
  it('names a training objective in words and keeps a quest name', () => {
    expect(objectiveTitle('training:ranged:40')).toBe('Train Ranged to 40');
    expect(objectiveTitle("Cook's Assistant")).toBe("Cook's Assistant");
  });
});

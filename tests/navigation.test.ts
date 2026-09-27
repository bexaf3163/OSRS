import { describe, expect, it } from 'vitest';
import { allSteps } from '../src/data';
import { navigationTarget } from '../src/lib/navigation';

const step = (id: string) => allSteps.find((s) => s.id === id)!;

describe('одна цель навигации: куда ведёт стрелка — то же на большой карте (§74)', () => {
  it('без временной цели — точка, которую получит плагин (inGame.worldPoint или карта шага)', () => {
    const s = step('S1-05');
    expect(navigationTarget(s)).toMatchObject({ x: s.inGame!.worldPoint!.x, y: s.inGame!.worldPoint!.y, source: 'step' });
  });

  it('выбран быстрый вариант — его точка', () => {
    const s = step('S2-05');
    const branch = s.branches!.find((b) => b.id === 'varrock-teleport')!;
    expect(navigationTarget(s, { branch })).toMatchObject({ x: branch.replacementTarget!.x, y: branch.replacementTarget!.y, source: 'branch' });
  });

  it('временная цель этого шага главнее; чужого шага — нет', () => {
    const s = step('S2-05');
    const nav = { label: 'Draynor Bank: взять Knife', x: 3092, y: 3243, plane: 0, itemName: 'Knife', stepId: 'S2-05' };
    expect(navigationTarget(s, { navTarget: nav })).toMatchObject({ x: 3092, source: 'shop', label: nav.label });
    expect(navigationTarget(s, { navTarget: { ...nav, stepId: 'S1-01' } })?.source).toBe('step');
    // Цель без шага (место из досье) — у шага, который сейчас показан в игре.
    const place = { label: 'Lumbridge Swamp', x: 3200, y: 3170, plane: 0 };
    expect(navigationTarget(s, { navTarget: place, activeStepId: 'S2-05' })).toMatchObject({ source: 'wiki', x: 3200 });
    expect(navigationTarget(s, { navTarget: place, activeStepId: 'S1-01' })?.source).toBe('step');
  });
});

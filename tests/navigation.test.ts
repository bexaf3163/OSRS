import { describe, expect, it } from 'vitest';
import { allSteps } from '../src/data';
import { navigationTarget } from '../src/lib/navigation';

const step = (id: string) => allSteps.find((s) => s.id === id)!;

describe('one navigation target: where the arrow leads — the same on the big map (§74)', () => {
  it('without a temporary target — the point the plugin will get (inGame.worldPoint or the step map)', () => {
    const s = step('S1-05');
    expect(navigationTarget(s)).toMatchObject({ x: s.inGame!.worldPoint!.x, y: s.inGame!.worldPoint!.y, source: 'step' });
  });

  it('the quick option is chosen — its point', () => {
    const s = step('S2-05');
    const branch = s.branches!.find((b) => b.id === 'varrock-teleport')!;
    expect(navigationTarget(s, { branch })).toMatchObject({ x: branch.replacementTarget!.x, y: branch.replacementTarget!.y, source: 'branch' });
  });

  it('the temporary target of this step wins; another step\'s does not', () => {
    const s = step('S2-05');
    const nav = { label: 'Draynor Bank: take Knife', x: 3092, y: 3243, plane: 0, itemName: 'Knife', stepId: 'S2-05' };
    expect(navigationTarget(s, { navTarget: nav })).toMatchObject({ x: 3092, source: 'shop', label: nav.label });
    expect(navigationTarget(s, { navTarget: { ...nav, stepId: 'S1-01' } })?.source).toBe('step');
    // A target without a step (a place from the dossier) — belongs to the step currently shown in the game.
    const place = { label: 'Lumbridge Swamp', x: 3200, y: 3170, plane: 0 };
    expect(navigationTarget(s, { navTarget: place, activeStepId: 'S2-05' })).toMatchObject({ source: 'wiki', x: 3200 });
    expect(navigationTarget(s, { navTarget: place, activeStepId: 'S1-01' })?.source).toBe('step');
  });
});

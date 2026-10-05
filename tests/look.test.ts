import { describe, expect, it } from 'vitest';
import { applyLook, applySolid, parseLook } from '../src/lib/look';

describe('look', () => {
  it('anything but an explicit "classic" is glass', () => {
    expect(parseLook('classic')).toBe('classic');
    expect(parseLook('glass')).toBe('glass');
    for (const bad of [null, undefined, '', 'GLASS', 'dark', 7, {}]) expect(parseLook(bad)).toBe('glass');
  });

  it('applyLook sets and clears the attribute without needing storage', () => {
    const root = { dataset: {} as Record<string, string | undefined> };
    applyLook('classic', root);
    expect(root.dataset.look).toBe('classic');
    applyLook('glass', root);
    expect('look' in root.dataset).toBe(false);
  });

  it('applySolid sets and clears the attribute', () => {
    const root = { dataset: {} as Record<string, string | undefined> };
    applySolid(true, root);
    expect(root.dataset.solid).toBe('1');
    applySolid(false, root);
    expect('solid' in root.dataset).toBe(false);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { emptyProgress, saveProgress } from '../src/lib/progress';
import { persistProgress } from '../src/lib/persistProgress';

const p = emptyProgress();
const broken = { setItem() { throw new Error('quota'); } };
const good = () => ({ setItem: vi.fn() });

describe('confirmed progress writes', () => {
  it('does not call absent browser storage a successful save', () => {
    expect(saveProgress(undefined, p)).toBe(false);
  });
  it('waits for the desktop write and warns when only the browser copy succeeds', async () => {
    let finish!: (r: { ok: boolean; error: string | null }) => void;
    const checked = vi.fn(() => new Promise<{ ok: boolean; error: string | null }>(resolve => { finish = resolve; }));
    const legacy = vi.fn();
    const local = good();
    const saving = persistProgress(p, local, 'profile-key', { saveProgressFile: legacy, saveProgressFileChecked: checked }, 'second');
    expect(local.setItem).toHaveBeenCalledWith('profile-key', JSON.stringify(p));
    expect(checked).toHaveBeenCalledWith(JSON.stringify(p), 'second');
    expect(legacy).not.toHaveBeenCalled();
    finish({ ok: false, error: 'ENOSPC' });
    expect(await saving).toContain('desktop file could not be written');
  });
  it('still saves the file when browser storage fails, and reports complete failure honestly', async () => {
    const checked = vi.fn(async () => ({ ok: true, error: null }));
    expect(await persistProgress(p, broken, 'key', { saveProgressFile: vi.fn(), saveProgressFileChecked: checked }, 'main')).toContain('saved to its desktop file');
    expect(checked).toHaveBeenCalledTimes(1);
    expect(await persistProgress(p, broken, 'key', { saveProgressFile() { throw new Error('IPC closed'); } }, 'main')).toContain('Changes are in memory');
    expect(await persistProgress(p, undefined, 'key', undefined, 'main')).toContain('Changes are in memory');
  });
  it('keeps legacy desktop compatibility without claiming an unconfirmed file saved the only copy', async () => {
    const legacy = vi.fn();
    expect(await persistProgress(p, good(), 'key', { saveProgressFile: legacy }, 'main')).toBeNull();
    expect(await persistProgress(p, broken, 'key', { saveProgressFile: legacy }, 'main')).toContain('confirmed persistent copy');
  });
  it('a successful retry clears the write warning', async () => {
    expect(await persistProgress(p, good(), 'key', { saveProgressFile: vi.fn(), saveProgressFileChecked: async () => ({ ok: true, error: null }) }, 'main')).toBeNull();
  });
});

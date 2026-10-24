// replace() resumes saving over preserved damaged sources, so only an explicit import may call it. Account Sync's "Mark as done" did,
// and with both saved copies damaged one click wrote a near-empty save over the native file (packaged E2E, PR 45).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? sources(p) : /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe('the save guard: who may call replace()', () => {
  it('only the Settings import and the store itself (reset)', () => {
    const callers = sources('src').filter((f) => /(^|[^.\w])replace\(/.test(readFileSync(f, 'utf8'))).map((f) => f.replace(/\\/g, '/'));
    expect(callers.sort()).toEqual(['src/pages/Settings.tsx', 'src/store.tsx']);
  });

  it('Account Sync marks through markSteps, which leaves a paused save paused', () => {
    const sync = readFileSync('src/components/AccountSync.tsx', 'utf8');
    expect(sync).toMatch(/markSteps\(p, /);
    const store = readFileSync('src/store.tsx', 'utf8');
    const mark = store.slice(store.indexOf('const markSteps'), store.indexOf('const replace'));
    expect(mark).not.toMatch(/canPersist|setPersistenceWarning/);
  });
});

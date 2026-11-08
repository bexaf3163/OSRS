import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

describe('single maintained project handoff', () => {
  it('keeps agent entry points as small pointers to the same contract', () => {
    for (const path of ['AGENTS.md', 'CLAUDE.md']) {
      expect(read(path)).toContain('(PROJECT_HANDOFF.md)');
      expect(read(path).length).toBeLessThan(1000);
    }
    const handoff = read('PROJECT_HANDOFF.md');
    for (const heading of ['Documentation policy', 'Engineering and operating contract', 'How the system is connected', 'Remaining work', 'Consolidated live regression matrix']) expect(handoff).toContain(heading);
    expect(handoff).toContain('Binding on Claude Code, Codex');
    expect(handoff).toContain('<!-- DELIVERY_START -->');
    expect(handoff).toContain('<!-- DELIVERY_END -->');
  });
  it('does not recreate parallel session/handoff/checkpoint documents', () => {
    const old = /(?:HANDOFF|TAKEOVER|NEXT_SESSION|IN_GAME_ACCEPTANCE|SESSION_HISTORY|CHECKPOINT|AUDIT_PREVIEW|LIVE_REVIEW|UI_CLEANUP_REVIEW)/i;
    const docs = readdirSync(new URL('docs/', root)).filter(name => name.endsWith('.md'));
    expect(docs.filter(name => old.test(name))).toEqual([]);
    for (const name of ['PROJECT_MAP.md', 'CAPABILITIES_MAP.md', 'PROJECT_GUIDELINES.md', 'REDESIGN_VERIFICATION.md']) expect(existsSync(new URL(name, root))).toBe(false);
    expect(existsSync(new URL('THIRD_PARTY_NOTICES.md', root))).toBe(true);
    expect(existsSync(new URL('index.html', root))).toBe(true);
  });
  it('publishes one handoff document, with generated version/source/hash context', () => {
    const workflow = read('.github/workflows/checks.yml');
    const attached = workflow.slice(workflow.indexOf('          files: |')).match(/release\/[^\s]+\.md/g);
    expect(attached).toEqual(['release/PROJECT_HANDOFF.md']);
    expect(workflow).toContain('Get-Content -LiteralPath PROJECT_HANDOFF.md');
    expect(workflow).toContain('$env:GITHUB_SHA');
    expect(workflow).toContain('SHA256:');
  });

  it('S20: a release waits for every gate job, and each job still runs its gates', () => {
    const workflow = read('.github/workflows/checks.yml');
    // One job: from its two-space header to the next one.
    const job = (name: string) => {
      const start = workflow.indexOf(`\n  ${name}:`);
      if (start < 0) return '';
      const rest = workflow.slice(start + 1), end = rest.slice(1).search(/\n {2}[a-z-]+:/);
      return end < 0 ? rest : rest.slice(0, end + 1);
    };
    expect(job('release')).toMatch(/needs: \[checks, runelite-bridge, portable\]/);
    for (const gate of ['check-data', 'check-structure', 'knip', 'dead-css', 'npm test', 'npm run build', 'test:ui']) expect(job('checks'), gate).toContain(gate);
    expect(job('runelite-bridge')).toMatch(/gradlew[^\n]* test/);
    for (const gate of ['dist:win', 'test:e2e', 'test-portable.ps1']) expect(job('portable'), gate).toContain(gate);
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The Clear Path palette: the text pairs of DESIGN_SYSTEM.md must hold in both themes, and control edges must stay visible.
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {\n`);
  if (start < 0) throw new Error(`no block ${selector}`);
  const body = css.slice(start, css.indexOf('\n}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/g)) out[m[1]] = m[2];
  return out;
}

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const themes = { light: block(':root'), dark: block(':root[data-theme="dark"]') };

describe.each(Object.entries(themes))('%s theme tokens', (_name, t) => {
  it('normal text reaches 4.5:1 on the panel and the page', () => {
    for (const fg of ['text', 'muted', 'accent-ink', 'done', 'warn', 'danger', 'gold-ink', 'members']) {
      for (const bg of ['surface', 'bg']) {
        expect(ratio(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('the primary button text reaches 4.5:1 on its fill', () => {
    expect(ratio(t['on-accent'], t.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it('the edge of a control reaches 3:1 on the panel', () => {
    expect(ratio(t['border-strong'], t.surface)).toBeGreaterThanOrEqual(3);
    expect(ratio(t.focus, t.surface)).toBeGreaterThanOrEqual(3);
  });

  it('state text stays readable on its soft fill', () => {
    for (const [fg, bg] of [['done', 'done-soft'], ['warn', 'warn-soft'], ['danger', 'danger-soft'], ['accent-ink', 'accent-soft'], ['members', 'members-soft']] as const) {
      expect(ratio(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('the documented values', () => {
  it('dark base values match the design system', () => {
    expect(themes.dark).toMatchObject({ bg: '#11151c', surface: '#1b222d', text: '#e7edf5', muted: '#abb8c9', accent: '#a8cbff', done: '#90d5a4' });
  });
});

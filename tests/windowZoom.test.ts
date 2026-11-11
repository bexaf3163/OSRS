// The desktop window scales the Ledger with its size (electron/window-zoom.cjs): the design size up to 1300 x 800, then the tighter of
// width and height, so the layout never drops below its design size, capped at 1.75.
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const { zoomFor } = createRequire(import.meta.url)('../electron/window-zoom.cjs') as { zoomFor: (w: number, h: number) => number };

describe('window zoom', () => {
  it('keeps the design size in small and narrow windows', () => {
    expect(zoomFor(1280, 860)).toBe(1);
    expect(zoomFor(380, 600)).toBe(1);
    expect(zoomFor(1300, 800)).toBe(1);
  });
  it('grows with the window, by the tighter side, so the CSS layout stays at least 1300 x 800', () => {
    expect(zoomFor(1680, 1040)).toBe(1.29);
    expect(zoomFor(1920, 1040)).toBe(1.3);
    for (const [w, h] of [[1680, 1040], [1920, 1040], [2560, 1400], [1600, 900]]) {
      const f = zoomFor(w, h);
      expect(w / f).toBeGreaterThanOrEqual(1300 - 10);
      expect(h / f).toBeGreaterThanOrEqual(800 - 10);
    }
  });
  it('stops at 1.75 and never shrinks the page', () => {
    expect(zoomFor(5120, 2880)).toBe(1.75);
    expect(zoomFor(0, 0)).toBe(1);
    expect(zoomFor(Number.NaN, 900)).toBe(1);
  });
});

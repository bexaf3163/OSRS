// The font size (everywhere) and the interface scale (in the desktop app).
// The font size changes the root font-size: all fonts are set in rem and the layout is not, so
// large text does not inflate the whole interface. The interface scale in the desktop app is driven by the Electron main process
// (zoomFactor) — it also adapts to the window width, and media queries stay honest.

export const TEXT_STEPS = [0.9, 1, 1.1, 1.2, 1.35, 1.5];
export const ZOOM_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

export const TEXT_KEY = 'osrs-put:text-scale';
/** An event on window after the font size changes. */
export const TEXT_EVENT = 'osrs-text-scale';

/** The nearest step toward dir; a value between steps snaps to the neighbouring one. */
export function stepScale(steps: number[], current: number, dir: -1 | 1): number {
  if (dir > 0) return steps.find((s) => s > current + 0.001) ?? steps[steps.length - 1];
  return [...steps].reverse().find((s) => s < current - 0.001) ?? steps[0];
}

export function clampScale(steps: number[], value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(steps[steps.length - 1], Math.max(steps[0], n));
}

export function percent(scale: number): string {
  return `${Math.round(scale * 100)}%`;
}

export function loadTextScale(): number {
  try {
    const v = localStorage.getItem(TEXT_KEY);
    if (v) return clampScale(TEXT_STEPS, Number(v));
  } catch {
    // Storage is unavailable: the normal size.
  }
  return 1;
}

export function applyTextScale(scale: number): void {
  document.documentElement.style.setProperty('--text-scale', String(scale));
  try {
    if (scale === 1) localStorage.removeItem(TEXT_KEY);
    else localStorage.setItem(TEXT_KEY, String(scale));
  } catch {
    // It will not be remembered between launches, but it is already applied.
  }
  window.dispatchEvent(new Event(TEXT_EVENT));
}

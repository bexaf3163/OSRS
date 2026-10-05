// The look of the panels: "glass" (frosted, rounder, a soft glow for the status) or "classic" (the flat look of the earlier versions).
// "Solid panels" turns the blur off for weak graphics. Both are only CSS switches on <html>: no data and no screen changes.
// The early choice before the first render is in index.html (same keys), so there is no flicker.

export type Look = 'glass' | 'classic';

const LOOK_KEY = 'osrs-put:look';
const SOLID_KEY = 'osrs-put:solid';

/** Anything but an explicit "classic" is the glass look — a damaged value must not strand the player on a blank page. */
export function parseLook(raw: unknown): Look {
  return raw === 'classic' ? 'classic' : 'glass';
}

export function loadLook(): Look {
  try {
    return parseLook(localStorage.getItem(LOOK_KEY));
  } catch {
    return 'glass';
  }
}

export function loadSolid(): boolean {
  try {
    return localStorage.getItem(SOLID_KEY) === '1';
  } catch {
    return false;
  }
}

type Root = { dataset: Record<string, string | undefined> };

export function applyLook(look: Look, root: Root = document.documentElement): void {
  if (look === 'classic') root.dataset.look = 'classic';
  else delete root.dataset.look;
  try {
    if (look === 'classic') localStorage.setItem(LOOK_KEY, 'classic');
    else localStorage.removeItem(LOOK_KEY);
  } catch {
    // It will not be saved between launches, but the look is already applied.
  }
}

export function applySolid(on: boolean, root: Root = document.documentElement): void {
  if (on) root.dataset.solid = '1';
  else delete root.dataset.solid;
  try {
    if (on) localStorage.setItem(SOLID_KEY, '1');
    else localStorage.removeItem(SOLID_KEY);
  } catch {
    // Same as above.
  }
}

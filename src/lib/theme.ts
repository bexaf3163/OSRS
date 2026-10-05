// The theme: light, dark or as in the system. The early choice before rendering is in index.html.

export type Theme = 'light' | 'dark' | 'system';
const KEY = 'osrs-put:theme';

export function loadTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    if (t === 'light' || t === 'dark') return t;
  } catch {
    // Storage is unavailable: take the system one.
  }
  return 'system';
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    if (theme === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // It will not be saved between launches, but the theme is already applied.
  }
}

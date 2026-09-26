// Тема: светлая, тёмная или как в системе. Ранний выбор до отрисовки — в index.html.

export type Theme = 'light' | 'dark' | 'system';
const KEY = 'osrs-put:theme';

export function loadTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    if (t === 'light' || t === 'dark') return t;
  } catch {
    // Хранилище недоступно — берём системную.
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
    // Не сохранится между запусками, но тема уже применена.
  }
}

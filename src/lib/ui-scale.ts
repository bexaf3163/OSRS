// Размер шрифта (везде) и масштаб интерфейса (в программе для ПК).
// Размер шрифта меняет корневой font-size: все шрифты заданы в rem, а раскладка — нет, поэтому
// крупный текст не раздувает весь интерфейс. Масштаб интерфейса в программе для ПК ведёт главный процесс
// Electron (zoomFactor) — там же подстройка под ширину окна, и медиазапросы остаются честными.

export const TEXT_STEPS = [0.9, 1, 1.1, 1.2, 1.35, 1.5];
export const ZOOM_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

export const TEXT_KEY = 'osrs-put:text-scale';
/** Событие на window после смены размера шрифта. */
export const TEXT_EVENT = 'osrs-text-scale';

/** Ближайший шаг в сторону dir; значение между шагами прилипает к соседнему. */
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
    // Хранилище недоступно — обычный размер.
  }
  return 1;
}

export function applyTextScale(scale: number): void {
  document.documentElement.style.setProperty('--text-scale', String(scale));
  try {
    if (scale === 1) localStorage.removeItem(TEXT_KEY);
    else localStorage.setItem(TEXT_KEY, String(scale));
  } catch {
    // Не запомнится между запусками, но уже применено.
  }
  window.dispatchEvent(new Event(TEXT_EVENT));
}

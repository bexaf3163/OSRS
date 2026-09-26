// Короткая вспышка «выполнено» на строке шага — когда отметку поставила игра, а не клик.

const FLASH_MS = 1600;

export function flashDone(elementId: string): void {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.classList.remove('is-just-done');
  // Перезапуск анимации, если шаг вспыхивает второй раз подряд.
  void el.offsetWidth;
  el.classList.add('is-just-done');
  window.setTimeout(() => el.classList.remove('is-just-done'), FLASH_MS);
}

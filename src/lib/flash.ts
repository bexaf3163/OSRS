// A short "done" flash on a step row: when the mark was set by the game, not a click.

const FLASH_MS = 1600;

export function flashDone(elementId: string): void {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.classList.remove('is-just-done');
  // Restarting the animation if a step flashes a second time in a row.
  void el.offsetWidth;
  el.classList.add('is-just-done');
  window.setTimeout(() => el.classList.remove('is-just-done'), FLASH_MS);
}

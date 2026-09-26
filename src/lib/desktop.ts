// Мост к программе для ПК (electron/preload.cjs). В браузере его нет — всё работает и без него.

export interface ZoomState {
  /** Масштаб, выбранный вручную. */
  zoom: number;
  /** Подстраивать масштаб под ширину окна. */
  autoZoom: boolean;
  /** Итоговый масштаб сейчас: ручной × подстройка под окно. */
  effective: number;
  /** Окно поверх всех окон. */
  alwaysOnTop: boolean;
}

export interface DesktopBridge {
  getZoom(): Promise<ZoomState>;
  setZoom(settings: { zoom: number; autoZoom: boolean }): void;
  setAlwaysOnTop(on: boolean): void;
  onZoom(callback: (state: ZoomState) => void): () => void;
  /** Прогресс файлом рядом с данными программы (в переносной версии — рядом с exe). */
  loadProgressFile(): string | null;
  saveProgressFile(json: string): void;
  /** Где лежат данные программы — для подсказки в настройках. */
  dataDir(): string;
  isPortable(): boolean;
}

export function desktop(): DesktopBridge | undefined {
  return (window as Window & { osrsDesktop?: DesktopBridge }).osrsDesktop;
}

export const isDesktop = () => typeof location !== 'undefined' && location.protocol === 'file:';

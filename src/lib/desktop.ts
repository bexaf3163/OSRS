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

export interface RuneliteCheck {
  ok: boolean;
  problems: string[];
  clientVersion: string | null;
  /** Сохранена ли сессия Jagex Account (~/.runelite/credentials.properties). */
  credentials: boolean;
}

export interface RuneliteLaunch {
  ok: boolean;
  /** started — запущен сейчас, starting — уже запускается, running — мост уже отвечает, missing/failed — не вышло. */
  state: 'started' | 'starting' | 'running' | 'missing' | 'failed';
  problems?: string[];
  clientVersion?: string;
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
  /** Запуск RuneLite с плагином OSRS Path Bridge из установленного RuneLite. */
  runelite?: {
    check(): Promise<RuneliteCheck>;
    launch(): Promise<RuneliteLaunch>;
  };
  /** Мост к плагину RuneLite через главный процесс (src/services/runeliteBridge.ts). В старых сборках его нет. */
  bridge?: {
    request(method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data?: unknown }>;
    openEvents(onEvent: (data: string) => void, onState: (state: 'open' | 'closed') => void): () => void;
  };
}

export function desktop(): DesktopBridge | undefined {
  return (window as Window & { osrsDesktop?: DesktopBridge }).osrsDesktop;
}

export const isDesktop = () => typeof location !== 'undefined' && location.protocol === 'file:';

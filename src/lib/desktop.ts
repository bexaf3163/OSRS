// Мост к программе для ПК (electron/preload.cjs). Без него (страница при разработке) всё работает, только без RuneLite и файла прогресса.

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

export interface BackupState {
  /** Папка для копий или null — копии выключены. */
  dir: string | null;
  /** Когда сделана последняя копия (ISO) или null. */
  last: string | null;
  /** Чем кончилась последняя попытка: ok, ошибка или null. */
  error: string | null;
}

export interface UpdateState {
  /** idle — не проверяли, checking, current — свежая, available — есть новая, downloading, ready — скачана, error. */
  state: 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'ready' | 'error';
  current: string;
  latest: string | null;
  /** Первая строка описания выпуска. */
  notes: string;
  /** Доля скачанного, 0–1. */
  progress: number;
  error: string | null;
  /** Можно ли поставить обновление: только переносная версия (exe). Иначе программа лишь сообщает о новой. */
  canInstall: boolean;
  /** Проверять в фоне при запуске и раз в несколько часов. */
  auto?: boolean;
}

export interface DesktopBridge {
  getZoom(): Promise<ZoomState>;
  setZoom(settings: { zoom: number; autoZoom: boolean }): void;
  setAlwaysOnTop(on: boolean): void;
  onZoom(callback: (state: ZoomState) => void): () => void;
  /** Прогресс файлом рядом с данными программы (в переносной версии — рядом с exe). */
  loadProgressFile(profileId?: string): string | null;
  saveProgressFile(json: string, profileId?: string): void;
  /** Копия прогресса по расписанию (раз в сутки в выбранную папку). В старых сборках её нет. */
  backup?: {
    get(): Promise<BackupState>;
    choose(): Promise<BackupState>;
    now(): Promise<BackupState>;
    clear(): Promise<BackupState>;
  };
  /** Где лежат данные программы — для подсказки в настройках. */
  dataDir(): string;
  isPortable(): boolean;
  /** Автообновление переносной версии. В старых сборках его нет. */
  updates?: {
    get(): Promise<UpdateState>;
    check(): Promise<UpdateState>;
    download(): Promise<UpdateState>;
    install(): Promise<boolean>;
    setAuto(on: boolean): void;
    onState(callback: (state: UpdateState) => void): () => void;
  };
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


// The bridge to the desktop app (electron/preload.cjs). Without it (the page during development) everything works, only without RuneLite and the progress file.

export interface ZoomState {
  /** The scale chosen manually. */
  zoom: number;
  /** Fit the scale to the window width. */
  autoZoom: boolean;
  /** The resulting scale now: manual x fit to the window. */
  effective: number;
  /** The window is on top of all other windows. */
  alwaysOnTop: boolean;
}

export interface RuneliteCheck {
  ok: boolean;
  problems: string[];
  clientVersion: string | null;
  /** Whether a Jagex Account session is saved (~/.runelite/credentials.properties). */
  credentials: boolean;
}

export interface RuneliteLaunch {
  ok: boolean;
  /** started means launched now, starting means already launching, running means the bridge already answers, missing/failed mean it did not work. */
  state: 'started' | 'starting' | 'running' | 'missing' | 'failed';
  problems?: string[];
  clientVersion?: string;
}

export interface BackupState {
  /** The folder for copies, or null if copies are off. */
  dir: string | null;
  /** When the last copy was made (ISO), or null. */
  last: string | null;
  /** How the last attempt ended: ok, an error, or null. */
  error: string | null;
}

export interface UpdateState {
  /** idle means not checked, checking, current means fresh, available means there is a new one, downloading, ready means downloaded, error. */
  state: 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'ready' | 'error';
  current: string;
  latest: string | null;
  /** The first line of the release description. */
  notes: string;
  /** The share downloaded, 0-1. */
  progress: number;
  error: string | null;
  /** Whether the update can be installed: only the portable version (exe). Otherwise the app only reports a new one. */
  canInstall: boolean;
  /** Check in the background at launch and every few hours. */
  auto?: boolean;
}

export interface DesktopBridge {
  getZoom(): Promise<ZoomState>;
  setZoom(settings: { zoom: number; autoZoom: boolean }): void;
  setAlwaysOnTop(on: boolean): void;
  onZoom(callback: (state: ZoomState) => void): () => void;
  /** Progress as a file next to the app's data (in the portable version, next to the exe). */
  loadProgressFile(profileId?: string): string | null;
  saveProgressFile(json: string, profileId?: string): void;
  /** A scheduled copy of progress (once a day into the chosen folder). Older builds do not have it. */
  backup?: {
    get(): Promise<BackupState>;
    choose(): Promise<BackupState>;
    now(): Promise<BackupState>;
    clear(): Promise<BackupState>;
  };
  /** Where the app's data lives: for a hint in the settings. */
  dataDir(): string;
  isPortable(): boolean;
  /** Auto-update of the portable version. Older builds do not have it. */
  updates?: {
    get(): Promise<UpdateState>;
    check(): Promise<UpdateState>;
    download(): Promise<UpdateState>;
    install(): Promise<boolean>;
    setAuto(on: boolean): void;
    onState(callback: (state: UpdateState) => void): () => void;
  };
  /** Launching RuneLite with the OSRS Path Bridge plugin from the installed RuneLite. */
  runelite?: {
    check(): Promise<RuneliteCheck>;
    launch(): Promise<RuneliteLaunch>;
  };
  /** The bridge to the RuneLite plugin through the main process (src/services/runeliteBridge.ts). Older builds do not have it. */
  bridge?: {
    request(method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data?: unknown }>;
    openEvents(onEvent: (data: string) => void, onState: (state: 'open' | 'closed') => void): () => void;
  };
}

export function desktop(): DesktopBridge | undefined {
  return (window as Window & { osrsDesktop?: DesktopBridge }).osrsDesktop;
}


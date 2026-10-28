// The desktop shell of OSRS Path: the same app from dist/ in a separate window.
// The data is in the app folder (%APPDATA%\OSRS Path), and for the portable version — next to the exe (OSRS-Put-data).
// Copies of the progress also go to %APPDATA%\OSRS Path\progress-copies, so the exe and its data folder can be deleted safely.
// The progress is stored twice: in the window's localStorage and as the file progress.json — the file survives a storage reset.

const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { registerBridge } = require('./runelite-bridge.cjs');
const { createLauncher } = require('./runelite-launcher.cjs');
const { createUpdater } = require('./updater.cjs');
const { backupProgress, dailyBackup, latestCopy, createProgressGuard, restoreFromCopies } = require('./progress-files.cjs');
const { atomicWrite } = require('./atomic-write.cjs');
const { createProgressWriter } = require('./progress-writer.cjs');

// End-to-end checks use an empty home, never the player's profiles or backup folder: the source tree in development, and a packaged release
// candidate (E2E_EXE=... npm run test:e2e). The variable only ever moves the data away from the player's, never toward it.
const isE2E = Boolean(process.env.OSRS_PUT_E2E_ROOT);
if (isE2E) {
  const testRoot = path.resolve(process.env.OSRS_PUT_E2E_ROOT);
  for (const [key, dir] of [['home', testRoot], ['appData', path.join(testRoot, 'appdata')], ['userData', path.join(testRoot, 'profile')]]) {
    fs.mkdirSync(dir, { recursive: true });
    app.setPath(key, dir);
  }
}

const DIST = path.join(__dirname, '..', 'dist');
const isWeb = (url) => /^https?:\/\//i.test(url);

// --- The portable version: everything is next to the exe, so the app can be carried on a flash drive. ---
const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
let freshData = false;
if (portableDir) {
  const installedData = app.getPath('userData');
  const dataDir = path.join(portableDir, 'OSRS-Put-data');
  // The first launch of the portable version after the regular one — we take the progress along.
  if (!fs.existsSync(dataDir)) {
    freshData = true;
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      for (const name of ['Local Storage', 'progress.json', 'window.json', 'ui.json']) {
        const from = path.join(installedData, name);
        if (fs.existsSync(from)) fs.cpSync(from, path.join(dataDir, name), { recursive: true });
      }
    } catch {
      // It did not copy — we start from a clean sheet, the progress can be moved with a file.
    }
  }
  app.setPath('userData', dataDir);
}

const file = (name) => path.join(app.getPath('userData'), name);

function readJson(name, fallback) {
  try {
    return { ...fallback, ...JSON.parse(fs.readFileSync(file(name), 'utf8')) };
  } catch {
    return fallback;
  }
}

/** A write through a temporary file: if it fails in the middle of a write, the old file stays whole. */
function writeAtomic(name, text) {
  return atomicWrite(file(name), text);
}

// --- Scale ---
const ZOOM_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const BASE_WIDTH = 1280;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const ui = readJson('ui.json', { zoom: 1, autoZoom: true, alwaysOnTop: false });
ui.zoom = clamp(Number(ui.zoom) || 1, ZOOM_STEPS[0], ZOOM_STEPS[ZOOM_STEPS.length - 1]);

const saveUi = () => writeAtomic('ui.json', JSON.stringify(ui));

// Copies outside the app folder: deleting the exe and its data folder does not delete them. The data folder of a
// fresh install is filled back from the freshest copy (the files that already exist are never touched).
const autoCopyDir = path.join(app.getPath('appData'), 'OSRS Path', 'progress-copies');
if (ui.backupOff !== true) restoreFromCopies(app.getPath('userData'), autoCopyDir, freshData);

function stepZoom(current, dir) {
  if (dir > 0) return ZOOM_STEPS.find((s) => s > current + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  return [...ZOOM_STEPS].reverse().find((s) => s < current - 0.001) ?? ZOOM_STEPS[0];
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let win = null;

  /**
   * The final scale: manual × the adaptation to the window width. A window wider than 1280 — larger (up to 1.5×);
   * a narrower one keeps the manual scale and the layout reflows instead (the route becomes a drawer, panels stack). Shrinking the whole
   * interface to keep three columns made the text too small to read. The window scale (zoomFactor) honestly changes the width for media queries.
   */
  function effectiveZoom() {
    if (!win || !ui.autoZoom) return ui.zoom;
    const [width] = win.getContentSize();
    return Math.round(ui.zoom * clamp(width / BASE_WIDTH, 1, 1.5) * 100) / 100;
  }

  const zoomState = () => ({ zoom: ui.zoom, autoZoom: ui.autoZoom, effective: effectiveZoom(), alwaysOnTop: ui.alwaysOnTop });

  function applyZoom() {
    if (!win) return;
    win.webContents.setZoomFactor(effectiveZoom());
    win.webContents.send('zoom:changed', zoomState());
  }

  function setZoom(zoom) {
    ui.zoom = clamp(zoom, ZOOM_STEPS[0], ZOOM_STEPS[ZOOM_STEPS.length - 1]);
    saveUi();
    applyZoom();
  }

  const windowState = () => readJson('window.json', {});

  function saveWindowState() {
    if (!win) return;
    writeAtomic('window.json', JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }));
  }

  // The progress is written on every change (a note — on every letter), so with a delay.
  /** A profile's progress file: the main one keeps the old progress.json. The identifier is letters and digits only. */
  const progressFile = (id) => (/^[a-z0-9]{1,12}$/.test(String(id)) && id !== 'main' ? `progress-${id}.json` : 'progress.json');
  // Secondary copy failures must remain observable without rejecting a successful primary save. They outlive a restart (ui.json) until the
  // same copy succeeds, so closing the app cannot hide an unreported failure.
  const copyErrors = new Map(Object.entries(ui.copyErrors && typeof ui.copyErrors === 'object' ? ui.copyErrors : {}));
  let savedCopyErrors = JSON.stringify(ui.copyErrors ?? {});
  let copyHistoryError = null;
  const keepCopyErrors = () => {
    const kept = Object.fromEntries(copyErrors);
    const json = JSON.stringify(kept);
    if (json === savedCopyErrors) { copyHistoryError = null; return; }
    ui.copyErrors = kept;
    const receipt = saveUi();
    copyHistoryError = receipt.ok ? null : receipt.error;
    if (receipt.ok) savedCopyErrors = json;
  };
  const recordCopyError = (target, phase, err) => {
    const errors = { ...copyErrors.get(target), [phase]: err ? String(err.code || 'write error') : null };
    if (Object.values(errors).some(Boolean)) copyErrors.set(target, errors);
    else copyErrors.delete(target);
    keepCopyErrors();
  };
  // The copy beside the save before the session's first write (progress.bak.json) is in the data folder itself.
  const BAK = 'first-write copy';
  const progressGuard = createProgressGuard(app.getPath('userData'));
  const progressWriter = createProgressWriter({
    beforeWrite: name => progressGuard.check(name),
    write: (name, text) => {
      const receipt = writeAtomic(name, text);
      if (receipt.ok) progressGuard.saved(name, text);
      return receipt;
    },
    backup: name => {
      try {
        const result = backupProgress(app.getPath('userData'), name);
        recordCopyError(BAK, name, result === 'skipped' || result === 'kept'
          ? { code: result === 'skipped' ? 'Source is damaged or unsupported; copy skipped' : 'Previous copy is damaged or unsupported; preserved without replacing it' } : null);
      }
      catch (err) { recordCopyError(BAK, name, err); }
    },
    afterFlush: () => {
      // The freshest copy follows every change, so a deleted folder loses seconds, not an hour.
      if (ui.backupOff !== true) {
        try {
          const skipped = new Set();
          latestCopy(app.getPath('userData'), autoCopyDir, (file, kind) => skipped.add(`${file}: ${kind} is damaged or unsupported`));
          recordCopyError(autoCopyDir, 'latest', skipped.size ? { code: `Copy skipped (${[...skipped].join('; ')})` } : null);
        }
        catch (err) { recordCopyError(autoCopyDir, 'latest', err); }
      }
    },
  });
  const flushProgress = () => progressWriter.flush();

  ipcMain.handle('zoom:get', () => zoomState());
  ipcMain.on('zoom:set', (_e, s) => {
    ui.autoZoom = Boolean(s.autoZoom);
    setZoom(Number(s.zoom) || 1);
  });
  ipcMain.on('top:set', (_e, on) => {
    ui.alwaysOnTop = Boolean(on);
    saveUi();
    win?.setAlwaysOnTop(ui.alwaysOnTop);
    win?.webContents.send('zoom:changed', zoomState());
  });
  ipcMain.on('progress:load', (e, profileId) => {
    flushProgress();
    e.returnValue = progressGuard.read(progressFile(profileId));
  });
  ipcMain.on('progress:save', (_e, json, profileId) => {
    progressWriter.queue(progressFile(profileId), json);
  });
  // Additive API: old renderers keep their fire-and-forget call; new ones wait for
  // the debounced physical write rather than mistaking IPC acceptance for success.
  ipcMain.handle('progress:save-checked', (_e, json, profileId) => progressWriter.save(progressFile(profileId), String(json)));

  // The list of profiles lives in the window's storage; a file beside the progress keeps it if the storage is gone.
  ipcMain.on('profiles:load', (e) => {
    flushProgress();
    e.returnValue = progressGuard.read('profiles.json');
  });
  ipcMain.on('profiles:save', (_e, json) => {
    progressWriter.queue('profiles.json', json);
  });
  ipcMain.on('profiles:save-checked', (e, json) => {
    try { e.returnValue = progressWriter.saveNow('profiles.json', String(json)); }
    catch { e.returnValue = { ok: false, error: 'WRITE_FAILED' }; }
  });

  // Progress copies: every hour into a folder outside the app (automatic) and into the folder chosen by the player (the app settings).
  const backupTargets = () => [...new Set([ui.backupOff === true ? null : autoCopyDir, ui.backupDir || null].filter(Boolean))];
  const backupState = () => ({ dir: ui.backupDir || null, autoDir: ui.backupOff === true ? null : autoCopyDir, last: ui.backupLast || null,
    error: [...new Set([BAK, ...backupTargets()].flatMap(target => Object.entries(copyErrors.get(target) || {})
      .filter(([, code]) => code).map(([phase, code]) => (target === BAK ? `${code} (copy of ${phase} before the first save)` : code)))),
      ...(copyHistoryError ? [`Backup warning history could not be saved (${copyHistoryError}); current warnings may be lost after restart`] : [])].join('; ') || null });
  function runBackup() {
    const targets = backupTargets();
    if (!targets.length) return backupState();
    flushProgress();
    for (const target of targets) {
      try {
        const skipped = new Set();
        const onSkipped = (file, kind) => skipped.add(`${file}: ${kind} is damaged or unsupported`);
        dailyBackup(app.getPath('userData'), target, undefined, onSkipped);
        latestCopy(app.getPath('userData'), target, onSkipped);
        if (skipped.size) throw Object.assign(new Error('Copy incomplete'), { code: `Copy skipped (${[...skipped].join('; ')})` });
        copyErrors.delete(target);
        keepCopyErrors();
        ui.backupLast = new Date().toISOString();
      } catch (err) {
        recordCopyError(target, 'scheduled', err);
      }
    }
    saveUi();
    return backupState();
  }
  ipcMain.handle('backup:get', () => backupState());
  ipcMain.handle('backup:choose', async () => {
    const r = await dialog.showOpenDialog(win ?? undefined, { title: 'Folder for progress copies', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return backupState();
    ui.backupDir = r.filePaths[0];
    saveUi();
    return runBackup();
  });
  ipcMain.handle('backup:now', () => runBackup());
  ipcMain.handle('backup:auto', (_e, on) => {
    if (on) delete ui.backupOff;
    else ui.backupOff = true;
    saveUi();
    return runBackup();
  });
  ipcMain.handle('backup:clear', () => {
    delete ui.backupDir;
    saveUi();
    return backupState();
  });
  setTimeout(runBackup, 15_000);
  setInterval(runBackup, 60 * 60_000).unref();
  ipcMain.on('app:data-dir', (e) => { e.returnValue = app.getPath('userData'); });
  ipcMain.on('app:is-portable', (e) => { e.returnValue = Boolean(portableDir); });
  registerBridge(ipcMain);
  // RuneLite with the plugin: the window decides whether to start it together with the app (the setting is there too).
  const runelite = createLauncher({ logFile: file('runelite-launch.log') });
  ipcMain.handle('runelite:check', () => runelite.check());
  ipcMain.handle('runelite:launch', () => runelite.launch());

  // Updating the portable version: the check is in the background (it can be turned off), the download and install — by a button in settings.
  const updater = createUpdater({
    version: app.getVersion(),
    env: process.env,
    userData: app.getPath('userData'),
    onState: (s) => win?.webContents.send('update:state', s),
    quit: () => app.quit(),
  });
  ipcMain.handle('update:get', () => ({ ...updater.state, auto: ui.autoUpdate !== false }));
  ipcMain.handle('update:check', () => updater.check());
  ipcMain.handle('update:download', () => updater.download());
  ipcMain.handle('update:cancel', () => updater.cancel());
  ipcMain.handle('update:install', () => updater.install());
  ipcMain.on('update:auto', (_e, on) => {
    ui.autoUpdate = Boolean(on);
    saveUi();
  });
  updater.cleanup();
  updater.sweepOld();
  updater.schedule(() => ui.autoUpdate !== false);

  function createWindow() {
    const saved = windowState();
    win = new BrowserWindow({
      width: saved.width ?? 1280,
      height: saved.height ?? 860,
      x: saved.x,
      y: saved.y,
      minWidth: 380,
      minHeight: 560,
      title: `OSRS Path ${app.getVersion()}`,
      icon: path.join(DIST, 'icon-512.png'),
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#111214' : '#f4f5f7',
      autoHideMenuBar: true,
      alwaysOnTop: ui.alwaysOnTop,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
        backgroundThrottling: !isE2E,
      },
    });
    if (saved.maximized) win.maximize();
    // The page has its own <title>; the window keeps the running version in its name.
    win.on('page-title-updated', (e) => e.preventDefault());
    win.once('ready-to-show', () => { if (!isE2E) win.show(); });
    win.on('close', () => {
      saveWindowState();
      flushProgress();
    });
    win.on('closed', () => { win = null; });

    let resizeTimer = null;
    win.on('resize', () => {
      if (!ui.autoZoom) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(applyZoom, 60);
    });
    win.webContents.on('did-finish-load', applyZoom);

    // Ctrl + the mouse wheel.
    win.webContents.on('zoom-changed', (_e, direction) => setZoom(stepZoom(ui.zoom, direction === 'in' ? 1 : -1)));

    // Ctrl + "+" / "−" / "0", including the numeric keypad: a menu item has only one shortcut, so we catch them ourselves.
    win.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || !(input.control || input.meta) || input.alt) return;
      const k = input.key;
      if (k === '+' || k === '=' || input.code === 'NumpadAdd') setZoom(stepZoom(ui.zoom, 1));
      else if (k === '-' || k === '_' || input.code === 'NumpadSubtract') setZoom(stepZoom(ui.zoom, -1));
      else if (k === '0' || input.code === 'Numpad0') setZoom(1);
      else return;
      event.preventDefault();
    });

    // Links to the wiki and other sites — to an ordinary browser, not inside the app.
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (isWeb(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (event, url) => {
      if (url.startsWith('file:')) return;
      event.preventDefault();
      if (isWeb(url)) shell.openExternal(url);
    });

    win.loadFile(path.join(DIST, 'index.html'));
  }

  // The menu is hidden (shown with Alt) but gives the familiar shortcuts.
  // The scale is only labelled here: the keys are handled by before-input-event.
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'View',
      submenu: [
        { role: 'reload', label: 'Reload' },
        { type: 'separator' },
        { label: 'Zoom in', accelerator: 'CommandOrControl+=', registerAccelerator: false, click: () => setZoom(stepZoom(ui.zoom, 1)) },
        { label: 'Zoom out', accelerator: 'CommandOrControl+-', registerAccelerator: false, click: () => setZoom(stepZoom(ui.zoom, -1)) },
        { label: 'Actual size', accelerator: 'CommandOrControl+0', registerAccelerator: false, click: () => setZoom(1) },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Full screen' },
        { role: 'toggleDevTools', label: 'Developer tools' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo', label: 'Undo' },
        { role: 'redo', label: 'Redo' },
        { type: 'separator' },
        { role: 'cut', label: 'Cut' },
        { role: 'copy', label: 'Copy' },
        { role: 'paste', label: 'Paste' },
        { role: 'selectAll', label: 'Select all' },
      ],
    },
  ]));

  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    // The OSRS Wiki asks to introduce oneself in API requests; the header cannot be set from a browser window.
    session.defaultSession.webRequest.onBeforeSendHeaders(
      { urls: ['https://oldschool.runescape.wiki/*', 'https://prices.runescape.wiki/*', 'https://maps.runescape.wiki/*'] },
      (details, callback) => {
        details.requestHeaders['User-Agent'] = `OSRS-Put/${app.getVersion()} (https://github.com/bexaf3163/OSRS)`;
        callback({ requestHeaders: details.requestHeaders });
      },
    );
    createWindow();
  });
  app.on('before-quit', flushProgress);
  app.on('window-all-closed', () => app.quit());
}

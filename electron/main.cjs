// Десктоп-оболочка OSRS Путь: то же приложение из dist/ в отдельном окне.
// Данные — в папке программы (%APPDATA%\OSRS Путь), а у переносной версии — рядом с exe (OSRS-Put-data).
// Прогресс хранится дважды: в localStorage окна и файлом progress.json — файл переживает сброс хранилища.

const { app, BrowserWindow, Menu, ipcMain, nativeTheme, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist');
const isWeb = (url) => /^https?:\/\//i.test(url);

// --- Переносная версия: всё рядом с exe, чтобы программу можно было носить на флешке. ---
const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
if (portableDir) {
  const installedData = app.getPath('userData');
  const dataDir = path.join(portableDir, 'OSRS-Put-data');
  // Первый запуск переносной версии после обычной — забираем прогресс с собой.
  if (!fs.existsSync(dataDir)) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      for (const name of ['Local Storage', 'progress.json', 'window.json', 'ui.json']) {
        const from = path.join(installedData, name);
        if (fs.existsSync(from)) fs.cpSync(from, path.join(dataDir, name), { recursive: true });
      }
    } catch {
      // Не скопировалось — начнём с чистого листа, прогресс можно перенести файлом.
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

/** Запись через временный файл: при сбое посреди записи старый файл остаётся целым. */
function writeAtomic(name, text) {
  const target = file(name);
  const tmp = `${target}.tmp`;
  try {
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, target);
  } catch {
    // Диск недоступен — localStorage окна всё равно сохранён.
  }
}

// --- Масштаб ---
const ZOOM_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const BASE_WIDTH = 1280;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const ui = readJson('ui.json', { zoom: 1, autoZoom: true, alwaysOnTop: false });
ui.zoom = clamp(Number(ui.zoom) || 1, ZOOM_STEPS[0], ZOOM_STEPS[ZOOM_STEPS.length - 1]);

const saveUi = () => writeAtomic('ui.json', JSON.stringify(ui));

function stepZoom(current, dir) {
  if (dir > 0) return ZOOM_STEPS.find((s) => s > current + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  return [...ZOOM_STEPS].reverse().find((s) => s < current - 0.001) ?? ZOOM_STEPS[0];
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let win = null;

  /**
   * Итоговый масштаб: ручной × подстройка под ширину окна. Окно шире 1280 — крупнее (до 1,5×),
   * уже — мельче (до 0,9×). Масштаб окна (zoomFactor) честно меняет ширину для медиазапросов,
   * поэтому узкое окно по-прежнему получает мобильную раскладку.
   */
  function effectiveZoom() {
    if (!win || !ui.autoZoom) return ui.zoom;
    const [width] = win.getContentSize();
    return Math.round(ui.zoom * clamp(width / BASE_WIDTH, 0.9, 1.5) * 100) / 100;
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

  // Прогресс пишется при каждом изменении (заметка — на каждую букву), поэтому с задержкой.
  let pendingProgress = null;
  let progressTimer = null;
  function flushProgress() {
    clearTimeout(progressTimer);
    if (pendingProgress !== null) writeAtomic('progress.json', pendingProgress);
    pendingProgress = null;
  }

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
  ipcMain.on('progress:load', (e) => {
    try {
      e.returnValue = fs.readFileSync(file('progress.json'), 'utf8');
    } catch {
      e.returnValue = null;
    }
  });
  ipcMain.on('progress:save', (_e, json) => {
    pendingProgress = json;
    clearTimeout(progressTimer);
    progressTimer = setTimeout(flushProgress, 400);
  });
  ipcMain.on('app:data-dir', (e) => { e.returnValue = app.getPath('userData'); });
  ipcMain.on('app:is-portable', (e) => { e.returnValue = Boolean(portableDir); });

  function createWindow() {
    const saved = windowState();
    win = new BrowserWindow({
      width: saved.width ?? 1280,
      height: saved.height ?? 860,
      x: saved.x,
      y: saved.y,
      minWidth: 380,
      minHeight: 560,
      title: 'OSRS Путь',
      icon: path.join(DIST, 'icon-512.png'),
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#111214' : '#f5f2ec',
      autoHideMenuBar: true,
      alwaysOnTop: ui.alwaysOnTop,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
      },
    });
    if (saved.maximized) win.maximize();
    win.once('ready-to-show', () => win.show());
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

    // Ctrl + колесо мыши.
    win.webContents.on('zoom-changed', (_e, direction) => setZoom(stepZoom(ui.zoom, direction === 'in' ? 1 : -1)));

    // Ctrl + «+» / «−» / «0», включая цифровой блок: у пункта меню только одно сочетание, поэтому ловим сами.
    win.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || !(input.control || input.meta) || input.alt) return;
      const k = input.key;
      if (k === '+' || k === '=' || input.code === 'NumpadAdd') setZoom(stepZoom(ui.zoom, 1));
      else if (k === '-' || k === '_' || input.code === 'NumpadSubtract') setZoom(stepZoom(ui.zoom, -1));
      else if (k === '0' || input.code === 'Numpad0') setZoom(1);
      else return;
      event.preventDefault();
    });

    // Ссылки на вики и прочие сайты — в обычный браузер, а не внутрь программы.
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

  // Меню спрятано (показывается по Alt), но даёт привычные сочетания клавиш.
  // Масштаб здесь только подписан: клавиши обрабатывает before-input-event.
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Вид',
      submenu: [
        { role: 'reload', label: 'Обновить' },
        { type: 'separator' },
        { label: 'Крупнее', accelerator: 'CommandOrControl+=', registerAccelerator: false, click: () => setZoom(stepZoom(ui.zoom, 1)) },
        { label: 'Мельче', accelerator: 'CommandOrControl+-', registerAccelerator: false, click: () => setZoom(stepZoom(ui.zoom, -1)) },
        { label: 'Обычный размер', accelerator: 'CommandOrControl+0', registerAccelerator: false, click: () => setZoom(1) },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Во весь экран' },
        { role: 'toggleDevTools', label: 'Инструменты разработчика' },
      ],
    },
    {
      label: 'Правка',
      submenu: [
        { role: 'undo', label: 'Отменить' },
        { role: 'redo', label: 'Повторить' },
        { type: 'separator' },
        { role: 'cut', label: 'Вырезать' },
        { role: 'copy', label: 'Копировать' },
        { role: 'paste', label: 'Вставить' },
        { role: 'selectAll', label: 'Выделить всё' },
      ],
    },
  ]));

  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    // OSRS Wiki просит представляться в запросах к API; из окна браузера заголовок не задать.
    session.defaultSession.webRequest.onBeforeSendHeaders(
      { urls: ['https://oldschool.runescape.wiki/*', 'https://prices.runescape.wiki/*'] },
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

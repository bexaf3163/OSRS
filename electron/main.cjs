// Десктоп-оболочка OSRS Путь: то же приложение из dist/ в отдельном окне.
// Прогресс хранится в localStorage внутри папки программы (%APPDATA%\OSRS Путь), не в браузере.

const { app, BrowserWindow, Menu, nativeTheme, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist');
const isWeb = (url) => /^https?:\/\//i.test(url);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let win = null;
  const stateFile = () => path.join(app.getPath('userData'), 'window.json');

  function loadWindowState() {
    try {
      return JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    } catch {
      return {};
    }
  }

  function saveWindowState() {
    if (!win) return;
    try {
      fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }));
    } catch {
      // Размер окна не запомнится — не страшно.
    }
  }

  function createWindow() {
    const saved = loadWindowState();
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
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
      },
    });
    if (saved.maximized) win.maximize();
    win.once('ready-to-show', () => win.show());
    win.on('close', saveWindowState);
    win.on('closed', () => { win = null; });

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
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Вид',
      submenu: [
        { role: 'reload', label: 'Обновить' },
        { type: 'separator' },
        { role: 'zoomIn', label: 'Крупнее', accelerator: 'CommandOrControl+=' },
        { role: 'zoomOut', label: 'Мельче' },
        { role: 'resetZoom', label: 'Обычный размер' },
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

  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}

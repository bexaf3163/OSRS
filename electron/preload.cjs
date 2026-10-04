// Мост между окном и программой: масштаб, «поверх всех окон», файл прогресса и связь с плагином RuneLite.
// Окно работает в песочнице — наружу выдаются только эти функции, без доступа к Node.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('osrsDesktop', {
  getZoom: () => ipcRenderer.invoke('zoom:get'),
  setZoom: (settings) => ipcRenderer.send('zoom:set', { zoom: Number(settings.zoom), autoZoom: Boolean(settings.autoZoom) }),
  setAlwaysOnTop: (on) => ipcRenderer.send('top:set', Boolean(on)),
  onZoom: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('zoom:changed', listener);
    return () => ipcRenderer.removeListener('zoom:changed', listener);
  },
  // Синхронно: прогресс нужен до первой отрисовки, иначе мелькнёт пустой.
  loadProgressFile: (profileId) => ipcRenderer.sendSync('progress:load', String(profileId ?? 'main')),
  saveProgressFile: (json, profileId) => ipcRenderer.send('progress:save', String(json), String(profileId ?? 'main')),
  // Копия прогресса раз в сутки в выбранную папку.
  backup: {
    get: () => ipcRenderer.invoke('backup:get'),
    choose: () => ipcRenderer.invoke('backup:choose'),
    now: () => ipcRenderer.invoke('backup:now'),
    clear: () => ipcRenderer.invoke('backup:clear'),
  },
  dataDir: () => ipcRenderer.sendSync('app:data-dir'),
  isPortable: () => ipcRenderer.sendSync('app:is-portable'),
  // Обновление переносной версии (electron/updater.cjs): проверка, скачивание, перезапуск в новую версию.
  updates: {
    get: () => ipcRenderer.invoke('update:get'),
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    setAuto: (on) => ipcRenderer.send('update:auto', Boolean(on)),
    onState: (callback) => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on('update:state', listener);
      return () => ipcRenderer.removeListener('update:state', listener);
    },
  },
  // Запуск RuneLite с плагином OSRS Path Bridge (electron/runelite-launcher.cjs).
  runelite: {
    check: () => ipcRenderer.invoke('runelite:check'),
    launch: () => ipcRenderer.invoke('runelite:launch'),
  },
  // Плагин RuneLite на 127.0.0.1:38282: запросы и поток событий идут через главный процесс.
  bridge: {
    request: (method, path, body) => ipcRenderer.invoke('bridge:request', { method: String(method), path: String(path), body }),
    openEvents: (onEvent, onState) => {
      const onData = (_event, data) => onEvent(String(data));
      const onChange = (_event, state) => onState(state === 'open' ? 'open' : 'closed');
      ipcRenderer.on('bridge:event', onData);
      ipcRenderer.on('bridge:events-state', onChange);
      ipcRenderer.send('bridge:events-open');
      return () => {
        ipcRenderer.removeListener('bridge:event', onData);
        ipcRenderer.removeListener('bridge:events-state', onChange);
        ipcRenderer.send('bridge:events-close');
      };
    },
  },
});

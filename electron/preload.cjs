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
  loadProgressFile: () => ipcRenderer.sendSync('progress:load'),
  saveProgressFile: (json) => ipcRenderer.send('progress:save', String(json)),
  dataDir: () => ipcRenderer.sendSync('app:data-dir'),
  isPortable: () => ipcRenderer.sendSync('app:is-portable'),
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

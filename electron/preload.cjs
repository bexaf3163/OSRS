// Мост между окном и программой: масштаб, «поверх всех окон» и файл прогресса.
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
});

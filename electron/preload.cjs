// The bridge between the window and the app: scale, "always on top", the progress file and the link with the RuneLite plugin.
// The window works in a sandbox — only these functions are exposed, without access to Node.

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
  // Synchronous: the progress is needed before the first render, otherwise an empty one would flash.
  loadProgressFile: (profileId) => ipcRenderer.sendSync('progress:load', String(profileId ?? 'main')),
  saveProgressFile: (json, profileId) => ipcRenderer.send('progress:save', String(json), String(profileId ?? 'main')),
  // A progress copy once a day into the chosen folder.
  backup: {
    get: () => ipcRenderer.invoke('backup:get'),
    choose: () => ipcRenderer.invoke('backup:choose'),
    now: () => ipcRenderer.invoke('backup:now'),
    clear: () => ipcRenderer.invoke('backup:clear'),
  },
  dataDir: () => ipcRenderer.sendSync('app:data-dir'),
  isPortable: () => ipcRenderer.sendSync('app:is-portable'),
  // Updating the portable version (electron/updater.cjs): the check, the download, the restart into the new version.
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
  // Starting RuneLite with the OSRS Path Bridge plugin (electron/runelite-launcher.cjs).
  runelite: {
    check: () => ipcRenderer.invoke('runelite:check'),
    launch: () => ipcRenderer.invoke('runelite:launch'),
  },
  // The RuneLite plugin at 127.0.0.1:38282: the requests and the event stream go through the main process.
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

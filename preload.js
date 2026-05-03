const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Games
  getGames:    ()       => ipcRenderer.invoke('get-games'),
  addGame:     (data)   => ipcRenderer.invoke('add-game', data),
  removeGame:  (id)     => ipcRenderer.invoke('remove-game', id),
  launchGame:  (id)     => ipcRenderer.invoke('launch-game', id),
  editGame:    (data)   => ipcRenderer.invoke('edit-game', data),
  updateGame:  (id, field, value) => ipcRenderer.invoke('update-game', { id, field, value }),

  // Dialogs
  openExeDialog:   () => ipcRenderer.invoke('open-exe-dialog'),
  openImageDialog: () => ipcRenderer.invoke('open-image-dialog'),

  // Notes
  saveNote: (id, note) => ipcRenderer.invoke('save-note', { id, note }),

  // Screenshots
  takeScreenshot: (id) => ipcRenderer.invoke('take-screenshot', id),
  getScreenshots: (id) => ipcRenderer.invoke('get-screenshots', id),

  // Scan folder
  scanFolder:  () => ipcRenderer.invoke('scan-folder'),
  scanImages:  () => ipcRenderer.invoke('scan-images'),

  // Steam import
  importSteam: () => ipcRenderer.invoke('import-steam'),

  // Data import
  importData: (data) => ipcRenderer.invoke('import-data', data),

  // Running games
  getRunningGames: () => ipcRenderer.invoke('get-running-games'),

  // Window
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose:    () => ipcRenderer.invoke('window-close'),

  // Events from main
  onPlaytimeUpdate:  (cb) => ipcRenderer.on('playtime-update',  (_, d) => cb(d)),
  onSessionUpdate:   (cb) => ipcRenderer.on('session-update',   (_, d) => cb(d)),
  onScreenshotTaken: (cb) => ipcRenderer.on('screenshot-taken', (_, d) => cb(d)),
  onGameStarted:     (cb) => ipcRenderer.on('game-started',     (_, d) => cb(d)),
  onGameStopped:     (cb) => ipcRenderer.on('game-stopped',     (_, d) => cb(d)),
});

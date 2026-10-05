// preload.js — the ONLY bridge between renderer and main. Exposes
// window.retoma.propose(summary) etc. No keys ever reach the renderer.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('retoma', {
  platform: 'electron',
  propose: (summary, opts) => ipcRenderer.invoke('retoma:propose', summary, opts),
  previewPayload: (summary, mode) => ipcRenderer.invoke('retoma:preview', summary, mode),
  capabilities: () => ipcRenderer.invoke('retoma:capabilities'),
  loadEvents: () => ipcRenderer.invoke('retoma:events:load'),
  saveEvents: (events) => ipcRenderer.invoke('retoma:events:save', events),
  deleteEvents: () => ipcRenderer.invoke('retoma:events:delete'),
  exportEvents: () => ipcRenderer.invoke('retoma:events:export'),
  notifyReturn: (info) => ipcRenderer.send('retoma:notify-return', info),
  setPaused: (paused) => ipcRenderer.send('retoma:paused', paused),
  onFocusResume: (fn) => ipcRenderer.on('retoma:focus-resume', () => fn())
});

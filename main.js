// main.js — Retoma desktop shell (Electron, demo-data driven).
// AI providers, persistence and native behavior live here; the renderer
// never sees keys. Pure handlers in ai/ stay unit-testable headless.
const { app, BrowserWindow, Menu, Tray, Notification, ipcMain, dialog, globalShortcut, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const providers = require('./ai/providers');
const store = require('./ai/store');
const native = require('./ai/native');

let win = null;
let tray = null;
let paused = false;
let storeFile = null;

function eventsFile() {
  if (!storeFile) storeFile = store.eventsPath(app.getPath('userData'));
  return storeFile;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    title: 'Retoma',
    autoHideMenuBar: true,
    backgroundColor: '#101010',
    webPreferences: { contextIsolation: true, preload: path.join(__dirname, 'preload.js') }
  });

  win.loadFile(path.join(__dirname, 'index.html'));

  const menu = Menu.buildFromTemplate([
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle theme',
          accelerator: 'Ctrl+Shift+L',
          click: () => {
            if (win && !win.isDestroyed()) {
              win.webContents.executeJavaScript(
                'window.__toggleTheme ? window.__toggleTheme() : null'
              );
            }
          }
        },
        {
          label: 'Toggle fullscreen',
          accelerator: 'F11',
          click: () => {
            if (win && !win.isDestroyed()) win.setFullScreen(!win.isFullScreen());
          }
        }
      ]
    }
  ]);
  Menu.setApplicationMenu(menu);
  // Esc closes nothing extra: no Escape handler registered.
}

function trayIconPath(isPaused) {
  return path.join(__dirname, 'build', native.trayIconName(isPaused) + '.png');
}

function refreshTray() {
  if (!tray) return;
  try {
    tray.setImage(nativeImage.createFromPath(trayIconPath(paused)));
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open Retoma', click: () => { if (win) { win.show(); win.focus(); } } },
      {
        label: paused ? 'Resume tracking' : 'Pause tracking',
        click: () => {
          paused = !paused;
          if (win && !win.isDestroyed()) {
            win.webContents.executeJavaScript(
              'window.Retoma && window.Retoma.isPaused && window.Retoma.isPaused() !== ' + (paused ? 'true' : 'false') + ' ? window.Retoma.togglePause() : null'
            );
          }
          refreshTray();
        }
      },
      { label: 'Quit', click: () => app.quit() }
    ]));
    tray.setToolTip(paused ? 'Retoma (paused)' : 'Retoma');
  } catch (e) { /* headless: tray handlers are unit-tested instead */ }
}

function setupTray() {
  try {
    tray = new Tray(nativeImage.createFromPath(trayIconPath(false)));
    tray.on('click', () => {
      if (!win) return;
      if (win.isVisible()) win.hide(); else { win.show(); win.focus(); }
    });
    refreshTray();
  } catch (e) { tray = null; /* headless runners have no tray */ }
}

function setupShortcut() {
  try {
    globalShortcut.register('Ctrl+Alt+R', () => {
      if (!win) return;
      if (win.isVisible()) win.hide(); else { win.show(); win.focus(); }
    });
  } catch (e) { /* headless */ }
}

function showReturnNotification(info) {
  var awayMinutes = info && info.awayMinutes;
  var appName = (info && info.app) || 'Document';
  if (!native.shouldNotify(awayMinutes)) return false;
  try {
    var note = new Notification(native.resumeNotification(appName));
    note.on('click', () => {
      if (win) {
        if (!win.isVisible()) win.show();
        win.focus();
        win.webContents.send('retoma:focus-resume');
      }
    });
    note.show();
  } catch (e) { /* headless: handler logic is unit-tested */ }
  return true;
}

function setupIpc() {
  ipcMain.handle('retoma:propose', (ev, summary, opts) => providers.propose(summary, opts));
  ipcMain.handle('retoma:preview', (ev, summary, mode) => providers.previewPayload(summary, mode));
  ipcMain.handle('retoma:capabilities', () => providers.capabilities());
  ipcMain.handle('retoma:events:load', () => {
    var loaded = store.loadEventsFile(fs, eventsFile());
    store.saveEventsFile(fs, eventsFile(), loaded.events);
    return loaded.events;
  });
  ipcMain.handle('retoma:events:save', (ev, events) => {
    store.saveEventsFile(fs, eventsFile(), events || []);
    return true;
  });
  ipcMain.handle('retoma:events:delete', () => {
    store.deleteEventsFile(fs, eventsFile());
    return true;
  });
  ipcMain.handle('retoma:events:export', async () => {
    var loaded = store.loadEventsFile(fs, eventsFile());
    var res = await dialog.showSaveDialog(win, {
      title: 'Export my data',
      defaultPath: 'retoma-data.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (res.canceled || !res.filePath) return false;
    fs.writeFileSync(res.filePath, store.serialize(loaded.events), 'utf8');
    return true;
  });
  ipcMain.on('retoma:notify-return', (ev, info) => showReturnNotification(info));
  ipcMain.on('retoma:paused', (ev, isPaused) => {
    paused = !!isPaused;
    refreshTray();
  });
}

function enforceRetention() {
  try {
    var loaded = store.loadEventsFile(fs, eventsFile());
    store.saveEventsFile(fs, eventsFile(), loaded.events);
  } catch (e) { /* first run: nothing stored yet */ }
}

// Single instance: a second launch focuses the open window.
var gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (!win.isVisible()) win.show();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    setupIpc();
    createWindow();
    setupTray();
    setupShortcut();
    enforceRetention();
    setInterval(enforceRetention, 3600 * 1000);
  });
}
app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (!win || win.isDestroyed()) createWindow(); });
app.on('will-quit', () => { try { globalShortcut.unregisterAll(); } catch (e) { /* noop */ } });

module.exports = { showReturnNotification: showReturnNotification, trayIconPath: trayIconPath };

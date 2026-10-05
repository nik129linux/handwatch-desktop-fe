// main.js — Retoma desktop shell (Electron, offline, no network needed).
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    title: 'Retoma',
    autoHideMenuBar: true,
    backgroundColor: '#101010',
    webPreferences: { contextIsolation: true }
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

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (!win || win.isDestroyed()) createWindow(); });

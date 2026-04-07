const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const { startServer } = require('./server');

let mainWindow;
let serverInstance;

function createWindow() {
  // Start the Express server on a random/available port or fixed
  const port = 4001; // Using a different port to avoid conflicts
  serverInstance = startServer(port);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'public', 'favicon.ico'), // Fallback if exists
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js') // Optional, not implemented yet
    },
    // Set to fullscreen if it's a dedicated POS
    // fullscreen: true,
  });

  // Load the local server
  mainWindow.loadURL(`http://localhost:${port}`);

  // Open the DevTools.
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', function () {
    mainWindow = null;
  });

  // Remove default menu for a professional app look
  // Menu.setApplicationMenu(null);
}

app.on('ready', createWindow);

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    if (serverInstance) serverInstance.close();
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});

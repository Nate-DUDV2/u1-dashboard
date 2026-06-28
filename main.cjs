const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 850,
    title: "Snapmaker U1 Dashboard", // Set your app name here
    autoHideMenuBar: true, // Hides the top browser menu bar
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // If testing locally, load your running Vite server. 
  // If building the installer, load the compiled code folder.
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
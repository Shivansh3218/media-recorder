const { app, BrowserWindow, ipcMain, desktopCapturer } = require('electron');
const path = require('path');

let mainWindow;
let webcamWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        icon: path.join(__dirname, 'assets', 'icon.ico'), // Add this line
        height: 800,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile('index.html');
}

function createWebcamWindow() {
    const display = require('electron').screen.getPrimaryDisplay();
    const { width } = display.workAreaSize;

    webcamWindow = new BrowserWindow({
        width: 320,
        height: 240,
        frame: false,
        alwaysOnTop: true,
        transparent: true,
        resizable: true,
        icon: path.join(__dirname, 'assets', 'icon.ico'),
        skipTaskbar: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    webcamWindow.loadFile('webcam.html');
    webcamWindow.setPosition(width - 330, 10);

    return webcamWindow;
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// IPC handlers
ipcMain.handle('get-sources', async () => {
    try {
        const sources = await desktopCapturer.getSources({
            types: ['screen', 'window'],
            thumbnailSize: { width: 1920, height: 1080 }
        });
        return sources;
    } catch (error) {
        console.error('Error getting sources:', error);
        throw error;
    }
});

ipcMain.on('start-recording', () => {
    if (!webcamWindow || webcamWindow.isDestroyed()) {
        webcamWindow = createWebcamWindow();
    } else {
        webcamWindow.show();
    }
});

ipcMain.on('stop-recording', () => {
    if (webcamWindow && !webcamWindow.isDestroyed()) {
        webcamWindow.close();
        webcamWindow = null;
    }
});
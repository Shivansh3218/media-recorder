const { app, BrowserWindow, ipcMain, desktopCapturer } = require('electron');
const path = require('path');


function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false
        },
        // Add these lines to remove the menu bar
        autoHideMenuBar: true,  // Hides the menu bar but can be shown with Alt key
        // Or use this to completely remove it:
        // frame: false,  // Removes the entire window frame including menu bar
    });

    // Hide the menu bar completely
    mainWindow.setMenuBarVisibility(false);

    mainWindow.loadFile('index.html');
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

// Handle screen source selection
ipcMain.handle('get-sources', async () => {
    const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 1920, height: 1080 }
    });
    return sources;
});
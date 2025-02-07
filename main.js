const { app, BrowserWindow, ipcMain, desktopCapturer } = require('electron');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffmpeg-installer/ffmpeg').path;

// Set FFmpeg paths
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// Log FFmpeg path for verification
console.log('FFmpeg Path:', ffmpegPath);

let mainWindow;
let webcamWindow;
let currentConversion = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: path.join(__dirname, 'assets', 'icon.ico'),
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });
    require('@electron/remote/main').initialize();
    require('@electron/remote/main').enable(mainWindow.webContents);

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

app.whenReady().then(() => {
    createWindow();

    // Verify FFmpeg on startup
    ffmpeg.getAvailableCodecs((err, codecs) => {
        if (err) {
            console.error('FFmpeg startup verification failed:', err);
        } else {
            console.log('FFmpeg startup verification successful');
        }
    });
});

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

ipcMain.on('open-folder', (event, filePath) => {
    require('electron').shell.showItemInFolder(filePath);
});


// Screen recording handlers
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

// FFmpeg handlers
ipcMain.handle('verify-ffmpeg', () => {
    return new Promise((resolve, reject) => {
        try {
            console.log('Verifying FFmpeg installation...');
            console.log('FFmpeg Path:', ffmpegPath);

            if (!ffmpegPath) {
                throw new Error('FFmpeg path not found');
            }

            ffmpeg.getAvailableCodecs((err, codecs) => {
                if (err) {
                    console.error('FFmpeg verification failed:', err);
                    reject(err);
                } else {
                    console.log('FFmpeg verified with codecs:', Object.keys(codecs).length);
                    resolve(true);
                }
            });
        } catch (error) {
            console.error('FFmpeg setup error:', error);
            reject(error);
        }
    });
});

// In your main.js, modify the convert-video handler:

ipcMain.handle('convert-video', async (event, { inputPath, outputPath, format, quality }) => {
    return new Promise((resolve, reject) => {
        try {
            console.log('Starting conversion:', {
                inputPath,
                outputPath,
                format,
                quality
            });

            if (!inputPath || !outputPath) {
                throw new Error('Invalid input or output path');
            }

            const command = ffmpeg(inputPath);
            currentConversion = command;

            // Optimization settings
            command
                .videoCodec('libx264')
                .addOption('-preset', 'ultrafast') // Makes conversion faster
                .addOption('-threads', '0') // Use all available CPU threads
                .toFormat(format);

            // Quality settings with optimized bitrates
            const qualitySettings = {
                high: {
                    videoBitrate: '2500k',
                    audioBitrate: '192k',
                    scale: 'original'
                },
                medium: {
                    videoBitrate: '1500k',
                    audioBitrate: '128k',
                    scale: '-2:720' // 720p
                },
                low: {
                    videoBitrate: '800k',
                    audioBitrate: '96k',
                    scale: '-2:480' // 480p
                }
            };

            const settings = qualitySettings[quality];

            command
                .videoBitrate(settings.videoBitrate)
                .audioBitrate(settings.audioBitrate);

            if (settings.scale !== 'original') {
                command.size(settings.scale);
            }

            command
                .on('start', (commandLine) => {
                    console.log('FFmpeg command:', commandLine);
                })
                .on('progress', (progress) => {
                    console.log('Progress:', progress);
                    event.sender.send('conversion-progress', progress);
                })
                .on('end', () => {
                    console.log('Conversion completed');
                    currentConversion = null;
                    resolve({ success: true });
                })
                .on('error', (err) => {
                    console.error('Conversion error:', err);
                    currentConversion = null;
                    reject(err);
                });

            command.save(outputPath);

        } catch (error) {
            console.error('Error setting up conversion:', error);
            reject(error);
        }
    });
});

ipcMain.on('cancel-conversion', () => {
    if (currentConversion) {
        currentConversion.kill();
        currentConversion = null;
    }
});
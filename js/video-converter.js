const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// DOM Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const removeFile = document.getElementById('removeFile');
const outputFormat = document.getElementById('outputFormat');
const qualityPreset = document.getElementById('qualityPreset');
const convertBtn = document.getElementById('convertBtn');
const progressContainer = document.querySelector('.progress-container');
const progressBar = document.getElementById('progressBar');
const progressPercent = document.getElementById('progressPercent');
const cancelBtn = document.getElementById('cancelBtn');

let selectedFile = null;

// Initialize the page
console.log('Video converter initialized');

// Verify FFmpeg on load
async function verifyFFmpeg() {
    try {
        await ipcRenderer.invoke('verify-ffmpeg');
        console.log('FFmpeg verified successfully');
    } catch (error) {
        console.error('FFmpeg verification failed:', error);
        alert('Error: FFmpeg is not properly configured. Video conversion may not work.');
    }
}

// Call verification on page load
verifyFFmpeg();

// File handling functions
async function handleFileSelection(file) {
    console.log('File selected:', file);

    try {
        // Create a copy of the file in temp directory
        const tempDir = os.tmpdir();
        const tempPath = path.join(tempDir, file.name);

        // If it's a File object from input
        if (file instanceof File) {
            const buffer = await file.arrayBuffer();
            fs.writeFileSync(tempPath, Buffer.from(buffer));
            selectedFile = {
                name: file.name,
                path: tempPath,
                size: file.size,
                type: file.type
            };
        }
        // If it's from drag and drop
        else if (file.path) {
            fs.copyFileSync(file.path, tempPath);
            selectedFile = {
                name: file.name,
                path: tempPath,
                size: file.size,
                type: file.type
            };
        }

        // Update UI
        fileName.textContent = selectedFile.name;
        fileSize.textContent = formatFileSize(selectedFile.size);
        fileInfo.style.display = 'block';
        convertBtn.disabled = false;

        console.log('File prepared:', selectedFile);
    } catch (error) {
        console.error('Error preparing file:', error);
        alert('Error preparing file for conversion: ' + error.message);
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Conversion process
async function startConversion() {
    if (!selectedFile || !selectedFile.path) {
        console.error('No valid file selected');
        alert('Please select a valid video file');
        return;
    }

    const format = outputFormat.value;
    const quality = qualityPreset.value;

    try {
        // Create output directory in downloads folder
        const homeDir = os.homedir();
        const outputDir = path.join(homeDir, 'Downloads', 'Video Conversions');

        // Create directory if it doesn't exist
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Create output filename
        const originalName = path.parse(selectedFile.name).name;
        const outputName = `${originalName}_converted_${Date.now()}.${format}`;
        const outputPath = path.join(outputDir, outputName);

        console.log('Starting conversion:', {
            input: selectedFile.path,
            output: outputPath,
            format,
            quality
        });

        // Show progress UI
        progressContainer.style.display = 'block';
        convertBtn.disabled = true;

        // Set up progress handler
        ipcRenderer.on('conversion-progress', (event, progress) => {
            if (progress.timemark) {
                const matches = progress.timemark.match(/(\d\d):(\d\d):(\d\d)\.(\d\d)/);
                if (matches) {
                    const hours = parseInt(matches[1]);
                    const minutes = parseInt(matches[2]);
                    const seconds = parseInt(matches[3]);
                    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
                    const percent = Math.min(Math.round((totalSeconds / 600) * 100), 100);

                    progressBar.style.width = `${percent}%`;
                    progressPercent.textContent = `${percent}%`;

                    console.log('Progress:', {
                        timemark: progress.timemark,
                        percent: `${percent}%`,
                        fps: progress.currentFps,
                        bitrate: progress.currentKbps + 'kbps'
                    });
                }
            }
        });

        // Start conversion
        const result = await ipcRenderer.invoke('convert-video', {
            inputPath: selectedFile.path,
            outputPath: outputPath,
            format: format,
            quality: quality
        });

        if (result.success) {
            alert(`Video conversion completed!\nSaved to: ${outputPath}`);
            ipcRenderer.send('open-folder', outputPath);
        } else {
            throw new Error('Conversion failed');
        }

    } catch (error) {
        console.error('Conversion error:', error);
        alert('Error during conversion: ' + error.message);
    } finally {
        resetUI();
        ipcRenderer.removeAllListeners('conversion-progress');

        // Clean up temp file
        if (selectedFile && selectedFile.path) {
            try {
                fs.unlinkSync(selectedFile.path);
            } catch (error) {
                console.error('Error cleaning up temp file:', error);
            }
        }
    }
}

function resetUI() {
    progressContainer.style.display = 'none';
    progressBar.style.width = '0%';
    progressPercent.textContent = '0%';
    convertBtn.disabled = false;
    selectedFile = null;
    fileInput.value = '';
    fileInfo.style.display = 'none';
}

// Event Listeners
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('video/')) {
        handleFileSelection(files[0]);
    } else {
        alert('Please drop a valid video file.');
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFileSelection(e.target.files[0]);
    }
});

removeFile.addEventListener('click', () => {
    if (selectedFile && selectedFile.path) {
        try {
            fs.unlinkSync(selectedFile.path);
        } catch (error) {
            console.error('Error removing temp file:', error);
        }
    }
    resetUI();
});

convertBtn.addEventListener('click', startConversion);

cancelBtn.addEventListener('click', () => {
    ipcRenderer.send('cancel-conversion');
    resetUI();
});
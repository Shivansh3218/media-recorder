const { ipcRenderer } = require('electron');

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const pauseBtn = document.getElementById('pauseBtn');
const switchBtn = document.getElementById('switchSourceBtn');
const screenPreview = document.getElementById('screenPreview');

let mediaRecorder;
let recordedChunks = [];
let audioContext;
let audioDestination;
let currentScreenStream;
let currentWebcamStream;
let isPaused = false;

async function startRecording() {
    try {
        const sources = await ipcRenderer.invoke('get-sources');
        showSourceSelectionDialog(sources);
    } catch (e) {
        console.error('Error getting sources:', e);
        alert('Error getting screen sources: ' + e.message);
    }
}

function showSourceSelectionDialog(sources) {
    const sourceDialog = document.createElement('dialog');
    sourceDialog.innerHTML = `
        <div class="dialog-content">
            <div class="dialog-header">
                <h3>Select Screen to Share</h3>
            </div>
            <select id="dialogScreenSource" class="source-select">
                ${sources.map(source => `<option value="${source.id}">${source.name}</option>`).join('')}
            </select>
            <div class="dialog-footer">
                <button id="cancelBtn" class="control-btn secondary-btn">Cancel</button>
                <button id="confirmBtn" class="control-btn primary-btn">
                    ${mediaRecorder ? 'Switch Source' : 'Start Recording'}
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(sourceDialog);
    sourceDialog.showModal();

    setupDialogListeners(sourceDialog);
}

function setupDialogListeners(dialog) {
    dialog.querySelector('#cancelBtn').onclick = () => {
        dialog.close();
        document.body.removeChild(dialog);
    };

    dialog.querySelector('#confirmBtn').onclick = async () => {
        const selectedSource = dialog.querySelector('#dialogScreenSource').value;
        dialog.close();
        document.body.removeChild(dialog);

        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            await switchSource(selectedSource);
        } else {
            await initializeRecording(selectedSource);
        }
    };
}

async function switchSource(sourceId) {
    try {
        // Store current state
        const wasRecording = mediaRecorder.state === 'recording';

        // Get new screen stream
        const newScreenStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'desktop'
                }
            },
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: sourceId
                }
            }
        });

        // Pause recording if it was active
        if (wasRecording) {
            mediaRecorder.pause();
        }

        // Stop old screen stream tracks
        if (currentScreenStream) {
            currentScreenStream.getTracks().forEach(track => track.stop());
        }

        // Update current screen stream
        currentScreenStream = newScreenStream;
        screenPreview.srcObject = currentScreenStream;

        // Update audio mixing
        updateAudioMixing();

        // Create new final stream and update media recorder
        const finalStream = new MediaStream([
            currentScreenStream.getVideoTracks()[0],
            audioDestination.stream.getAudioTracks()[0]
        ]);

        const options = {
            mimeType: 'video/webm;codecs=vp8,opus',
            videoBitsPerSecond: 2500000,
            audioBitsPerSecond: 128000
        };

        // Store chunks from previous recording
        const previousChunks = recordedChunks;

        // Create new media recorder
        mediaRecorder = new MediaRecorder(finalStream, options);
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                recordedChunks.push(e.data);
            }
        };
        mediaRecorder.onstop = saveVideo;

        // Combine old and new chunks
        recordedChunks = previousChunks;

        // Resume recording if it was active
        if (wasRecording) {
            mediaRecorder.start(1000);
        }

    } catch (err) {
        console.error('Error switching source:', err);
        alert('Error switching source: ' + err.message);
    }
}

async function initializeRecording(sourceId) {
    try {
        // Get screen stream
        currentScreenStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'desktop'
                }
            },
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: sourceId
                }
            }
        });

        // Get webcam stream
        currentWebcamStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: false
            }
        });

        // Show floating webcam window
        ipcRenderer.send('start-recording');

        // Set up screen preview
        screenPreview.srcObject = currentScreenStream;
        screenPreview.muted = true;

        // Initialize audio mixing
        setupAudioMixing();

        // Set up media recorder
        setupMediaRecorder(currentScreenStream);

        // Update UI
        updateControlsState(true);
    } catch (err) {
        console.error('Error starting recording:', err);
        alert('Error starting recording: ' + err.message);
    }
}

function setupAudioMixing() {
    if (audioContext) {
        audioContext.close();
    }

    audioContext = new AudioContext();
    audioDestination = audioContext.createMediaStreamDestination();

    const micSource = audioContext.createMediaStreamSource(currentWebcamStream);
    const sysSource = audioContext.createMediaStreamSource(currentScreenStream);

    const micGain = audioContext.createGain();
    const sysGain = audioContext.createGain();

    micGain.gain.value = 1.0;
    sysGain.gain.value = 0.5;

    micSource.connect(micGain).connect(audioDestination);
    sysSource.connect(sysGain).connect(audioDestination);
}

function updateAudioMixing() {
    if (audioContext) {
        audioContext.close();
    }
    setupAudioMixing();
}

function setupMediaRecorder(stream) {
    const finalStream = new MediaStream([
        stream.getVideoTracks()[0],
        audioDestination.stream.getAudioTracks()[0]
    ]);

    mediaRecorder = new MediaRecorder(finalStream, {
        mimeType: 'video/webm;codecs=vp8,opus',
        videoBitsPerSecond: 2500000,
        audioBitsPerSecond: 128000
    });

    mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
            recordedChunks.push(e.data);
        }
    };

    mediaRecorder.onstop = saveVideo;
    mediaRecorder.start(1000);
}

function pauseRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.pause();
        isPaused = true;
        pauseBtn.textContent = 'Resume Recording';
        pauseBtn.classList.remove('secondary-btn');
        pauseBtn.classList.add('primary-btn');
    } else if (mediaRecorder && mediaRecorder.state === 'paused') {
        mediaRecorder.resume();
        isPaused = false;
        pauseBtn.textContent = 'Pause Recording';
        pauseBtn.classList.remove('primary-btn');
        pauseBtn.classList.add('secondary-btn');
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        updateControlsState(false);

        // Stop all tracks
        if (currentScreenStream) {
            currentScreenStream.getTracks().forEach(track => track.stop());
        }
        if (currentWebcamStream) {
            currentWebcamStream.getTracks().forEach(track => track.stop());
        }

        // Close audio context
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }

        // Close webcam window
        ipcRenderer.send('stop-recording');
    }
}

function updateControlsState(isRecording) {
    startBtn.disabled = isRecording;
    stopBtn.disabled = !isRecording;
    pauseBtn.disabled = !isRecording;
    switchBtn.disabled = !isRecording;
}

function saveVideo() {
    const blob = new Blob(recordedChunks, {
        type: 'video/webm;codecs=vp8,opus'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `recording-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        recordedChunks = [];
    }, 100);
}

// Event Listeners
startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
pauseBtn.addEventListener('click', pauseRecording);
switchBtn.addEventListener('click', startRecording); // This now handles switching properly

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        stopRecording();
    }
});
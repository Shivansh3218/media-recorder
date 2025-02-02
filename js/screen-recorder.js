const { ipcRenderer } = require('electron');

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const pauseBtn = document.getElementById('pauseBtn');
const switchBtn = document.getElementById('switchSourceBtn');
const screenPreview = document.getElementById('screenPreview');
const webcamPreview = document.getElementById('webcamPreview');

let mediaRecorder;
let recordedChunks = [];
let audioContext;
let audioDestination;
let currentScreenStream;
let currentWebcamStream;
let isPaused = false;

// Initialize preview on page load
initializePreview();

async function initializePreview() {
    try {
        // Get webcam stream for preview
        const webcamStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
        });
        webcamPreview.srcObject = webcamStream;
        webcamPreview.muted = true;
    } catch (err) {
        console.error('Error initializing preview:', err);
    }
}

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
                <button id="confirmBtn" class="control-btn primary-btn">Start Recording</button>
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
        await initializeRecording(selectedSource);
    };
}

async function initializeRecording(sourceId) {
    try {
        // Get screen stream with system audio
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

        // Get webcam stream with audio
        currentWebcamStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: false
            }
        });

        // Set up preview streams
        screenPreview.srcObject = currentScreenStream;
        webcamPreview.srcObject = currentWebcamStream;
        screenPreview.muted = true;
        webcamPreview.muted = true;

        // Initialize audio mixing
        setupAudioMixing();

        // Create final stream
        const finalStream = await createFinalStream();

        // Set up media recorder
        setupMediaRecorder(finalStream);

        // Update UI
        updateControlsState(true);
    } catch (err) {
        console.error('Error starting recording:', err);
        alert('Error starting recording: ' + err.message);
    }
}

function setupAudioMixing() {
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

async function createFinalStream() {
    // Get the webcam video track
    const webcamTrack = currentWebcamStream.getVideoTracks()[0];

    // Create a canvas to flip the webcam video
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const videoElement = document.createElement('video');

    // Set canvas size to match the webcam track settings
    const { width, height } = webcamTrack.getSettings();
    canvas.width = width;
    canvas.height = height;

    // Set up the video element
    videoElement.srcObject = new MediaStream([webcamTrack]);
    videoElement.muted = true;
    await videoElement.play();

    // Create a canvas stream for the mirrored webcam
    const canvasStream = canvas.captureStream();
    const mirroredTrack = canvasStream.getVideoTracks()[0];

    // Draw mirrored video frames
    function drawMirroredFrame() {
        // Save the canvas state
        ctx.save();

        // Clear the canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Flip the context horizontally
        ctx.scale(-1, 1);
        ctx.translate(-canvas.width, 0);

        // Draw the video frame
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

        // Restore the canvas state
        ctx.restore();

        // Schedule the next frame
        requestAnimationFrame(drawMirroredFrame);
    }

    // Start the mirroring process
    drawMirroredFrame();

    // Return the final stream with the mirrored webcam track
    return new MediaStream([
        currentScreenStream.getVideoTracks()[0],
        mirroredTrack,
        audioDestination.stream.getAudioTracks()[0]
    ]);
}

function setupMediaRecorder(stream) {
    mediaRecorder = new MediaRecorder(stream, {
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

async function switchSource() {
    const sources = await ipcRenderer.invoke('get-sources');

    const sourceDialog = document.createElement('dialog');
    sourceDialog.innerHTML = `
        <div class="dialog-content">
            <div class="dialog-header">
                <h3>Switch Screen Source</h3>
            </div>
            <select id="dialogScreenSource" class="source-select">
                ${sources.map(source => `<option value="${source.id}">${source.name}</option>`).join('')}
            </select>
            <div class="dialog-footer">
                <button id="cancelBtn" class="control-btn secondary-btn">Cancel</button>
                <button id="confirmBtn" class="control-btn primary-btn">Switch</button>
            </div>
        </div>
    `;
    document.body.appendChild(sourceDialog);
    sourceDialog.showModal();

    sourceDialog.querySelector('#cancelBtn').onclick = () => {
        sourceDialog.close();
        document.body.removeChild(sourceDialog);
    };

    sourceDialog.querySelector('#confirmBtn').onclick = async () => {
        const selectedSource = sourceDialog.querySelector('#dialogScreenSource').value;
        sourceDialog.close();
        document.body.removeChild(sourceDialog);

        // Stop current screen stream
        currentScreenStream.getTracks().forEach(track => track.stop());

        // Get new screen stream
        currentScreenStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'desktop'
                }
            },
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: selectedSource
                }
            }
        });

        // Update preview
        screenPreview.srcObject = currentScreenStream;

        // Update recorder with new stream
        const finalStream = createFinalStream();
        setupMediaRecorder(finalStream);
    };
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

        // Reinitialize preview
        initializePreview();
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
switchBtn.addEventListener('click', switchSource);

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        stopRecording();
    }
});
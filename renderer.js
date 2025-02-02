const { ipcRenderer } = require('electron');

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const screenPreview = document.getElementById('screenPreview');
const webcamPreview = document.getElementById('webcamPreview');

let mediaRecorder;
let recordedChunks = [];

async function startRecording() {
  try {
    const sources = await ipcRenderer.invoke('get-sources');

    const sourceDialog = document.createElement('dialog');
    sourceDialog.innerHTML = `
      <div style="padding: 20px; color: black;">
        <h3>Select Screen to Share</h3>
        <select id="dialogScreenSource" style="width: 100%; margin: 10px 0; padding: 5px;">
          ${sources.map(source => `<option value="${source.id}">${source.name}</option>`).join('')}
        </select>
        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
          <button id="cancelBtn" style="padding: 5px 10px;">Cancel</button>
          <button id="confirmBtn" style="padding: 5px 10px; background: #007bff; color: white; border: none;">Start</button>
        </div>
      </div>
    `;
    document.body.appendChild(sourceDialog);
    sourceDialog.showModal();

    return new Promise((resolve, reject) => {
      sourceDialog.querySelector('#cancelBtn').onclick = () => {
        sourceDialog.close();
        document.body.removeChild(sourceDialog);
        reject(new Error('Recording cancelled'));
      };

      sourceDialog.querySelector('#confirmBtn').onclick = async () => {
        const selectedSource = sourceDialog.querySelector('#dialogScreenSource').value;
        sourceDialog.close();
        document.body.removeChild(sourceDialog);

        try {
          // Get screen stream with system audio
          const screenStream = await navigator.mediaDevices.getUserMedia({
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

          // Get webcam stream with video and microphone
          const webcamStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: false,
              sampleRate: 44100
            }
          });

          // Set up preview streams (muted)
          screenPreview.srcObject = screenStream;
          webcamPreview.srcObject = webcamStream;
          screenPreview.muted = true;
          webcamPreview.muted = true;

          // Create an AudioContext for mixing
          const audioContext = new AudioContext();

          // Create sources for both audio streams
          const micSource = audioContext.createMediaStreamSource(webcamStream);
          const sysSource = audioContext.createMediaStreamSource(screenStream);

          // Create a destination for the mixed audio
          const dest = audioContext.createMediaStreamDestination();

          // Create gain nodes for volume control
          const micGain = audioContext.createGain();
          const sysGain = audioContext.createGain();

          // Set volumes
          micGain.gain.value = 1.0;  // Microphone volume
          sysGain.gain.value = 0.5;  // System audio volume

          // Connect the audio graph
          micSource.connect(micGain);
          sysSource.connect(sysGain);
          micGain.connect(dest);
          sysGain.connect(dest);

          // Combine all tracks for recording
          const recordingStream = new MediaStream([
            screenStream.getVideoTracks()[0], // Screen video
            webcamStream.getVideoTracks()[0], // Webcam video
            dest.stream.getAudioTracks()[0]   // Mixed audio
          ]);

          mediaRecorder = new MediaRecorder(recordingStream, {
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
          startBtn.disabled = true;
          stopBtn.disabled = false;
          resolve();
        } catch (err) {
          reject(err);
          console.error('Error in recording setup:', err);
        }
      };
    });
  } catch (e) {
    console.error('Error starting recording:', e);
    alert('Error starting recording: ' + e.message);
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    startBtn.disabled = false;
    stopBtn.disabled = true;

    // Stop all tracks
    if (screenPreview.srcObject) {
      screenPreview.srcObject.getTracks().forEach(track => track.stop());
    }
    if (webcamPreview.srcObject) {
      webcamPreview.srcObject.getTracks().forEach(track => track.stop());
    }
  }
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

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    recordedChunks = [];
  }, 100);
}

// Audio extraction functionality
const videoFileInput = document.getElementById('videoFile');
const extractBtn = document.getElementById('extractBtn');
const progressBar = document.getElementById('progressBar');
const progress = document.getElementById('progress');

async function extractAudio() {
  const file = videoFileInput.files[0];
  if (!file) {
    alert('Please select a video file first');
    return;
  }

  try {
    const video = document.createElement('video');
    const audioContext = new AudioContext();

    progressBar.style.display = 'block';
    progress.style.width = '0%';

    const videoURL = URL.createObjectURL(file);
    video.src = videoURL;

    await new Promise((resolve) => {
      video.addEventListener('loadedmetadata', resolve);
    });

    const mediaElement = audioContext.createMediaElementSource(video);
    const destination = audioContext.createMediaStreamDestination();
    mediaElement.connect(destination);

    const audioRecorder = new MediaRecorder(destination.stream);
    const audioChunks = [];

    audioRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        audioChunks.push(e.data);
      }
    };

    audioRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
      const audioUrl = URL.createObjectURL(audioBlob);
      const a = document.createElement('a');
      a.href = audioUrl;
      a.download = `extracted-audio-${Date.now()}.wav`;
      a.click();

      // Cleanup
      setTimeout(() => {
        URL.revokeObjectURL(audioUrl);
        URL.revokeObjectURL(videoURL);
        video.remove();
        progressBar.style.display = 'none';
      }, 100);
    };

    audioRecorder.start();
    video.play();

    const updateProgress = () => {
      const progress = (video.currentTime / video.duration) * 100;
      document.getElementById('progress').style.width = `${progress}%`;

      if (video.currentTime < video.duration) {
        requestAnimationFrame(updateProgress);
      }
    };
    updateProgress();

    video.onended = () => {
      audioRecorder.stop();
    };

  } catch (error) {
    console.error('Error extracting audio:', error);
    alert('Error extracting audio. Please try again.');
    progressBar.style.display = 'none';
  }
}

// Add event listeners
startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
extractBtn.addEventListener('click', extractAudio);

// Handle page unload
window.addEventListener('beforeunload', () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    stopRecording();
  }
});
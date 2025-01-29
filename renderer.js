const { ipcRenderer } = require('electron');

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const screenPreview = document.getElementById('screenPreview');
const webcamPreview = document.getElementById('webcamPreview');

let mediaRecorder;
let recordedChunks = [];

async function startRecording() {
  try {
    // First get the available sources when Start Recording is clicked
    const sources = await ipcRenderer.invoke('get-sources');
    
    // Create a modal/dialog for source selection
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

    // Handle dialog buttons
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
          // Get screen stream
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

          // Get webcam stream
          const webcamStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
          });

          screenPreview.srcObject = screenStream;
          webcamPreview.srcObject = webcamStream;

          // Combine both streams
          const combinedStream = new MediaStream([
            ...screenStream.getTracks(),
            ...webcamStream.getTracks()
          ]);

          mediaRecorder = new MediaRecorder(combinedStream);

          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
              recordedChunks.push(e.data);
            }
          };

          mediaRecorder.onstop = saveVideo;

          mediaRecorder.start();
          startBtn.disabled = true;
          stopBtn.disabled = false;
          resolve();
        } catch (err) {
          reject(err);
        }
      };
    });
  } catch (e) {
    console.error('Error starting recording:', e);
    alert('Error starting recording: ' + e.message);
  }
}

function stopRecording() {
  mediaRecorder.stop();
  startBtn.disabled = false;
  stopBtn.disabled = true;
}

function saveVideo() {
  const blob = new Blob(recordedChunks, { type: 'video/webm' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = `recording-${Date.now()}.webm`;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  document.body.removeChild(a);
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
    // Create video element to load the file
    const video = document.createElement('video');
    const audioContext = new AudioContext();
    let audioBuffer;

    // Show progress bar
    progressBar.style.display = 'block';
    progress.style.width = '0%';

    // Create object URL for the file
    const videoURL = URL.createObjectURL(file);
    video.src = videoURL;

    // Wait for video metadata to load
    await new Promise((resolve) => {
      video.addEventListener('loadedmetadata', resolve);
    });

    // Create media element source
    const mediaElement = audioContext.createMediaElementSource(video);

    // Create destination node to capture audio
    const destination = audioContext.createMediaStreamDestination();
    mediaElement.connect(destination);

    // Create MediaRecorder for audio
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
      URL.revokeObjectURL(audioUrl);
      URL.revokeObjectURL(videoURL);
      progressBar.style.display = 'none';
    };

    // Start recording and playing video
    audioRecorder.start();
    video.play();

    // Update progress bar
    const updateProgress = () => {
      const progress = (video.currentTime / video.duration) * 100;
      document.getElementById('progress').style.width = `${progress}%`;
      
      if (video.currentTime < video.duration) {
        requestAnimationFrame(updateProgress);
      }
    };
    updateProgress();

    // Stop recording when video ends
    video.onended = () => {
      audioRecorder.stop();
      video.remove();
    };

  } catch (error) {
    console.error('Error extracting audio:', error);
    alert('Error extracting audio. Please try again.');
    progressBar.style.display = 'none';
  }
}

extractBtn.addEventListener('click', extractAudio);

// Event listeners
startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
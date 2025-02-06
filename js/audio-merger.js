const videoFileInput = document.getElementById('videoFile');
const audioFileInput = document.getElementById('audioFile');
const mergeBtn = document.getElementById('mergeBtn');
const previewVideo = document.getElementById('previewVideo');
const progressBar = document.getElementById('progressBar');
const progress = document.getElementById('progress');

// Volume controls
const videoVolume = document.getElementById('videoVolume');
const audioVolume = document.getElementById('audioVolume');
const videoVolumeValue = document.getElementById('videoVolumeValue');
const audioVolumeValue = document.getElementById('audioVolumeValue');

let audioContext;
let videoSource;
let audioSource;
let videoGain;
let audioGain;
let mediaRecorder;
let recordedChunks = [];

// Update volume display
videoVolume.addEventListener('input', (e) => {
    const value = e.target.value;
    videoVolumeValue.textContent = `${value}%`;
    if (videoGain) {
        videoGain.gain.value = value / 100;
    }
});

audioVolume.addEventListener('input', (e) => {
    const value = e.target.value;
    audioVolumeValue.textContent = `${value}%`;
    if (audioGain) {
        audioGain.gain.value = value / 100;
    }
});

async function mergeFiles() {
    const videoFile = videoFileInput.files[0];
    const audioFile = audioFileInput.files[0];

    if (!videoFile || !audioFile) {
        alert('Please select both video and audio files');
        return;
    }

    try {
        progressBar.style.display = 'block';
        progress.style.width = '0%';

        // Create audio context
        audioContext = new AudioContext();

        // Create media elements
        const video = document.createElement('video');
        const audio = document.createElement('audio');

        video.src = URL.createObjectURL(videoFile);
        audio.src = URL.createObjectURL(audioFile);

        // Wait for both media to load
        await Promise.all([
            new Promise(resolve => video.addEventListener('loadedmetadata', resolve)),
            new Promise(resolve => audio.addEventListener('loadedmetadata', resolve))
        ]);

        // Create media sources and gain nodes
        videoSource = audioContext.createMediaElementSource(video);
        audioSource = audioContext.createMediaElementSource(audio);

        videoGain = audioContext.createGain();
        audioGain = audioContext.createGain();

        // Set initial gain values
        videoGain.gain.value = videoVolume.value / 100;
        audioGain.gain.value = audioVolume.value / 100;

        // Create destination for mixed audio
        const audioDestination = audioContext.createMediaStreamDestination();

        // Connect audio graph
        videoSource.connect(videoGain).connect(audioDestination);
        audioSource.connect(audioGain).connect(audioDestination);

        // Create canvas for video
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Create media stream from canvas
        const canvasStream = canvas.captureStream();

        // Create final media stream with video and mixed audio
        const outputStream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...audioDestination.stream.getAudioTracks()
        ]);

        // Set up media recorder
        mediaRecorder = new MediaRecorder(outputStream, {
            mimeType: 'video/webm;codecs=vp8,opus',
            videoBitsPerSecond: 2500000,
            audioBitsPerSecond: 128000
        });

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                recordedChunks.push(e.data);
            }
        };

        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `merged-video-${Date.now()}.webm`;
            a.click();

            // Cleanup
            setTimeout(() => {
                URL.revokeObjectURL(url);
                recordedChunks = [];
                video.remove();
                audio.remove();
                canvas.remove();
                if (audioContext) {
                    audioContext.close();
                    audioContext = null;
                }
                progressBar.style.display = 'none';
            }, 100);
        };

        // Start recording
        mediaRecorder.start(1000);

        // Start playback
        video.play();
        audio.play();

        // Update canvas with video frames
        function drawVideo() {
            if (video.ended || audio.ended) {
                mediaRecorder.stop();
                return;
            }

            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Update progress
            const videoProgress = (video.currentTime / video.duration) * 100;
            progress.style.width = `${videoProgress}%`;

            requestAnimationFrame(drawVideo);
        }

        drawVideo();

        // Preview functionality
        previewVideo.src = URL.createObjectURL(videoFile);
        previewVideo.onloadedmetadata = () => {
            // Set up preview video with new audio
            const previewAudioContext = new AudioContext();
            const previewVideoSource = previewAudioContext.createMediaElementSource(previewVideo);
            const previewAudioElement = new Audio(URL.createObjectURL(audioFile));
            const previewAudioSource = previewAudioContext.createMediaElementSource(previewAudioElement);

            const previewVideoGain = previewAudioContext.createGain();
            const previewAudioGain = previewAudioContext.createGain();

            previewVideoGain.gain.value = videoVolume.value / 100;
            previewAudioGain.gain.value = audioVolume.value / 100;

            previewVideoSource.connect(previewVideoGain).connect(previewAudioContext.destination);
            previewAudioSource.connect(previewAudioGain).connect(previewAudioContext.destination);

            previewVideo.onplay = () => previewAudioElement.play();
            previewVideo.onpause = () => previewAudioElement.pause();
            previewVideo.onseeked = () => {
                previewAudioElement.currentTime = previewVideo.currentTime;
            };
        };

    } catch (error) {
        console.error('Error merging files:', error);
        alert('Error merging files. Please try again.');
        progressBar.style.display = 'none';
    }
}

// File input preview handlers
videoFileInput.addEventListener('change', () => {
    const file = videoFileInput.files[0];
    if (file) {
        previewVideo.src = URL.createObjectURL(file);
    }
});

mergeBtn.addEventListener('click', mergeFiles);

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (audioContext) {
        audioContext.close();
    }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
});
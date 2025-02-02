const videoFileInput = document.getElementById('videoFile');
const extractBtn = document.getElementById('extractBtn');
const progressBar = document.getElementById('progressBar');
const progress = document.getElementById('progress');

document.getElementById('videoFile').addEventListener('change', function (e) {
    const fileName = e.target.files[0]?.name || 'No file chosen';
    const label = e.target.previousElementSibling;
    label.classList.toggle('has-file', e.target.files.length > 0);

    // Update or create file name element
    let fileNameElement = label.querySelector('.file-name');
    if (!fileNameElement) {
        fileNameElement = document.createElement('span');
        fileNameElement.className = 'file-name';
        label.appendChild(fileNameElement);
    }
    fileNameElement.textContent = fileName;
});

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

        // Wait for video metadata to load
        await new Promise((resolve) => {
            video.addEventListener('loadedmetadata', resolve);
        });

        // Create media source and destination
        const mediaElement = audioContext.createMediaElementSource(video);
        const destination = audioContext.createMediaStreamDestination();
        mediaElement.connect(destination);

        // Set up audio recorder
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
                audioContext.close();
            }, 100);
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
        };

    } catch (error) {
        console.error('Error extracting audio:', error);
        alert('Error extracting audio. Please try again.');
        progressBar.style.display = 'none';
    }
}

extractBtn.addEventListener('click', extractAudio);
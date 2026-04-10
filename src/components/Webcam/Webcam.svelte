<script>
    import { onMount, onDestroy } from 'svelte';

    const CAMERA_KEY = 'webcam-device';
    let videoElement;
    let stream = null;
    let error = $state(null);
    let cameras = $state([]);
    let selectedDeviceId = $state(localStorage.getItem(CAMERA_KEY) || '');

    async function enumerateCameras() {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        const devices = await navigator.mediaDevices.enumerateDevices();
        cameras = devices.filter(d => d.kind === 'videoinput');
    }

    async function startWebcam(deviceId) {
        if (!navigator.mediaDevices?.getUserMedia) {
            error = window.isSecureContext
                ? 'Your browser does not support camera access'
                : 'Camera access requires localhost or HTTPS';
            return;
        }

        stopWebcam();
        error = null;

        try {
            const constraints = {
                video: deviceId
                    ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
                    : { width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: false
            };

            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Camera access request timed out')), 10000);
            });

            stream = await Promise.race([
                navigator.mediaDevices.getUserMedia(constraints),
                timeoutPromise
            ]);

            if (videoElement) {
                videoElement.srcObject = stream;
                await videoElement.play();
            }

            // Re-enumerate after permission is granted to get labels
            await enumerateCameras();
        } catch (err) {
            error = err.message || 'Failed to access camera';
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                stream = null;
            }
        }
    }

    function stopWebcam() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
        if (videoElement) {
            videoElement.srcObject = null;
        }
    }

    function selectCamera(deviceId) {
        selectedDeviceId = deviceId;
        localStorage.setItem(CAMERA_KEY, deviceId);
        startWebcam(deviceId);
    }

    async function handleDeviceChange() {
        await enumerateCameras();

        // If the current camera disappeared, switch to the first available
        if (stream) {
            const track = stream.getVideoTracks()[0];
            if (!track || track.readyState === 'ended') {
                const fallback = cameras.length > 0 ? cameras[0].deviceId : '';
                selectCamera(fallback);
            }
        }
    }

    onMount(() => {
        enumerateCameras();
        startWebcam(selectedDeviceId);
        navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);
    });

    onDestroy(() => {
        stopWebcam();
        navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange);
    });
</script>

<div class="webcam-container">
    <video
        bind:this={videoElement}
        autoplay
        playsinline
        muted
    ></video>

    {#if cameras.length > 1}
        <select
            class="camera-select"
            value={selectedDeviceId}
            onchange={(e) => selectCamera(e.target.value)}
        >
            {#each cameras as camera, i}
                <option value={camera.deviceId}>
                    {camera.label?.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, '') || `Camera ${i + 1}`}
                </option>
            {/each}
        </select>
    {/if}

    {#if error}
        <div class="message error">
            <h2>Webcam Access Error</h2>
            <p>{error}</p>
            <p class="hint">Please ensure you've granted camera permissions in your browser.</p>
        </div>
    {/if}
</div>

<style>
    .webcam-container {
        flex: 1;
        background: #000;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        overflow: hidden;
    }

    video {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .camera-select {
        position: absolute;
        top: 12px;
        left: 12px;
        z-index: 10;
        background: rgba(0, 0, 0, 0.2);
        color: #eee;
        backdrop-filter: blur(10px);
    }

    .camera-select:hover {
        background: rgba(0, 0, 0, 0.5);
        color: #fff;
    }

    .camera-select:focus {
        outline: none;
    }

    .message {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
        color: #ff6b6b;
        padding: 40px;
        background: rgba(13, 13, 13, 0.9);
        border-radius: 8px;
        z-index: 5;
    }

    .message h2 {
        margin: 0 0 16px 0;
        font-size: 24px;
        font-weight: 500;
    }

    .message p {
        margin: 8px 0;
        font-size: 14px;
        line-height: 1.5;
    }

    .message .hint {
        margin-top: 16px;
        font-size: 12px;
        color: #666;
    }
</style>

<script>
    import { onMount, onDestroy } from 'svelte';

    const CAMERA_KEY = 'webcam-device';
    const ZOOM_KEY = 'webcam-zoom';
    const PAN_X_KEY = 'webcam-pan-x';
    const PAN_Y_KEY = 'webcam-pan-y';

    const MIN_ZOOM = 1;
    const MAX_ZOOM = 3;

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function readStoredNumber(key, fallback) {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        const parsed = Number.parseFloat(raw);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    let videoElement;
    let stream = null;
    let error = $state(null);
    let cameras = $state([]);
    let selectedDeviceId = $state(localStorage.getItem(CAMERA_KEY) || '');
    let zoom = $state(clamp(readStoredNumber(ZOOM_KEY, 1), MIN_ZOOM, MAX_ZOOM));
    let panX = $state(clamp(readStoredNumber(PAN_X_KEY, 0), -50, 50));
    let panY = $state(clamp(readStoredNumber(PAN_Y_KEY, 0), -50, 50));
    let isDragging = $state(false);
    let dragPointerId = null;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragStartPanX = 0;
    let dragStartPanY = 0;

    $effect(() => {
        localStorage.setItem(ZOOM_KEY, `${zoom}`);
    });

    $effect(() => {
        localStorage.setItem(PAN_X_KEY, `${panX}`);
    });

    $effect(() => {
        localStorage.setItem(PAN_Y_KEY, `${panY}`);
    });

    function startDrag(event) {
        isDragging = true;
        dragPointerId = event.pointerId;
        dragStartX = event.clientX;
        dragStartY = event.clientY;
        dragStartPanX = panX;
        dragStartPanY = panY;
        event.currentTarget.setPointerCapture(event.pointerId);
    }

    function handleDrag(event) {
        if (!isDragging || dragPointerId !== event.pointerId) return;

        const deltaX = event.clientX - dragStartX;
        const deltaY = event.clientY - dragStartY;
        const dragSensitivity = 0.08;

        panX = clamp(dragStartPanX - (deltaX * dragSensitivity), -50, 50);
        panY = clamp(dragStartPanY - (deltaY * dragSensitivity), -50, 50);
    }

    function endDrag(event) {
        if (dragPointerId !== event.pointerId) return;
        isDragging = false;
        dragPointerId = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    }

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
        style={`object-position: ${50 + panX}% ${50 + panY}%; transform: scale(${zoom});`}
        class:dragging={isDragging}
        autoplay
        playsinline
        muted
        onpointerdown={startDrag}
        onpointermove={handleDrag}
        onpointerup={endDrag}
        onpointercancel={endDrag}
    ></video>

    <div class="top-fade" aria-hidden="true"></div>

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

    <input
        class="zoom-slider"
        type="range"
        min={MIN_ZOOM}
        max={MAX_ZOOM}
        step="0.01"
        value={zoom}
        oninput={(e) => zoom = clamp(Number.parseFloat(e.target.value), MIN_ZOOM, MAX_ZOOM)}
        aria-label="Zoom webcam"
        title="Zoom"
    />

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
        transform-origin: center center;
        cursor: grab;
        touch-action: none;
        user-select: none;
        -webkit-user-drag: none;
    }

    video.dragging {
        cursor: grabbing;
    }

    .top-fade {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 200px;
        background: linear-gradient(to bottom, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0) 100%);
        pointer-events: none;
        z-index: 2;
    }

    .camera-select {
        position: absolute;
        top: 12px;
        left: 12px;
        z-index: 10;
        background-color: rgba(0, 0, 0, 0.2);
        color: #eee;
        backdrop-filter: blur(10px);
    }

    .camera-select:hover {
        background-color: rgba(0, 0, 0, 0.5);
        color: #fff;
    }

    .camera-select:focus {
        outline: none;
    }

    .zoom-slider {
        position: absolute;
        top: 12px;
        right: 12px;
        z-index: 10;
        width: 90px;
        appearance: none;
        -webkit-appearance: none;
        height: 4px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.55);
        filter: drop-shadow(0 0 8px rgba(0, 0, 0, 0.45));
    }

    .zoom-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #000;
        border: 1px solid rgba(255, 255, 255, 0.7);
    }

    .zoom-slider::-moz-range-thumb {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #000;
        border: 1px solid rgba(255, 255, 255, 0.7);
    }

    .zoom-slider::-moz-range-track {
        height: 4px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.55);
    }

    @media (max-width: 700px) {
        .zoom-slider {
            width: 84px;
            right: 12px;
        }
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

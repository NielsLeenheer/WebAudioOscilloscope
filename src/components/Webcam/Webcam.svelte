<script>
    import { onDestroy } from 'svelte';
    import PowerButton from '../Common/PowerButton.svelte';

    let videoElement;
    let stream = null;
    let error = null;
    let isLoading = false;
    let isPowered = $state(false);

    async function startWebcam() {
        console.log('Starting webcam...');

        // Check if getUserMedia is supported
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.error('getUserMedia not supported');
            error = 'Your browser does not support camera access';
            isPowered = false;
            return;
        }

        isLoading = true;
        error = null;

        try {
            console.log('Requesting webcam access...');

            // Add timeout to prevent hanging
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Camera access request timed out')), 10000);
            });

            const getUserMediaPromise = navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                },
                audio: false
            });

            stream = await Promise.race([getUserMediaPromise, timeoutPromise]);
            console.log('Webcam access granted', stream);

            if (videoElement) {
                videoElement.srcObject = stream;
                await videoElement.play();
                isLoading = false;
                console.log('Video playing');
            } else {
                console.error('Video element not found');
                error = 'Video element not initialized';
                isLoading = false;
                isPowered = false;
            }
        } catch (err) {
            console.error('Error accessing webcam:', err);
            error = err.message || 'Failed to access camera';
            isLoading = false;
            isPowered = false;

            // Clean up stream if it was created
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                stream = null;
            }
        }
    }

    function stopWebcam() {
        console.log('Stopping webcam...');
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
        if (videoElement) {
            videoElement.srcObject = null;
        }
        error = null;
        isLoading = false;
    }

    onDestroy(() => {
        console.log('Webcam component destroyed');
        stopWebcam();
    });

    // React to power state changes
    $effect(() => {
        if (isPowered) {
            startWebcam();
        } else {
            stopWebcam();
        }
    });
</script>

<div class="webcam">
    <header>
        <PowerButton variant="dark" bind:isPowered />
        <h1>Camera</h1>
    </header>

    <div class="webcam-container">
        <video
            bind:this={videoElement}
            autoplay
            playsinline
            muted
        ></video>

        {#if isLoading}
            <div class="message">
                <p>Requesting webcam access...</p>
            </div>
        {:else if error}
            <div class="message error">
                <h2>Webcam Access Error</h2>
                <p>{error}</p>
                <p class="hint">Please ensure you've granted camera permissions in your browser.</p>
            </div>
        {/if}
    </div>
</div>

<style>
    .webcam {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #0d0d0d;
        position: relative;
    }

    header {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        z-index: 10;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 15px 20px;
        background: rgba(26, 26, 26, 0.7);
        backdrop-filter: blur(10px);
        border-bottom: 1px solid rgba(51, 51, 51, 0.5);
    }

    h1 {
        margin: 0;
        color: rgba(255, 255, 255, 0.3);
        font-size: 1.5em;
        margin-left: 0.5em;
    }

    .webcam-container {
        width: 100%;
        height: 100%;
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

    .message {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
        color: #888;
        padding: 40px;
        background: rgba(13, 13, 13, 0.9);
        border-radius: 8px;
        z-index: 5;
    }

    .message.error {
        color: #ff6b6b;
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

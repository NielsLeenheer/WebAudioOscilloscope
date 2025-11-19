<script>
    import { onMount, onDestroy } from 'svelte';

    let videoElement;
    let stream = null;
    let error = null;
    let isLoading = true;

    onMount(async () => {
        console.log('Webcam component mounted');

        // Check if getUserMedia is supported
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.error('getUserMedia not supported');
            error = 'Your browser does not support camera access';
            isLoading = false;
            return;
        }

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
            }
        } catch (err) {
            console.error('Error accessing webcam:', err);
            error = err.message || 'Failed to access camera';
            isLoading = false;

            // Clean up stream if it was created
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                stream = null;
            }
        }
    });

    onDestroy(() => {
        console.log('Webcam component destroyed');
        // Clean up webcam stream
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
    });
</script>

<div class="webcam-container">
    <video
        bind:this={videoElement}
        autoplay
        playsinline
        muted
        style:display={isLoading || error ? 'none' : 'block'}
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
    {:else}
        <div class="label">Real Oscilloscope - Camera Feed</div>
    {/if}
</div>

<style>
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
        object-fit: contain;
    }

    .message {
        text-align: center;
        color: #888;
        padding: 40px;
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

    .label {
        position: absolute;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.7);
        color: #4CAF50;
        padding: 8px 16px;
        border-radius: 4px;
        font-family: system-ui;
        font-size: 12px;
        font-weight: 500;
        pointer-events: none;
    }
</style>

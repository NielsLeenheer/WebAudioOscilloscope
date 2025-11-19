<script>
    import { onMount, onDestroy } from 'svelte';

    let videoElement;
    let stream = null;
    let error = null;
    let isLoading = true;

    onMount(async () => {
        try {
            // Request webcam access
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    facingMode: 'user'
                },
                audio: false
            });

            if (videoElement) {
                videoElement.srcObject = stream;
                videoElement.play();
                isLoading = false;
            }
        } catch (err) {
            console.error('Error accessing webcam:', err);
            error = err.message;
            isLoading = false;
        }
    });

    onDestroy(() => {
        // Clean up webcam stream
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
    });
</script>

<div class="webcam-container">
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
        <video
            bind:this={videoElement}
            autoplay
            playsinline
            muted
        ></video>
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

<script>
    import { onMount, onDestroy } from 'svelte';
    import Preview from '../../Common/Preview.svelte';
    import Card from '../../Common/Card.svelte';
    import { createTextScroller } from '../../../utils/textGenerator.js';

    let { audioEngine, frameProcessor, isActive = false } = $props();

    // Text settings
    let text = $state('Hello World!');
    let speed = $state(0.5);
    let scale = $state(0.3);

    // Animation state - not reactive, managed manually
    let scroller = createTextScroller(text, {
        speed,
        scale,
        charSpacing: 0.2,
        pointDensity: 50
    });
    let animationInterval = null;
    let previewPoints = $state(scroller.getPoints());
    let previewInterval = null;

    // Listen for processed preview updates (e.g. settings changes that re-process cached frame)
    $effect(() => {
        if (isActive) {
            frameProcessor.onPreviewUpdate = () => {
                if (frameProcessor.processedPreview) {
                    previewPoints = frameProcessor.processedPreview;
                }
            };
            return () => {
                frameProcessor.onPreviewUpdate = null;
            };
        }
    });

    // Start/stop animation when tab becomes active
    $effect(() => {
        if (isActive) {
            startAnimation();
        } else {
            stopAnimation();
        }
    });

    // Update preview animation
    onMount(() => {
        // Preview animation runs at lower rate
        const previewFPS = 30;
        const previewDelta = 1 / previewFPS;

        previewInterval = setInterval(() => {
            // Animation loop handles scroller.update() and frame processing.
            // This loop just reads the latest processed preview for display.
            if (scroller && isActive) {
                if (frameProcessor.processedPreview) {
                    previewPoints = frameProcessor.processedPreview;
                }
            }
        }, 1000 / previewFPS);
    });

    onDestroy(() => {
        stopAnimation();
        if (previewInterval) {
            clearInterval(previewInterval);
            previewInterval = null;
        }
    });

    function startAnimation() {
        if (animationInterval) return;

        // Reset scroller position
        if (scroller) {
            scroller.reset();
        }

        // Animation runs at higher rate for smooth audio
        const fps = 30;
        let lastTime = performance.now();

        animationInterval = setInterval(() => {
            if (!scroller) {
                stopAnimation();
                return;
            }

            const now = performance.now();
            const actualDelta = (now - lastTime) / 1000;
            lastTime = now;

            const points = scroller.update(actualDelta);

            if (points.length > 0) {
                // Text scroller returns flat points, wrap as single segment
                const segments = Array.isArray(points[0]?.[0]) ? points : [points];
                frameProcessor.processFrame(segments);

                // Share points with preview (use processed output when available)
                previewPoints = frameProcessor.processedPreview ?? points;
            }
        }, 1000 / fps);
    }

    function stopAnimation() {
        if (animationInterval) {
            clearInterval(animationInterval);
            animationInterval = null;
        }
    }

    // Update scroller when settings change
    function handleSettingsChange() {
        scroller.setOptions({ speed, scale });
    }

    // Update scroller when text changes
    function handleTextChange() {
        scroller.setText(text);
        scroller.setOptions({ speed, scale });
    }
</script>

<div class="text-container">
    <div class="preview-wrapper">
        <Preview points={previewPoints} width={200} height={200} />
    </div>

    <Card title="Scrolling Text">
        <div class="controls">
            <div class="input-group">
                <label for="textInput">Text</label>
                <input
                    type="text"
                    id="textInput"
                    bind:value={text}
                    oninput={handleTextChange}
                    placeholder="Enter text to scroll..."
                >
            </div>

            <div class="slider-group">
                <label for="speedSlider">Speed: {speed.toFixed(2)}</label>
                <input
                    type="range"
                    id="speedSlider"
                    bind:value={speed}
                    oninput={handleSettingsChange}
                    min="0.1"
                    max="2"
                    step="0.05"
                >
            </div>

            <div class="slider-group">
                <label for="scaleSlider">Size: {scale.toFixed(2)}</label>
                <input
                    type="range"
                    id="scaleSlider"
                    bind:value={scale}
                    oninput={handleSettingsChange}
                    min="0.1"
                    max="0.8"
                    step="0.05"
                >
            </div>
        </div>
    </Card>
</div>

<style>
    .text-container {
        padding: 40px;
        display: flex;
        flex-direction: column;
        gap: 20px;
    }

    .preview-wrapper {
        display: flex;
        justify-content: center;
    }

    .controls {
        display: flex;
        flex-direction: column;
        gap: 20px;
    }

    .input-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .input-group label {
        font-size: 11px;
        font-weight: 600;
        color: #666;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .input-group input[type="text"] {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 14px;
        font-family: inherit;
        box-sizing: border-box;
    }

    .input-group input[type="text"]:focus {
        outline: none;
        border-color: #03a9f4;
        box-shadow: 0 0 0 2px rgba(3, 169, 244, 0.2);
    }

    .slider-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .slider-group label {
        font-size: 11px;
        font-weight: 600;
        color: #666;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .slider-group input[type="range"] {
        width: 100%;
    }
</style>

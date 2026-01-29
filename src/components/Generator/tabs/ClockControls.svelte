<script>
    import { onMount, onDestroy } from 'svelte';
    import Preview from '../../Common/Preview.svelte';
    import Card from '../../Common/Card.svelte';
    import { generateClockPoints } from '../../../utils/shapes.js';

    let { audioEngine, frameProcessor, isActive = false } = $props();

    let showFace = $state(true);
    let showTicks = $state(false);

    let clockPoints = $state(generateClockPoints(showFace, showTicks));
    let previewInterval;
    let clockInterval = null;

    // Listen for processed preview updates (e.g. settings changes that re-process cached frame)
    $effect(() => {
        if (isActive) {
            frameProcessor.onPreviewUpdate = () => {
                if (frameProcessor.processedPreview) {
                    clockPoints = frameProcessor.processedPreview;
                }
            };
            return () => {
                frameProcessor.onPreviewUpdate = null;
            };
        }
    });

    // Update clock preview every second
    onMount(() => {
        previewInterval = setInterval(() => {
            const raw = generateClockPoints(showFace, showTicks);
            // Use processed preview when playing, raw when not
            clockPoints = frameProcessor.processedPreview ?? raw;
        }, 1000);
    });

    onDestroy(() => {
        if (previewInterval) {
            clearInterval(previewInterval);
        }
        stopClockAudio();
    });

    function startClockAudio() {
        stopClockAudio();

        const sendClock = () => {
            const points = generateClockPoints(showFace, showTicks);
            // Clock generates flat points, wrap as single segment
            const segments = Array.isArray(points[0]?.[0]) ? points : [points];
            frameProcessor.processFrame(segments);
        };

        sendClock();
        clockInterval = setInterval(() => {
            sendClock();
        }, 1000);
    }

    function stopClockAudio() {
        if (clockInterval) {
            clearInterval(clockInterval);
            clockInterval = null;
        }
    }

    // Start/stop clock audio when tab becomes active
    $effect(() => {
        if (isActive) {
            startClockAudio();
        } else {
            stopClockAudio();
        }
    });

    // Update clock when settings change
    $effect(() => {
        showFace;
        showTicks;

        clockPoints = generateClockPoints(showFace, showTicks);

        if (isActive) {
            startClockAudio();
        }
    });
</script>

<div class="clock-container">
    <div class="preview-wrapper">
        <Preview points={clockPoints} width={200} height={200} />
    </div>

    <Card title="Clock">
        <div class="options-grid">
            <div class="option-item">
                <input type="checkbox" id="showFace" bind:checked={showFace}>
                <label for="showFace">Clock face</label>
            </div>

            <div class="option-item">
                <input type="checkbox" id="showTicks" bind:checked={showTicks}>
                <label for="showTicks">Hour ticks</label>
            </div>
        </div>
    </Card>
</div>

<style>
    .clock-container {
        padding: 40px;
        display: flex;
        flex-direction: column;
        gap: 20px;
    }

    .preview-wrapper {
        display: flex;
        justify-content: center;
    }

    .options-grid {
        display: grid;
        width: fit-content;
        grid-template-columns: 1fr 1fr;
        gap: 24px;
        justify-self: center;
    }

    .option-item {
        display: flex;
        align-items: center;
        justify-self: center;
        gap: 8px;
    }

    .option-item input[type="checkbox"] {
        width: 18px;
        height: 18px;
        cursor: pointer;
        margin: 0;
    }

    .option-item label {
        font-size: 11px;
        font-weight: 600;
        color: #666;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        cursor: pointer;
        user-select: none;
    }

    .option-item label:hover {
        color: #333;
    }
</style>

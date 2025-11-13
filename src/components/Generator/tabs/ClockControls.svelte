<script>
    import { onMount, onDestroy } from 'svelte';
    import Preview from '../../Common/Preview.svelte';
    import Card from '../../Common/Card.svelte';
    import { generateClockPoints } from '../../../utils/shapes.js';

    let { audioEngine, isActive = false } = $props();
    let isPlaying = audioEngine.isPlaying;

    let showFace = $state(true);
    let showTicks = $state(false);

    let clockPoints = $state(generateClockPoints(showFace, showTicks));
    let updateInterval;

    // Function to generate clock with current settings
    function getClockGenerator() {
        return () => generateClockPoints(showFace, showTicks);
    }

    // Update clock preview every second
    onMount(() => {
        updateInterval = setInterval(() => {
            clockPoints = generateClockPoints(showFace, showTicks);
        }, 1000);
    });

    onDestroy(() => {
        if (updateInterval) {
            clearInterval(updateInterval);
        }
    });

    // Update clock when tab becomes active
    $effect(() => {
        if ($isPlaying && isActive) {
            audioEngine.startClock(getClockGenerator());
        }
    });

    // Update clock when settings change
    $effect(() => {
        showFace;
        showTicks;

        clockPoints = generateClockPoints(showFace, showTicks);

        if ($isPlaying && isActive) {
            audioEngine.startClock(getClockGenerator());
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
        align-items: center;
        gap: 20px;
    }

    .preview-wrapper {
        display: flex;
        justify-content: center;
    }

    .options-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
    }

    .option-item {
        display: flex;
        align-items: center;
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

<script>
    import { onMount, onDestroy } from 'svelte';
    import Preview from '../../Common/Preview.svelte';
    import { generateClockPoints } from '../../../utils/shapes.js';

    let { audioEngine, isActive = false } = $props();
    let isPlaying = audioEngine.isPlaying;

    let clockPoints = $state(generateClockPoints());
    let updateInterval;

    // Update clock preview every second
    onMount(() => {
        updateInterval = setInterval(() => {
            clockPoints = generateClockPoints();
        }, 1000);
    });

    onDestroy(() => {
        if (updateInterval) {
            clearInterval(updateInterval);
        }
    });

    $effect(() => {
        if ($isPlaying && isActive) {
            audioEngine.startClock(generateClockPoints);
        }
    });
</script>

<div class="clock-container">
    <div class="preview-wrapper">
        <Preview points={clockPoints} width={200} height={200} />
    </div>
</div>

<style>
    .clock-container {
        padding: 20px;
        display: flex;
        justify-content: center;
    }

    .preview-wrapper {
        display: flex;
        justify-content: center;
    }
</style>

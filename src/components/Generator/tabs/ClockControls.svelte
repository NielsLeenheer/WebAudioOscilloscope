<script>
    import Card from '../../Common/Card.svelte';
    import Preview from '../../Common/Preview.svelte';
    import { generateClockPoints } from '../../../utils/shapes.js';

    let { audioEngine } = $props();
    let isPlaying = audioEngine.isPlaying;

    let clockPoints = $state(generateClockPoints());

    $effect(() => {
        if ($isPlaying) {
            audioEngine.startClock(generateClockPoints);
        }
    });
</script>

<div class="clock-container">
    <Card title="Clock">
        <div class="preview-wrapper">
            <Preview points={clockPoints} width={200} height={200} />
        </div>
    </Card>
</div>

<style>
    .clock-container {
        padding: 20px;
    }

    .preview-wrapper {
        display: flex;
        justify-content: center;
    }
</style>

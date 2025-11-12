<script>
    import { generateClockPoints } from '../../../utils/shapes.js';

    let { audioEngine, isPlaying, isActive } = $props();

    $effect(() => {
        if (isActive && isPlaying) {
            audioEngine.startClock(generateClockPoints);
        }
    });
</script>

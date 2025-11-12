<script>
    import { generateClockPoints } from '../../../utils/shapes.js';

    let { audioEngine, isActive } = $props();
    let isPlaying = audioEngine.isPlaying;

    $effect(() => {
        if (isActive && $isPlaying) {
            audioEngine.startClock(generateClockPoints);
        }
    });
</script>

<script>
    import { generateClockPoints } from '../../../utils/shapes.js';

    let { audioEngine, isActive } = $props();

    $effect(() => {
        if (isActive && $audioEngine.isPlaying) {
            audioEngine.startClock(generateClockPoints);
        }
    });
</script>

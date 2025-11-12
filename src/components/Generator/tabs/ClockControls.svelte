<script>
    import { generateClockPoints } from '../../../utils/shapes.js';

    let { audioEngine } = $props();
    let isPlaying = audioEngine.isPlaying;

    $effect(() => {
        if ($isPlaying) {
            audioEngine.startClock(generateClockPoints);
        }
    });
</script>

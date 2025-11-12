<script>
    import { generateClockPoints } from '../../../utils/shapes.js';

    let { audioEngine, isPlaying, isActive } = $props();

    $effect(() => {
        if (isActive && isPlaying) {
            audioEngine.startClock(generateClockPoints);
        }
    });
</script>

<div class="control-group">
    <label>Analog Clock:</label>
    <p style="color: #666; font-size: 14px; margin: 10px 0;">
        Display a working analog clock that shows the current time and automatically updates every second.
    </p>
    <div class="value-display" style="margin-top: 15px;">
        ⏰ The clock displays an outer circle with hour, minute, and second hands. It updates automatically every second until you switch to a different shape or stop the audio.
    </div>
</div>

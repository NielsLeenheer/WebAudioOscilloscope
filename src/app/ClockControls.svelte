<script>
    import { generateClockPoints } from '../utils/shapes.js';

    let { audioEngine, isPlaying } = $props();

    function startClock() {
        if (!isPlaying) return;
        audioEngine.startClock(generateClockPoints);
    }
</script>

<div class="control-group">
    <label>Analog Clock:</label>
    <p style="color: #666; font-size: 14px; margin: 10px 0;">
        Display a working analog clock that shows the current time and automatically updates every second.
    </p>
    <button onclick={() => startClock()} style="font-size: 16px; padding: 15px 30px;">
        Start Clock
    </button>
    <div class="value-display" style="margin-top: 15px;">
        ⏰ The clock displays an outer circle with hour, minute, and second hands. It updates automatically every second until you switch to a different shape or stop the audio.
    </div>
</div>

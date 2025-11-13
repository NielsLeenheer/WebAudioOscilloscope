<script>
    import Card from '../../Common/Card.svelte';

    let { audioEngine, svgAnimationFPS = $bindable(30), svgSamplePoints = $bindable(200), svgOptimizeSegments = $bindable(true), svgDoubleDraw = $bindable(true) } = $props();

    let frequency = $state(100);
    let volume = $state(30);
    let rotation = $state(0);

    function updateFrequency(value) {
        frequency = value;
        audioEngine.setDefaultFrequency(value);
    }

    function updateVolume(value) {
        volume = value;
        audioEngine.setVolume(value);
    }

    function updateRotation(value) {
        rotation = value;
        audioEngine.setRotation(value);
    }
</script>

<div class="settings-container">
    <Card title="Output">
        <div class="card-controls">
            <div class="control-group">
                <label for="frequency" class="clickable" onclick={() => updateFrequency(100)}>Frequency</label>
                <input
                    type="range"
                    id="frequency"
                    min="20"
                    max="500"
                    value={frequency}
                    step="1"
                    oninput={(e) => updateFrequency(e.target.value)}
                >
                <span class="value">{frequency} Hz</span>
                <div class="value-display">Lower = slower drawing, Higher = brighter but more flickery</div>
            </div>

            <div class="control-group">
                <label for="rotation" class="clickable" onclick={() => updateRotation(0)}>Rotation</label>
                <input
                    type="range"
                    id="rotation"
                    min="0"
                    max="360"
                    value={rotation}
                    step="1"
                    oninput={(e) => updateRotation(e.target.value)}
                >
                <span class="value">{rotation}°</span>
                <div class="value-display">Rotate the output signal clockwise</div>
            </div>

            <div class="control-group">
                <label for="volume" class="clickable" onclick={() => updateVolume(30)}>Volume</label>
                <input
                    type="range"
                    id="volume"
                    min="0"
                    max="100"
                    value={volume}
                    step="1"
                    oninput={(e) => updateVolume(e.target.value)}
                >
                <span class="value">{volume}%</span>
                <div class="value-display">Adjust based on your oscilloscope's sensitivity</div>
            </div>
        </div>
    </Card>

    <Card title="SVG">
        <div class="card-controls">
            <div class="control-group">
                <label for="svgSamplePoints" class="clickable" onclick={() => svgSamplePoints = 200}>Sample Points</label>
                <input
                    type="range"
                    id="svgSamplePoints"
                    min="50"
                    max="1000"
                    bind:value={svgSamplePoints}
                    step="50"
                >
                <span class="value">{svgSamplePoints}</span>
                <div class="value-display">Number of points sampled from SVG paths</div>
            </div>

            <div class="control-group">
                <label for="svgAnimationFPS" class="clickable" onclick={() => svgAnimationFPS = 30}>Sampling rate</label>
                <input
                    type="range"
                    id="svgAnimationFPS"
                    min="10"
                    max="60"
                    bind:value={svgAnimationFPS}
                    step="5"
                >
                <span class="value">{svgAnimationFPS} FPS</span>
                <div class="value-display">Frame rate for sampling CSS animations in SVG tab</div>
            </div>

            <div class="control-group checkbox-group">
                <label for="svgOptimizeSegments">Optimize segments</label>
                <input
                    type="checkbox"
                    id="svgOptimizeSegments"
                    bind:checked={svgOptimizeSegments}
                >
                <span></span>
                <div class="value-display">Reorder segments to minimize jump distances</div>
            </div>

            <div class="control-group checkbox-group">
                <label for="svgDoubleDraw">Double draw</label>
                <input
                    type="checkbox"
                    id="svgDoubleDraw"
                    bind:checked={svgDoubleDraw}
                >
                <span></span>
                <div class="value-display">Draw each segment forward and back to minimize beam travel</div>
            </div>
        </div>
    </Card>
</div>

<style>
    .settings-container {
        display: flex;
        flex-direction: column;
        gap: 15px;
    }

    .card-controls {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .control-group {
        display: grid;
        grid-template-columns: 104px 1fr 50px;
        align-items: center;
        gap: 0 12px;
        margin: 0;
        padding: 0;
    }

    .control-group label {
        font-size: 11px;
        font-weight: 600;
        color: #666;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        white-space: nowrap;
        text-align: right;
        margin: 0;
        padding: 0;
    }

    .control-group label.clickable {
        cursor: pointer;
        user-select: none;
    }

    .control-group label.clickable:hover {
        color: #333;
    }

    .control-group .value {
        font-size: 9pt;
        color: #666;
        white-space: nowrap;
        text-align: left;
    }

    .control-group input[type="range"] {
        width: 100%;
    }

    .value-display {
        grid-column: 2 / 4;
        font-size: 11px;
        color: #999;
        font-style: italic;
        margin-top: 0;
    }

    .checkbox-group {
        grid-template-columns: 104px auto 1fr;
        margin-top: 8px;
    }

    .checkbox-group input[type="checkbox"] {
        width: 18px;
        height: 18px;
        cursor: pointer;
        margin: 0;
    }

    .checkbox-group label {
        cursor: pointer;
        user-select: none;
    }

    .checkbox-group .value-display {
        grid-column: 2 / 4;
    }
</style>

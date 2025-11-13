<script>
    import Card from '../../Common/Card.svelte';

    let { audioEngine, svgAnimationFPS = $bindable(30), svgSamplePoints = $bindable(200) } = $props();

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
                <label for="frequency">Frequency</label>
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
                <label for="rotation">Rotation</label>
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
                <label for="volume">Volume</label>
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
                <label for="svgSamplePoints">Sample Points</label>
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
                <label for="svgAnimationFPS">Sampling rate</label>
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
        </div>
    </Card>
</div>

<style>
    .settings-container {
        padding: 40px;
        display: flex;
        flex-direction: column;
        gap: 15px;
    }

    .card-controls {
        padding: 10px;
    }

    .control-group {
        display: grid;
        grid-template-columns: 130px 1fr 70px;
        gap: 0 12px;
        align-items: center;
        margin: 0;
        padding: 4px 12px;
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
        padding: 8px 16px;
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
</style>

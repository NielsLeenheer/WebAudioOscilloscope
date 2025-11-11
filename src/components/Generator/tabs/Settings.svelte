<script>
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

<div class="control-group">
    <label for="frequency">Frequency (Hz): <span>{frequency}</span></label>
    <input
        type="range"
        id="frequency"
        min="20"
        max="500"
        value={frequency}
        step="1"
        oninput={(e) => updateFrequency(e.target.value)}
    >
    <div class="value-display">Lower = slower drawing, Higher = brighter but more flickery</div>
</div>

<div class="control-group">
    <label for="volume">Volume: <span>{volume}</span>%</label>
    <input
        type="range"
        id="volume"
        min="0"
        max="100"
        value={volume}
        step="1"
        oninput={(e) => updateVolume(e.target.value)}
    >
    <div class="value-display">Adjust based on your oscilloscope's sensitivity</div>
</div>

<div class="control-group">
    <label for="rotation">Rotation: <span>{rotation}</span>°</label>
    <input
        type="range"
        id="rotation"
        min="0"
        max="360"
        value={rotation}
        step="1"
        oninput={(e) => updateRotation(e.target.value)}
    >
</div>

<div class="control-group">
    <label for="svgAnimationFPS">SVG Animation FPS: <span>{svgAnimationFPS}</span></label>
    <input
        type="range"
        id="svgAnimationFPS"
        min="10"
        max="60"
        bind:value={svgAnimationFPS}
        step="5"
    >
    <div class="value-display">Frame rate for sampling CSS animations in SVG tab</div>
</div>

<div class="control-group">
    <label for="svgSamplePoints">SVG Sample Points: <span>{svgSamplePoints}</span></label>
    <input
        type="range"
        id="svgSamplePoints"
        min="50"
        max="1000"
        bind:value={svgSamplePoints}
        step="50"
    >
    <div class="value-display">Number of points sampled from SVG paths</div>
</div>

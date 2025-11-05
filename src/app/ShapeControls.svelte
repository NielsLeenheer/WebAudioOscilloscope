<script>
    import {
        generateCircle,
        generateSquare,
        generateTriangle,
        generateStar,
        generateHeart,
        generateSpiral,
        generateLissajous
    } from '../utils/shapes.js';

    let { audioEngine, isPlaying } = $props();

    let lissX = $state(3);
    let lissY = $state(2);

    function drawShape(shapeGenerator) {
        if (!isPlaying) return;
        const points = shapeGenerator();
        audioEngine.createWaveform(points);
    }
</script>

<div class="control-group">
    <label>Select Shape:</label>
    <div class="shapes-grid">
        <button onclick={() => drawShape(generateCircle)}>Circle</button>
        <button onclick={() => drawShape(generateSquare)}>Square</button>
        <button onclick={() => drawShape(generateTriangle)}>Triangle</button>
        <button onclick={() => drawShape(generateStar)}>Star</button>
        <button onclick={() => drawShape(generateHeart)}>Heart</button>
        <button onclick={() => drawShape(generateSpiral)}>Spiral</button>
        <button onclick={() => drawShape(() => generateLissajous(3, 2))}>Lissajous 3:2</button>
        <button onclick={() => drawShape(() => generateLissajous(5, 4))}>Lissajous 5:4</button>
    </div>
</div>

<div class="control-group">
    <label>Custom Lissajous:</label>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <div>
            <label for="lissX">X Frequency Ratio:</label>
            <input type="number" id="lissX" bind:value={lissX} min="1" max="10" step="1">
        </div>
        <div>
            <label for="lissY">Y Frequency Ratio:</label>
            <input type="number" id="lissY" bind:value={lissY} min="1" max="10" step="1">
        </div>
    </div>
    <button onclick={() => drawShape(() => generateLissajous(lissX, lissY))} style="margin-top: 10px;">
        Draw Custom
    </button>
</div>

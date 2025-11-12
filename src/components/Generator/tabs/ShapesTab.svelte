<script>
    import Card from '../../Common/Card.svelte';
    import {
        generateCircle,
        generateSquare,
        generateTriangle,
        generateStar,
        generateHeart,
        generateSpiral,
        generateLissajous
    } from '../../../utils/shapes.js';

    let { audioEngine, isPlaying } = $props();

    let lissX = $state(3);
    let lissY = $state(2);

    function drawShape(shapeGenerator) {
        if (!isPlaying) return;
        // Restore Settings tab default frequency before generating
        audioEngine.restoreDefaultFrequency();
        const points = shapeGenerator();
        audioEngine.createWaveform(points);
    }
</script>

<div class="shapes-container">
    <Card title="X/Y Shapes">
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
    </Card>

    <Card title="Custom Lissajous">
        <div class="custom-inputs">
            <div>
                <label for="lissX">X Frequency Ratio:</label>
                <input type="number" id="lissX" bind:value={lissX} min="1" max="10" step="1">
            </div>
            <div>
                <label for="lissY">Y Frequency Ratio:</label>
                <input type="number" id="lissY" bind:value={lissY} min="1" max="10" step="1">
            </div>
        </div>
        <button class="draw-button" onclick={() => drawShape(() => generateLissajous(lissX, lissY))}>
            Draw Custom
        </button>
    </Card>
</div>

<style>
    .shapes-container {
        display: grid;
        grid-template-rows: repeat(2, 1fr);
        gap: 16px;
        padding: 20px;
    }

    .shapes-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
    }

    .shapes-grid button {
        padding: 10px;
        background: #f5f5f5;
        border: 2px solid #ddd;
        border-radius: 4px;
        cursor: pointer;
        font-family: system-ui;
        font-size: 11pt;
        transition: all 0.2s;
    }

    .shapes-grid button:hover {
        background: #e8e8e8;
        border-color: #999;
    }

    .custom-inputs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin-bottom: 16px;
    }

    .custom-inputs label {
        display: block;
        font-size: 12px;
        font-weight: 600;
        color: #666;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 6px;
    }

    .custom-inputs input[type="number"] {
        width: 100%;
        padding: 6px 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-family: system-ui;
        font-size: 11pt;
    }

    .draw-button {
        width: 100%;
        padding: 10px;
        background: #f5f5f5;
        border: 2px solid #ddd;
        border-radius: 4px;
        cursor: pointer;
        font-family: system-ui;
        font-size: 11pt;
        transition: all 0.2s;
    }

    .draw-button:hover {
        background: #e8e8e8;
        border-color: #999;
    }
</style>

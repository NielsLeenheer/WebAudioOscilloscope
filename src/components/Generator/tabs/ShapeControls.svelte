<script>
    import { onMount } from 'svelte';
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

    let frequency = $state(440);
    let leftWave = $state('sine');
    let rightWave = $state('sine');
    let lissX = $state(3);
    let lissY = $state(2);

    function generateWave(type, phase = 0) {
        // Generate ONE complete cycle of the waveform (not 1 second!)
        const samples = 1000; // Use 1000 points for smooth waveform
        const points = [];

        for (let i = 0; i < samples; i++) {
            const t = i / samples; // 0 to 1 over one complete cycle
            let value;

            switch(type) {
                case 'sine':
                    value = Math.sin(2 * Math.PI * t + phase);
                    break;
                case 'square':
                    value = Math.sin(2 * Math.PI * t + phase) >= 0 ? 1 : -1;
                    break;
                case 'sawtooth':
                    value = 2 * (t - Math.floor(t + 0.5));
                    break;
                case 'triangle':
                    value = 4 * Math.abs(t - Math.floor(t + 0.5)) - 1;
                    break;
                default:
                    value = 0;
            }

            points.push(value);
        }

        return points;
    }

    function updateWaves() {
        if (!isPlaying) return;

        // Set the frequency in AudioEngine so it knows what frequency to play at
        audioEngine.setFrequency(frequency);

        const leftPoints = generateWave(leftWave, 0);
        const rightPoints = generateWave(rightWave, 0);

        // Combine left and right into stereo points as [x, y] arrays
        const stereoPoints = leftPoints.map((leftVal, i) => [leftVal, rightPoints[i]]);

        audioEngine.createWaveform(stereoPoints);
    }

    function drawShape(shapeGenerator) {
        if (!isPlaying) return;
        // Shapes use the Settings tab frequency (baseFrequency), not the Wave tab frequency
        const points = shapeGenerator();
        audioEngine.createWaveform(points);
    }

    // Generate default sine wave when component mounts and audio starts playing
    onMount(() => {
        if (isPlaying) {
            updateWaves();
        }
    });

    // Update waves when parameters change and audio is playing
    $effect(() => {
        if (isPlaying) {
            updateWaves();
        }
    });
</script>

<div class="control-group">
    <label>Frequency:</label>
    <div style="display: flex; gap: 10px; align-items: center;">
        <input type="range" bind:value={frequency} min="20" max="2000" step="1" style="flex: 1;">
        <input type="number" bind:value={frequency} min="20" max="2000" step="1" style="width: 80px;">
        <span>Hz</span>
    </div>
</div>

<div class="control-group">
    <label>Left Channel Waveform:</label>
    <div class="wave-grid">
        <button class:active={leftWave === 'sine'} onclick={() => { leftWave = 'sine'; updateWaves(); }}>Sine</button>
        <button class:active={leftWave === 'square'} onclick={() => { leftWave = 'square'; updateWaves(); }}>Square</button>
        <button class:active={leftWave === 'sawtooth'} onclick={() => { leftWave = 'sawtooth'; updateWaves(); }}>Sawtooth</button>
        <button class:active={leftWave === 'triangle'} onclick={() => { leftWave = 'triangle'; updateWaves(); }}>Triangle</button>
    </div>
</div>

<div class="control-group">
    <label>Right Channel Waveform:</label>
    <div class="wave-grid">
        <button class:active={rightWave === 'sine'} onclick={() => { rightWave = 'sine'; updateWaves(); }}>Sine</button>
        <button class:active={rightWave === 'square'} onclick={() => { rightWave = 'square'; updateWaves(); }}>Square</button>
        <button class:active={rightWave === 'sawtooth'} onclick={() => { rightWave = 'sawtooth'; updateWaves(); }}>Sawtooth</button>
        <button class:active={rightWave === 'triangle'} onclick={() => { rightWave = 'triangle'; updateWaves(); }}>Triangle</button>
    </div>
</div>

<div class="control-group">
    <label>X/Y Shapes:</label>
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

<style>
    .wave-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
    }

    .wave-grid button {
        padding: 10px;
        background: #f5f5f5;
        border: 2px solid #ddd;
        border-radius: 4px;
        cursor: pointer;
        font-family: system-ui;
        font-size: 11pt;
        transition: all 0.2s;
    }

    .wave-grid button:hover {
        background: #e8e8e8;
        border-color: #999;
    }

    .wave-grid button.active {
        background: #bbdefb;
        border-color: #1976d2;
        color: #1976d2;
        font-weight: 600;
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
</style>

<script>
    import { onMount } from 'svelte';

    let { audioEngine, isPlaying } = $props();

    let leftFrequency = $state(440);
    let rightFrequency = $state(440);
    let leftWave = $state('sine');
    let rightWave = $state('sine');

    function updateWaves() {
        if (!isPlaying) return;

        // Use the left frequency as the base frequency
        audioEngine.setFrequency(leftFrequency);

        const samples = 1000;

        // Calculate how many cycles to generate for each channel based on frequency ratio
        const frequencyRatio = rightFrequency / leftFrequency;
        const leftCycles = 1;
        const rightCycles = frequencyRatio;

        // Generate waveforms
        const leftPoints = [];
        const rightPoints = [];

        for (let i = 0; i < samples; i++) {
            const t = i / samples;
            leftPoints.push(generateWaveValue(leftWave, t * leftCycles));
            rightPoints.push(generateWaveValue(rightWave, t * rightCycles));
        }

        // Combine left and right into stereo points as [x, y] arrays
        const stereoPoints = leftPoints.map((leftVal, i) => [leftVal, rightPoints[i]]);

        audioEngine.createWaveform(stereoPoints);
    }

    function generateWaveValue(type, cycles) {
        const phase = cycles * 2 * Math.PI;

        switch(type) {
            case 'sine':
                return Math.sin(phase);
            case 'square':
                return Math.sin(phase) >= 0 ? 1 : -1;
            case 'sawtooth':
                const t = cycles - Math.floor(cycles);
                return 2 * (t - 0.5);
            case 'triangle':
                const t2 = cycles - Math.floor(cycles);
                return 4 * Math.abs(t2 - 0.5) - 1;
            default:
                return 0;
        }
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
    <label>Left Channel Frequency:</label>
    <div style="display: flex; gap: 10px; align-items: center;">
        <input type="range" bind:value={leftFrequency} min="20" max="2000" step="1" style="flex: 1;">
        <input type="number" bind:value={leftFrequency} min="20" max="2000" step="1" style="width: 80px;">
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
    <label>Right Channel Frequency:</label>
    <div style="display: flex; gap: 10px; align-items: center;">
        <input type="range" bind:value={rightFrequency} min="20" max="2000" step="1" style="flex: 1;">
        <input type="number" bind:value={rightFrequency} min="20" max="2000" step="1" style="width: 80px;">
        <span>Hz</span>
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
</style>

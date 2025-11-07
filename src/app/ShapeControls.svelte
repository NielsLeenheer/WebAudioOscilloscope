<script>
    let { audioEngine, isPlaying } = $props();

    let frequency = $state(440);
    let leftWave = $state('sine');
    let rightWave = $state('sine');

    function generateWave(type, freq, phase = 0) {
        const sampleRate = 44100;
        const duration = 1; // 1 second loop
        const samples = sampleRate * duration;
        const points = [];

        for (let i = 0; i < samples; i++) {
            const t = i / sampleRate;
            let value;

            switch(type) {
                case 'sine':
                    value = Math.sin(2 * Math.PI * freq * t + phase);
                    break;
                case 'square':
                    value = Math.sin(2 * Math.PI * freq * t + phase) >= 0 ? 1 : -1;
                    break;
                case 'sawtooth':
                    value = 2 * ((freq * t + phase / (2 * Math.PI)) % 1) - 1;
                    break;
                case 'triangle':
                    const sawValue = 2 * ((freq * t + phase / (2 * Math.PI)) % 1) - 1;
                    value = 2 * Math.abs(sawValue) - 1;
                    break;
                default:
                    value = 0;
            }

            points.push({ x: value, y: value });
        }

        return points;
    }

    function updateWaves() {
        if (!isPlaying) return;

        const leftPoints = generateWave(leftWave, frequency, 0);
        const rightPoints = generateWave(rightWave, frequency, 0);

        // Combine left and right into stereo points
        const stereoPoints = leftPoints.map((_, i) => ({
            x: leftPoints[i].x,
            y: rightPoints[i].y
        }));

        audioEngine.createWaveform(stereoPoints);
    }

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

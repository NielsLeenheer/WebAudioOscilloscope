<script>
    import { onMount } from 'svelte';
    import Card from '../../Common/Card.svelte';
    import TabBar from '../../Common/TabBar.svelte';
    import SineIcon from '../../../assets/icons/wave-sine.svg?raw';
    import SquareIcon from '../../../assets/icons/wave-square.svg?raw';
    import SawtoothIcon from '../../../assets/icons/wave-sawtooth.svg?raw';
    import TriangleIcon from '../../../assets/icons/wave-triangle.svg?raw';

    let { audioEngine, isPlaying } = $props();

    const waveTabs = [
        { id: 'sine', label: 'Sine', icon: SineIcon },
        { id: 'square', label: 'Square', icon: SquareIcon },
        { id: 'sawtooth', label: 'Sawtooth', icon: SawtoothIcon },
        { id: 'triangle', label: 'Triangle', icon: TriangleIcon }
    ];

    let leftFrequency = $state(440);
    let rightFrequency = $state(440);
    let leftWave = $state('sine');
    let rightWave = $state('sine');
    let leftPhase = $state(0);
    let rightPhase = $state(0);
    let leftInvert = $state(false);
    let rightInvert = $state(false);

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
            leftPoints.push(generateWaveValue(leftWave, t * leftCycles, leftPhase, leftInvert));
            rightPoints.push(generateWaveValue(rightWave, t * rightCycles, rightPhase, rightInvert));
        }

        // Combine left and right into stereo points as [x, y] arrays
        const stereoPoints = leftPoints.map((leftVal, i) => [leftVal, rightPoints[i]]);

        audioEngine.createWaveform(stereoPoints);
    }

    function generateWaveValue(type, cycles, phaseShift = 0, invert = false) {
        // Apply phase shift (convert degrees to cycles)
        const shiftedCycles = cycles + (phaseShift / 360);
        const phase = shiftedCycles * 2 * Math.PI;

        let value;
        switch(type) {
            case 'sine':
                value = Math.sin(phase);
                break;
            case 'square':
                value = Math.sin(phase) >= 0 ? 1 : -1;
                break;
            case 'sawtooth':
                const t = shiftedCycles - Math.floor(shiftedCycles);
                value = 2 * (t - 0.5);
                break;
            case 'triangle':
                const t2 = shiftedCycles - Math.floor(shiftedCycles);
                value = 4 * Math.abs(t2 - 0.5) - 1;
                break;
            default:
                value = 0;
        }

        // Apply inversion
        return invert ? -value : value;
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

<div class="channels-container">
    <Card title="Left Channel">
        <div class="control-group">
            <label>Frequency:</label>
            <div class="frequency-control">
                <input type="range" bind:value={leftFrequency} min="20" max="2000" step="1">
                <input type="number" bind:value={leftFrequency} min="20" max="2000" step="1">
                <span>Hz</span>
            </div>
        </div>

        <div class="control-group">
            <label>Waveform:</label>
            <TabBar tabs={waveTabs} bind:activeTab={leftWave} />
        </div>

        <div class="control-group">
            <label>Phase Shift:</label>
            <div class="frequency-control">
                <input type="range" bind:value={leftPhase} min="0" max="360" step="1">
                <input type="number" bind:value={leftPhase} min="0" max="360" step="1">
                <span>°</span>
            </div>
        </div>

        <div class="control-group">
            <label class="checkbox-label">
                <input type="checkbox" bind:checked={leftInvert}>
                <span>Invert</span>
            </label>
        </div>
    </Card>

    <Card title="Right Channel">
        <div class="control-group">
            <label>Frequency:</label>
            <div class="frequency-control">
                <input type="range" bind:value={rightFrequency} min="20" max="2000" step="1">
                <input type="number" bind:value={rightFrequency} min="20" max="2000" step="1">
                <span>Hz</span>
            </div>
        </div>

        <div class="control-group">
            <label>Waveform:</label>
            <TabBar tabs={waveTabs} bind:activeTab={rightWave} />
        </div>

        <div class="control-group">
            <label>Phase Shift:</label>
            <div class="frequency-control">
                <input type="range" bind:value={rightPhase} min="0" max="360" step="1">
                <input type="number" bind:value={rightPhase} min="0" max="360" step="1">
                <span>°</span>
            </div>
        </div>

        <div class="control-group">
            <label class="checkbox-label">
                <input type="checkbox" bind:checked={rightInvert}>
                <span>Invert</span>
            </label>
        </div>
    </Card>
</div>

<style>
    .channels-container {
        display: grid;
        grid-template-rows: repeat(2, 1fr);
        gap: 16px;
        padding: 20px;
    }

    .control-group {
        margin: 0;
    }

    .control-group label {
        display: block;
        font-size: 12px;
        font-weight: 600;
        color: #666;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .frequency-control {
        display: flex;
        gap: 10px;
        align-items: center;
    }

    .frequency-control input[type="range"] {
        flex: 1;
    }

    .frequency-control input[type="number"] {
        width: 80px;
        padding: 6px 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-family: system-ui;
        font-size: 11pt;
    }

    .frequency-control span {
        font-size: 11pt;
        color: #666;
    }

    .checkbox-label {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        font-size: 11pt;
        color: #333;
        text-transform: none;
        letter-spacing: normal;
        font-weight: normal;
    }

    .checkbox-label input[type="checkbox"] {
        width: 18px;
        height: 18px;
        cursor: pointer;
    }

    .checkbox-label span {
        user-select: none;
    }
</style>

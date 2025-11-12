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

    // Calculate greatest common divisor
    function gcd(a, b) {
        return b === 0 ? a : gcd(b, a % b);
    }

    function updateWaves() {
        if (!isPlaying) return;

        // Use the left frequency as the base frequency
        audioEngine.setFrequency(leftFrequency);

        const samples = 1000;

        // Calculate cycle counts to ensure complete patterns
        // For clean Lissajous figures, we need integer cycle ratios
        const leftFreqInt = Math.round(leftFrequency);
        const rightFreqInt = Math.round(rightFrequency);
        const divisor = gcd(leftFreqInt, rightFreqInt);

        // Simplify the ratio to smallest integers
        let leftCycles = leftFreqInt / divisor;
        let rightCycles = rightFreqInt / divisor;

        // Limit maximum cycles to keep pattern reasonable
        const maxCycles = 20;
        if (leftCycles > maxCycles || rightCycles > maxCycles) {
            const scale = maxCycles / Math.max(leftCycles, rightCycles);
            leftCycles = Math.max(1, Math.round(leftCycles * scale));
            rightCycles = Math.max(1, Math.round(rightCycles * scale));
        }

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
    <Card>
        <div class="card-grid">
            <div class="wave-selector">
                <TabBar tabs={waveTabs} bind:activeTab={leftWave} />
            </div>

            <div class="controls-row">
                <div class="control-item slider-item">
                    <label>Frequency:</label>
                    <input type="range" bind:value={leftFrequency} min="20" max="2000" step="1">
                    <span class="value-display">{leftFrequency} Hz</span>
                </div>

                <div class="control-item slider-item">
                    <label>Phase Shift:</label>
                    <input type="range" bind:value={leftPhase} min="0" max="360" step="1">
                    <span class="value-display">{leftPhase}°</span>
                </div>

                <div class="control-item checkbox-item">
                    <input type="checkbox" bind:checked={leftInvert}>
                    <label>Invert</label>
                </div>
            </div>
        </div>
    </Card>

    <Card>
        <div class="card-grid">
            <div class="wave-selector">
                <TabBar tabs={waveTabs} bind:activeTab={rightWave} />
            </div>

            <div class="controls-row">
                <div class="control-item slider-item">
                    <label>Frequency:</label>
                    <input type="range" bind:value={rightFrequency} min="20" max="2000" step="1">
                    <span class="value-display">{rightFrequency} Hz</span>
                </div>

                <div class="control-item slider-item">
                    <label>Phase Shift:</label>
                    <input type="range" bind:value={rightPhase} min="0" max="360" step="1">
                    <span class="value-display">{rightPhase}°</span>
                </div>

                <div class="control-item checkbox-item">
                    <input type="checkbox" bind:checked={rightInvert}>
                    <label>Invert</label>
                </div>
            </div>
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

    .card-grid {
        display: grid;
        grid-template-rows: auto 1fr;
        gap: 20px;
    }

    .wave-selector {
        display: flex;
        justify-content: center;
    }

    .controls-row {
        display: grid;
        grid-template-columns: 1fr 1fr auto;
        gap: 8px 36px;
        width: 100%;
    }

    .control-item {
        display: grid;
        align-items: center;
        gap: 8px;
    }

    .slider-item {
        grid-template-columns: auto 1fr auto;
    }

    .checkbox-item {
        grid-template-columns: auto 1fr;
        justify-items: start;
    }

    .control-item label {
        font-size: 11px;
        font-weight: 600;
        color: #666;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        white-space: nowrap;
    }

    .control-item input[type="range"] {
        width: 100%;
    }

    .value-display {
        font-size: 9pt;
        color: #666;
        white-space: nowrap;
        margin: 0;
    }

    .checkbox-item input[type="checkbox"] {
        width: 18px;
        height: 18px;
        cursor: pointer;
    }

    .checkbox-item label {
        cursor: pointer;
        user-select: none;
    }
</style>

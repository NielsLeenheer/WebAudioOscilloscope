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
    </Card>
</div>

<style>
    .channels-container {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 16px;
        padding: 16px;
    }

    .control-group {
        margin-bottom: 16px;
    }

    .control-group:last-child {
        margin-bottom: 0;
    }

    .control-group label {
        display: block;
        margin-bottom: 8px;
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
</style>

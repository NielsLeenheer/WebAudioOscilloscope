<script>
    import { onMount, onDestroy } from 'svelte';
    import { Icon } from 'svelte-icon';
    import sineIcon from '../../assets/icons/glyph/sine.svg?raw';
    import Controls from './Controls.svelte';
    import PhysicsDialog from './PhysicsDialog.svelte';
    import Grid from './Grid.svelte';
    import Visualiser from './Visualiser.svelte';

    let { audioEngine, isPlaying, inputSource, isPowered, mode = $bindable() } = $props();

    let visualiser;
    let physicsDialog;
    let micStream = null;
    let micAudioContext = $state(null);
    let micAnalyserLeft = $state(null);
    let micAnalyserRight = $state(null);

    // Physics parameters (adjustable)
    let forceMultiplier = $state(0.3);
    let damping = $state(0.60);
    let mass = $state(0.11);
    let persistence = $state(0.100); // Afterglow/fade effect (0=instant fade, 1=long trail)
    let signalNoise = $state(0.005); // Random noise added to audio signal (0-1)
    let beamPower = $state(0.75); // Beam power (affects opacity: high power = bright, low power = dim)
    let velocityDimming = $state(1.0); // How much fast movements dim (0=no dimming, 1=maximum dimming)
    let focus = $state(0.2); // Focus control (-1.0 to 1.0, 0.0 = perfect focus, abs value = blur amount)
    let decay = $state(512); // Maximum points to render (controls phosphor decay/overdraw)

    // Time division steps (like real oscilloscope) - stored in microseconds for easy calculation
    const timeDivSteps = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000];
    const timeDivLabels = ['0.05µs', '0.1µs', '0.2µs', '0.5µs', '1µs', '2µs', '5µs', '10µs', '20µs', '50µs', '0.1ms', '0.2ms', '0.5ms', '1ms', '2ms', '5ms', '10ms', '20ms', '50ms', '0.1s', '0.2s', '0.5s'];

    let timeDivBase = $state(13); // Index into timeDivSteps (default 1ms)
    let timeDivFine = $state(1.0); // Fine adjustment multiplier (0.5 to 2.5)
    let triggerLevel = $state(0.0); // Trigger level: voltage threshold for triggering (-1.0 to 1.0)
    let triggerChannel = $state('a'); // Trigger channel: 'a' or 'b'

    // Calculate combined time division (in microseconds)
    // This value represents microseconds per division on the oscilloscope screen
    let timeDiv = $derived(timeDivSteps[timeDivBase] * timeDivFine);

    // Base amplification steps (like real oscilloscope)
    const amplSteps = [0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10];
    const amplLabels = ['2mV', '5mV', '10mV', '20mV', '50mV', '0.1V', '0.2V', '0.5V', '1V', '2V', '5V', '10V'];

    let amplBaseA = $state(8); // Index into amplSteps (default 1V)
    let amplFineA = $state(1.0); // Fine adjustment multiplier (0.5 to 2.5)
    let positionA = $state(0.0); // Position A: vertical offset for channel A (-1.0 to 1.0)

    let amplBaseB = $state(8); // Index into amplSteps (default 1V)
    let amplFineB = $state(1.0); // Fine adjustment multiplier (0.5 to 2.5)
    let positionB = $state(0.0); // Position B: vertical offset for channel B (-1.0 to 1.0)
    let xPosition = $state(0.0); // X Position: horizontal offset (-1.0 to 1.0)

    // Calculate combined amplification
    let amplDivA = $derived(amplSteps[amplBaseA] * amplFineA);
    let amplDivB = $derived(amplSteps[amplBaseB] * amplFineB);

    async function startMicrophoneInput() {
        try {
            micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });

            micAudioContext = new AudioContext();
            const source = micAudioContext.createMediaStreamSource(micStream);

            // Create a stereo splitter
            const splitter = micAudioContext.createChannelSplitter(2);
            source.connect(splitter);

            // Create analysers for left and right channels
            micAnalyserLeft = micAudioContext.createAnalyser();
            micAnalyserLeft.fftSize = 16384;
            splitter.connect(micAnalyserLeft, 0);

            micAnalyserRight = micAudioContext.createAnalyser();
            micAnalyserRight.fftSize = 16384;
            splitter.connect(micAnalyserRight, 1);

            console.log('Microphone input started');
        } catch (error) {
            console.error('Error accessing microphone:', error);
            alert('Could not access microphone. Please check permissions.');
            inputSource = 'generated';
        }
    }

    function stopMicrophoneInput() {
        if (micStream) {
            micStream.getTracks().forEach(track => track.stop());
            micStream = null;
        }
        if (micAudioContext) {
            micAudioContext.close();
            micAudioContext = null;
        }
        micAnalyserLeft = null;
        micAnalyserRight = null;
        console.log('Microphone input stopped');
    }

    onMount(() => {
        // Microphone setup handled by effects
    });

    onDestroy(() => {
        stopMicrophoneInput();
    });

    function openPhysicsDialog() {
        if (physicsDialog) {
            physicsDialog.open();
        }
    }

    // React to input source changes
    $effect(() => {
        if (inputSource === 'microphone') {
            startMicrophoneInput();
        } else {
            stopMicrophoneInput();
        }
    });
</script>

<div class="preview-panel">
    <button class="physics-button" onclick={openPhysicsDialog}>
        <Icon data={sineIcon} />
    </button>
    <div class="canvas-area">
        <div class="canvas-container">
            <Visualiser
                bind:this={visualiser}
                {audioEngine}
                {inputSource}
                {isPowered}
                {mode}
                {forceMultiplier}
                {damping}
                {mass}
                {persistence}
                {signalNoise}
                {beamPower}
                {velocityDimming}
                {decay}
                {timeDiv}
                {triggerLevel}
                {triggerChannel}
                {amplDivA}
                {positionA}
                {amplDivB}
                {positionB}
                {xPosition}
                {focus}
                {micAnalyserLeft}
                {micAnalyserRight}
                {micAudioContext}
            />
            <Grid />
        </div>
    </div>
    <Controls
        {mode}
        bind:beamPower
        bind:focus
        bind:xPosition
        bind:timeDivBase
        bind:timeDivFine
        {timeDivLabels}
        bind:triggerLevel
        bind:triggerChannel
        bind:positionA
        bind:amplBaseA
        bind:amplFineA
        {amplLabels}
        bind:positionB
        bind:amplBaseB
        bind:amplFineB
    />
</div>

<PhysicsDialog
    bind:this={physicsDialog}
    bind:forceMultiplier
    bind:damping
    bind:mass
    bind:persistence
    bind:signalNoise
    bind:velocityDimming
    bind:decay
/>

<style>
    .preview-panel {
        background: transparent;
        display: flex;
        flex-direction: column;
        height: 100%;
        box-sizing: border-box;
        position: relative;
    }

    .canvas-area {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 0;
    }

    .physics-button {
        position: absolute;
        top: 20px;
        right: 20px;
        width: 24px;
        height: 24px;
        background: none;
        border: none;
        color: #4CAF50;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
        padding: 0;
    }

    .physics-button :global(svg) {
        width: 24px;
        height: 24px;
    }

    .canvas-container {
        position: relative;
        display: flex;
        justify-content: center;
        align-items: center;
        background: #1a1f1a;
        border-radius: 50px;
        width: 400px;
        height: 400px;
        overflow: hidden; /* Clip the overscan area */
    }
</style>

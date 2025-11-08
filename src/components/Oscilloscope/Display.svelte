<script>
    import { onMount, onDestroy } from 'svelte';
    import { Icon } from 'svelte-icon';
    import sineIcon from '../../assets/icons/glyph/sine.svg?raw';
    import Controls from './Controls.svelte';
    import PhysicsDialog from './PhysicsDialog.svelte';

    let { audioEngine, isPlaying, inputSource, isPowered, mode = $bindable() } = $props();

    let canvas;
    let gridCanvas;
    let physicsDialog;
    let animationId = null;
    let leftData = null;
    let rightData = null;
    let worker = null;
    let workerBusy = false;
    let micStream = null;
    let micAudioContext = null;
    let micAnalyserLeft = null;
    let micAnalyserRight = null;

    // Physics parameters (adjustable)
    let forceMultiplier = $state(0.22);
    let damping = $state(0.44);
    let mass = $state(0.11);
    let persistence = $state(0.030); // Afterglow/fade effect (0=instant fade, 1=long trail)
    let signalNoise = $state(0.030); // Random noise added to audio signal (0-1)
    let beamPower = $state(0.75); // Beam power (affects opacity: high power = bright, low power = dim)
    let velocityDimming = $state(0.90); // How much fast movements dim (0=no dimming, 1=maximum dimming)
    let focus = $state(0.2); // Focus control (-1.0 to 1.0, 0.0 = perfect focus, abs value = blur amount)

    // Time division steps (like real oscilloscope) - stored in microseconds for easy calculation
    const timeDivSteps = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000];
    const timeDivLabels = ['0.05µs', '0.1µs', '0.2µs', '0.5µs', '1µs', '2µs', '5µs', '10µs', '20µs', '50µs', '0.1ms', '0.2ms', '0.5ms', '1ms', '2ms', '5ms', '10ms', '20ms', '50ms', '0.1s', '0.2s', '0.5s'];

    let timeDivBase = $state(13); // Index into timeDivSteps (default 1ms)
    let timeDivFine = $state(1.0); // Fine adjustment multiplier (0.5 to 2.5)
    let triggerLevel = $state(0.0); // Trigger level: voltage threshold for triggering (-1.0 to 1.0)

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

    function drawGrid() {
        if (!gridCanvas) return;

        const ctx = gridCanvas.getContext('2d');
        const canvasWidth = 600; // Full canvas with overscan
        const canvasHeight = 600;
        const visibleWidth = 400; // Visible screen area
        const visibleHeight = 400;
        const overscan = (canvasWidth - visibleWidth) / 2; // 100px on each side

        // Clear canvas
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        // Grid style - black lines
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 1;

        // Draw 10x10 grid within the visible area (offset by overscan)
        const divisions = 10;
        const divSize = visibleWidth / divisions;

        // Vertical lines
        for (let i = 0; i <= divisions; i++) {
            const x = overscan + i * divSize;
            ctx.beginPath();
            ctx.moveTo(x, overscan);
            ctx.lineTo(x, overscan + visibleHeight);
            ctx.stroke();
        }

        // Horizontal lines
        for (let i = 0; i <= divisions; i++) {
            const y = overscan + i * divSize;
            ctx.beginPath();
            ctx.moveTo(overscan, y);
            ctx.lineTo(overscan + visibleWidth, y);
            ctx.stroke();
        }

        // Draw tick marks on center lines
        // 5 ticks per division = 0.2 step each
        const ticksPerDiv = 5;
        const tickLength = 4;
        const centerX = overscan + visibleWidth / 2;
        const centerY = overscan + visibleHeight / 2;

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.lineWidth = 1;

        // Horizontal center line ticks (Y = center)
        for (let i = 0; i <= divisions * ticksPerDiv; i++) {
            const x = overscan + (i / ticksPerDiv) * divSize;
            // Skip if this is a major grid line
            if (i % ticksPerDiv !== 0) {
                ctx.beginPath();
                ctx.moveTo(x, centerY - tickLength);
                ctx.lineTo(x, centerY + tickLength);
                ctx.stroke();
            }
        }

        // Vertical center line ticks (X = center)
        for (let i = 0; i <= divisions * ticksPerDiv; i++) {
            const y = overscan + (i / ticksPerDiv) * divSize;
            // Skip if this is a major grid line
            if (i % ticksPerDiv !== 0) {
                ctx.beginPath();
                ctx.moveTo(centerX - tickLength, y);
                ctx.lineTo(centerX + tickLength, y);
                ctx.stroke();
            }
        }
    }

    onMount(() => {
        // Draw grid
        drawGrid();

        // Initialize Web Worker with OffscreenCanvas
        worker = new Worker(new URL('../../workers/physics-worker.js', import.meta.url), { type: 'module' });

        // Listen for messages from worker
        worker.onmessage = (e) => {
            if (e.data.type === 'ready') {
                workerBusy = false;
            }
        };

        // Transfer canvas control to worker
        const offscreen = canvas.transferControlToOffscreen();
        worker.postMessage({
            type: 'init',
            data: { canvas: offscreen }
        }, [offscreen]);

        if (isPlaying) {
            startVisualization();
        }
    });

    onDestroy(() => {
        stopVisualization();
        stopMicrophoneInput();
        if (worker) {
            worker.terminate();
            worker = null;
        }
    });

    function startVisualization() {
        // Initialize data buffers
        const bufferLength = 16384; // Default FFT size

        const analysers = audioEngine.getAnalysers();
        if (analysers.left && analysers.right) {
            // Use actual FFT size if analysers exist
            const actualBufferLength = analysers.left.fftSize;
            leftData = new Float32Array(actualBufferLength);
            rightData = new Float32Array(actualBufferLength);
        } else {
            // Use default size if analysers don't exist yet
            leftData = new Float32Array(bufferLength);
            rightData = new Float32Array(bufferLength);
        }

        draw();
    }

    function stopVisualization() {
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
    }

    function clearScreen() {
        if (worker) {
            worker.postMessage({
                type: 'clear'
            });
        }
    }

    function openPhysicsDialog() {
        if (physicsDialog) {
            physicsDialog.open();
        }
    }

    function draw() {
        if (!isPowered) {
            stopVisualization();
            return;
        }

        animationId = requestAnimationFrame(draw);

        // Skip this frame if worker is still busy processing previous frame
        if (workerBusy) {
            return;
        }

        // Get analysers based on input source
        let analyserLeft, analyserRight;
        let hasValidInput = false;

        if (inputSource === 'microphone') {
            if (micAnalyserLeft && micAnalyserRight) {
                analyserLeft = micAnalyserLeft;
                analyserRight = micAnalyserRight;
                hasValidInput = true;
            }
        } else {
            // For generated input, always continue even if not playing
            const analysers = audioEngine.getAnalysers();
            if (analysers.left && analysers.right) {
                analyserLeft = analysers.left;
                analyserRight = analysers.right;
                hasValidInput = true;
            }
        }

        // Get time domain data from both channels (or zeros if not available)
        if (hasValidInput) {
            analyserLeft.getFloatTimeDomainData(leftData);
            analyserRight.getFloatTimeDomainData(rightData);
        } else {
            // Fill with zeros when no input (noise will be added in worker)
            if (!leftData) leftData = new Float32Array(16384);
            if (!rightData) rightData = new Float32Array(16384);
            leftData.fill(0);
            rightData.fill(0);
        }

        // Get sample rate from the appropriate AudioContext
        let sampleRate = 48000; // Default fallback
        if (inputSource === 'microphone' && micAudioContext) {
            sampleRate = micAudioContext.sampleRate;
        } else if (audioEngine?.audioContext) {
            sampleRate = audioEngine.audioContext.sampleRate;
        }

        // Send data to worker for physics calculation AND rendering
        // Use full canvas size (600x600) to allow overscan
        const canvasWidth = 600;
        const canvasHeight = 600;
        // Visible screen area is 400x400 (clipped by CSS overflow: hidden)
        const visibleWidth = 400;
        const centerX = canvasWidth / 2;
        const centerY = canvasHeight / 2;
        const scale = Math.min(canvasWidth, canvasHeight) / 2.5;
        const basePower = 0.2 + (beamPower * 1.4); // Allow up to 3.0 max brightness

        if (worker) {
            workerBusy = true;
            worker.postMessage({
                type: 'render',
                data: {
                    leftData: Array.from(leftData),
                    rightData: Array.from(rightData),
                    centerX,
                    centerY,
                    scale,
                    forceMultiplier,
                    damping,
                    mass,
                    signalNoise,
                    basePower,
                    persistence,
                    velocityDimming,
                    mode,
                    timeDiv,
                    triggerLevel,
                    amplDivA,
                    positionA,
                    amplDivB,
                    positionB,
                    xPosition,
                    canvasWidth,
                    canvasHeight,
                    visibleWidth,
                    sampleRate
                }
            });
        }
    }

    // React to isPowered changes
    $effect(() => {
        if (isPowered) {
            // Start visualization when powered on, regardless of generator state
            startVisualization();
        } else {
            // Stop and reset when powered off
            stopVisualization();
            if (worker) {
                worker.postMessage({
                    type: 'reset'
                });
            }
        }
    });

    // React to input source changes
    $effect(() => {
        if (inputSource === 'microphone') {
            startMicrophoneInput();
        } else {
            stopMicrophoneInput();
        }
    });

    // React to power changes - clear screen when powered off
    $effect(() => {
        if (!isPowered) {
            clearScreen();
        }
    });
</script>

<div class="preview-panel">
    <button class="physics-button" onclick={openPhysicsDialog}>
        <Icon data={sineIcon} />
    </button>
    <div class="canvas-area">
        <div class="canvas-container">
            <canvas
                bind:this={canvas}
                width="600"
                height="600"
                class="scope-canvas"
                style="filter: blur({Math.abs(focus) * 3}px);"
            ></canvas>
            <canvas
                bind:this={gridCanvas}
                width="600"
                height="600"
                class="grid-canvas"
            ></canvas>
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

    .scope-canvas {
        position: absolute;
        /* Offset by -100px to center the 400x400 visible area within the 600x600 canvas */
        top: -100px;
        left: -100px;
        display: block;
        background: #1a1f1a;
        border-radius: 8px;
    }

    .grid-canvas {
        position: absolute;
        /* Offset by -100px to align with scope canvas */
        top: -100px;
        left: -100px;
        display: block;
        background: transparent;
        pointer-events: none;
        border-radius: 8px;
    }
</style>

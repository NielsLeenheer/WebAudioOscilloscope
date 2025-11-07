<script>
    import { onMount, onDestroy } from 'svelte';
    import { Icon } from 'svelte-icon';
    import sineIcon from '../assets/icons/glyph/sine.svg?raw';

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
    let timeDiv = $state(1.0); // Time/Div: controls zoom level (1.0 = full buffer, 0.1 = 10% of buffer)
    let triggerLevel = $state(0.0); // Trigger level: voltage threshold for triggering (-1.0 to 1.0)
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
            micAnalyserLeft.fftSize = 2048;
            splitter.connect(micAnalyserLeft, 0);

            micAnalyserRight = micAudioContext.createAnalyser();
            micAnalyserRight.fftSize = 2048;
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
        worker = new Worker(new URL('../workers/physics-worker.js', import.meta.url), { type: 'module' });

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
        const bufferLength = 2048; // Default FFT size

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
            physicsDialog.show();
        }
    }

    function closePhysicsDialog() {
        if (physicsDialog) {
            physicsDialog.close();
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
            if (!leftData) leftData = new Float32Array(2048);
            if (!rightData) rightData = new Float32Array(2048);
            leftData.fill(0);
            rightData.fill(0);
        }

        // Send data to worker for physics calculation AND rendering
        // Use full canvas size (600x600) to allow overscan
        const canvasWidth = 600;
        const canvasHeight = 600;
        const centerX = canvasWidth / 2;
        const centerY = canvasHeight / 2;
        const scale = Math.min(canvasWidth, canvasHeight) / 2.5;
        const basePower = 0.2 + (beamPower * 0.8);

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
                    canvasHeight
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
    <div class="controls-grid">
        <!-- Top Left: Display Controls -->
        <div class="control-panel">
            <div class="slider-control">
                <label>INTENS</label>
                <input type="range" min="0" max="1" step="0.01" bind:value={beamPower} />
                <span class="value">{beamPower.toFixed(2)}</span>
            </div>
            <div class="slider-control">
                <label>FOCUS</label>
                <input type="range" min="-1" max="1" step="0.01" bind:value={focus} />
                <span class="value">{focus.toFixed(2)}</span>
            </div>
        </div>

        <!-- Top Right: Position/Time Controls -->
        <div class="control-panel">
            <div class="slider-control">
                <label>X POS</label>
                <input type="range" min="-1" max="1" step="0.01" bind:value={xPosition} />
                <span class="value">{xPosition.toFixed(2)}</span>
            </div>
            <div class="slider-control" class:disabled={mode === 'xy'}>
                <label>TIME/DIV</label>
                <input type="range" min="0.1" max="1" step="0.05" bind:value={timeDiv} disabled={mode === 'xy'} />
                <span class="value">{timeDiv.toFixed(2)}</span>
            </div>
            <div class="slider-control" class:disabled={mode === 'xy'}>
                <label>TRIGGER</label>
                <input type="range" min="-1" max="1" step="0.01" bind:value={triggerLevel} disabled={mode === 'xy'} />
                <span class="value">{triggerLevel.toFixed(2)}</span>
            </div>
        </div>

        <!-- Bottom Left: Channel A Controls -->
        <div class="control-panel" class:disabled={mode === 'b'}>
            <div class="panel-label">CHANNEL A</div>
            <div class="slider-control">
                <label>POSITION</label>
                <input type="range" min="-1" max="1" step="0.01" bind:value={positionA} disabled={mode === 'b'} />
                <span class="value">{positionA.toFixed(2)}</span>
            </div>
            <div class="slider-control dual-slider">
                <label>AMPL/DIV</label>
                <input type="range" min="0" max="11" step="1" bind:value={amplBaseA} disabled={mode === 'b'} class="base-slider" />
                <input type="range" min="0.5" max="2.5" step="0.01" bind:value={amplFineA} disabled={mode === 'b'} class="fine-slider" />
                <span class="value">{amplLabels[amplBaseA]}</span>
            </div>
        </div>

        <!-- Bottom Right: Channel B Controls -->
        <div class="control-panel" class:disabled={mode === 'a'}>
            <div class="panel-label">CHANNEL B</div>
            <div class="slider-control">
                <label>POSITION</label>
                <input type="range" min="-1" max="1" step="0.01" bind:value={positionB} disabled={mode === 'a'} />
                <span class="value">{positionB.toFixed(2)}</span>
            </div>
            <div class="slider-control dual-slider">
                <label>AMPL/DIV</label>
                <input type="range" min="0" max="11" step="1" bind:value={amplBaseB} disabled={mode === 'a'} class="base-slider" />
                <input type="range" min="0.5" max="2.5" step="0.01" bind:value={amplFineB} disabled={mode === 'a'} class="fine-slider" />
                <span class="value">{amplLabels[amplBaseB]}</span>
            </div>
        </div>
    </div>
</div>

<dialog bind:this={physicsDialog} class="physics-dialog">
    <div class="dialog-header">
        <h3>Physics Controls</h3>
        <button class="close-button" onclick={closePhysicsDialog}>✕</button>
    </div>
    <div class="sliders">
        <div class="slider-control">
            <label>Force</label>
            <input type="range" min="0.01" max="0.5" step="0.01" bind:value={forceMultiplier} />
            <span class="value">{forceMultiplier.toFixed(2)}</span>
        </div>
        <div class="slider-control">
            <label>Damping</label>
            <input type="range" min="0.1" max="0.99" step="0.01" bind:value={damping} />
            <span class="value">{damping.toFixed(2)}</span>
        </div>
        <div class="slider-control">
            <label>Mass</label>
            <input type="range" min="0.01" max="5.0" step="0.01" bind:value={mass} />
            <span class="value">{mass.toFixed(2)}</span>
        </div>
        <div class="slider-control">
            <label>Persistence</label>
            <input type="range" min="0.0" max="0.95" step="0.005" bind:value={persistence} />
            <span class="value">{persistence.toFixed(3)}</span>
        </div>
        <div class="slider-control">
            <label>Noise</label>
            <input type="range" min="0" max="0.2" step="0.001" bind:value={signalNoise} />
            <span class="value">{signalNoise.toFixed(3)}</span>
        </div>
        <div class="slider-control">
            <label>Dimming</label>
            <input type="range" min="0" max="1" step="0.01" bind:value={velocityDimming} />
            <span class="value">{velocityDimming.toFixed(2)}</span>
        </div>
    </div>
</dialog>

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

    .controls-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        padding: 20px;
        width: 100%;
        box-sizing: border-box;
    }

    .control-panel {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 15px;
        background: #1a1a1a;
        border-radius: 4px;
        min-height: 80px;
        transition: opacity 0.2s;
    }

    .control-panel.disabled {
        opacity: 0.4;
    }

    .panel-label {
        color: #4CAF50;
        font-family: system-ui;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.5px;
        margin-bottom: 5px;
        padding-bottom: 8px;
        border-bottom: 1px solid #333;
    }

    .control-panel.disabled .panel-label {
        color: #666;
    }

    .physics-dialog {
        position: fixed;
        top: 20px;
        right: 20px;
        left: auto;
        bottom: auto;
        margin: 0;
        padding: 0;
        background: rgba(26, 26, 26, 0.2);
        border: 1px solid rgba(51, 51, 51, 0.2);
        border-radius: 4px;
        color: #4CAF50;
        min-width: 300px;
        max-width: 400px;
        backdrop-filter: blur(10px);
        transform: none;
        box-shadow: 0px 0px 4px #1c5e20;
        z-index: 20;
    }

    .physics-dialog::backdrop {
        background: transparent;
    }

    .dialog-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 15px;
        border-bottom: 1px solid #333;
    }

    .dialog-header h3 {
        margin: 0;
        font-family: system-ui;
        font-size: 13px;
        font-weight: 600;
        color: #4CAF50;
    }

    .close-button {
        background: transparent;
        border: none;
        color: #888;
        font-size: 20px;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.2s;
    }

    .close-button:hover {
        color: #4CAF50;
    }

    .sliders {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 15px;
    }

    .slider-control {
        display: grid;
        grid-template-columns: 80px 1fr 50px;
        gap: 10px;
        align-items: center;
        transition: opacity 0.2s;
    }

    .slider-control.disabled {
        opacity: 0.4;
    }

    .slider-control label {
        color: #4CAF50;
        font-family: system-ui;
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
    }

    .slider-control.disabled label {
        color: #666;
    }

    .slider-control .value {
        color: #4CAF50;
        font-family: monospace;
        font-size: 12px;
        font-weight: 600;
        text-align: right;
    }

    .slider-control.disabled .value {
        color: #666;
    }

    .slider-control input[type="range"] {
        width: 100%;
        height: 4px;
        background: #333;
        border-radius: 2px;
        outline: none;
        -webkit-appearance: none;
    }

    .slider-control input[type="range"]:disabled {
        background: #222;
        cursor: not-allowed;
    }

    .slider-control input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 16px;
        height: 16px;
        background: #4CAF50;
        border-radius: 50%;
        cursor: pointer;
    }

    .slider-control input[type="range"]:disabled::-webkit-slider-thumb {
        background: #555;
        cursor: not-allowed;
    }

    .slider-control input[type="range"]::-moz-range-thumb {
        width: 16px;
        height: 16px;
        background: #4CAF50;
        border-radius: 50%;
        cursor: pointer;
        border: none;
    }

    .slider-control input[type="range"]:disabled::-moz-range-thumb {
        background: #555;
        cursor: not-allowed;
    }

    .slider-control select {
        width: 100%;
        background: #2d2d2d;
        color: #4CAF50;
        border: 1px solid #333;
        border-radius: 4px;
        padding: 4px 8px;
        font-family: system-ui;
        font-size: 12px;
        cursor: pointer;
        outline: none;
    }

    .slider-control select:hover:not(:disabled) {
        border-color: #4CAF50;
    }

    .slider-control select:disabled {
        background: #1a1a1a;
        color: #666;
        border-color: #222;
        cursor: not-allowed;
    }

    .slider-control select option {
        background: #2d2d2d;
        color: #4CAF50;
    }

    .slider-control.dual-slider {
        grid-template-columns: 80px 1fr 1fr 50px;
    }

    .slider-control.dual-slider .base-slider {
        width: 100%;
    }

    .slider-control.dual-slider .fine-slider {
        width: 100%;
    }
</style>

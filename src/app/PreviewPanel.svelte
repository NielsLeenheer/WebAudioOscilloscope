<script>
    import { onMount, onDestroy } from 'svelte';

    let { audioEngine, isPlaying, inputSource } = $props();

    let canvas;
    let gridCanvas;
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
    let mode = $state('xy'); // Display mode: 'xy', 'a', 'b', or 'ab'
    let timeDiv = $state(1.0); // Time/Div: controls zoom level (1.0 = full buffer, 0.1 = 10% of buffer)
    let triggerLevel = $state(0.0); // Trigger level: voltage threshold for triggering (-1.0 to 1.0)
    let amplDivA = $state(0.6); // Ampl/Div A: vertical amplitude scaling for channel A (0.1 to 2.0)
    let positionA = $state(0.0); // Position A: vertical offset for channel A (-1.0 to 1.0)
    let amplDivB = $state(0.6); // Ampl/Div B: vertical amplitude scaling for channel B (0.1 to 2.0)
    let positionB = $state(0.0); // Position B: vertical offset for channel B (-1.0 to 1.0)
    let xPosition = $state(0.0); // X Position: horizontal offset (-1.0 to 1.0)

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
        const analysers = audioEngine.getAnalysers();

        if (!analysers.left || !analysers.right) {
            return;
        }

        const bufferLength = analysers.left.fftSize;
        leftData = new Float32Array(bufferLength);
        rightData = new Float32Array(bufferLength);

        draw();
    }

    function stopVisualization() {
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
    }

    function draw() {
        if (!isPlaying) {
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

        if (inputSource === 'microphone') {
            if (!micAnalyserLeft || !micAnalyserRight) {
                return;
            }
            analyserLeft = micAnalyserLeft;
            analyserRight = micAnalyserRight;
        } else {
            const analysers = audioEngine.getAnalysers();
            if (!analysers.left || !analysers.right) {
                return;
            }
            analyserLeft = analysers.left;
            analyserRight = analysers.right;
        }

        // Get time domain data from both channels
        analyserLeft.getFloatTimeDomainData(leftData);
        analyserRight.getFloatTimeDomainData(rightData);

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

    // React to isPlaying changes
    $effect(() => {
        if (isPlaying) {
            startVisualization();
        } else {
            stopVisualization();
            // Reset physics state in worker
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
</script>

<div class="preview-panel">
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
    <div class="mode-selector">
        <button class:active={mode === 'xy'} onclick={() => mode = 'xy'}>X/Y</button>
        <button class:active={mode === 'a'} onclick={() => mode = 'a'}>A</button>
        <button class:active={mode === 'b'} onclick={() => mode = 'b'}>B</button>
        <button class:active={mode === 'ab'} onclick={() => mode = 'ab'}>A/B</button>
    </div>
    <div class="visible-controls">
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
        {#if mode === 'xy'}
            <div class="slider-control">
                <label>AMPL/DIV A</label>
                <input type="range" min="0.1" max="2" step="0.1" bind:value={amplDivA} />
                <span class="value">{amplDivA.toFixed(1)}</span>
            </div>
            <div class="slider-control">
                <label>X POS</label>
                <input type="range" min="-1" max="1" step="0.01" bind:value={xPosition} />
                <span class="value">{xPosition.toFixed(2)}</span>
            </div>
            <div class="slider-control">
                <label>AMPL/DIV B</label>
                <input type="range" min="0.1" max="2" step="0.1" bind:value={amplDivB} />
                <span class="value">{amplDivB.toFixed(1)}</span>
            </div>
            <div class="slider-control">
                <label>POSITION B</label>
                <input type="range" min="-1" max="1" step="0.01" bind:value={positionB} />
                <span class="value">{positionB.toFixed(2)}</span>
            </div>
        {:else if mode === 'a'}
            <div class="slider-control">
                <label>POSITION A</label>
                <input type="range" min="-1" max="1" step="0.01" bind:value={positionA} />
                <span class="value">{positionA.toFixed(2)}</span>
            </div>
            <div class="slider-control">
                <label>AMPL/DIV A</label>
                <input type="range" min="0.1" max="2" step="0.1" bind:value={amplDivA} />
                <span class="value">{amplDivA.toFixed(1)}</span>
            </div>
            <div class="slider-control">
                <label>X POS</label>
                <input type="range" min="-1" max="1" step="0.01" bind:value={xPosition} />
                <span class="value">{xPosition.toFixed(2)}</span>
            </div>
            <div class="slider-control">
                <label>TIME/DIV</label>
                <input type="range" min="0.1" max="1" step="0.05" bind:value={timeDiv} />
                <span class="value">{timeDiv.toFixed(2)}</span>
            </div>
            <div class="slider-control">
                <label>TRIGGER</label>
                <input type="range" min="-1" max="1" step="0.01" bind:value={triggerLevel} />
                <span class="value">{triggerLevel.toFixed(2)}</span>
            </div>
        {:else if mode === 'b'}
            <div class="slider-control">
                <label>POSITION B</label>
                <input type="range" min="-1" max="1" step="0.01" bind:value={positionB} />
                <span class="value">{positionB.toFixed(2)}</span>
            </div>
            <div class="slider-control">
                <label>AMPL/DIV B</label>
                <input type="range" min="0.1" max="2" step="0.1" bind:value={amplDivB} />
                <span class="value">{amplDivB.toFixed(1)}</span>
            </div>
            <div class="slider-control">
                <label>X POS</label>
                <input type="range" min="-1" max="1" step="0.01" bind:value={xPosition} />
                <span class="value">{xPosition.toFixed(2)}</span>
            </div>
            <div class="slider-control">
                <label>TIME/DIV</label>
                <input type="range" min="0.1" max="1" step="0.05" bind:value={timeDiv} />
                <span class="value">{timeDiv.toFixed(2)}</span>
            </div>
            <div class="slider-control">
                <label>TRIGGER</label>
                <input type="range" min="-1" max="1" step="0.01" bind:value={triggerLevel} />
                <span class="value">{triggerLevel.toFixed(2)}</span>
            </div>
        {:else if mode === 'ab'}
            <div class="slider-control">
                <label>POSITION A</label>
                <input type="range" min="-1" max="1" step="0.01" bind:value={positionA} />
                <span class="value">{positionA.toFixed(2)}</span>
            </div>
            <div class="slider-control">
                <label>AMPL/DIV A</label>
                <input type="range" min="0.1" max="2" step="0.1" bind:value={amplDivA} />
                <span class="value">{amplDivA.toFixed(1)}</span>
            </div>
            <div class="slider-control">
                <label>POSITION B</label>
                <input type="range" min="-1" max="1" step="0.01" bind:value={positionB} />
                <span class="value">{positionB.toFixed(2)}</span>
            </div>
            <div class="slider-control">
                <label>AMPL/DIV B</label>
                <input type="range" min="0.1" max="2" step="0.1" bind:value={amplDivB} />
                <span class="value">{amplDivB.toFixed(1)}</span>
            </div>
            <div class="slider-control">
                <label>X POS</label>
                <input type="range" min="-1" max="1" step="0.01" bind:value={xPosition} />
                <span class="value">{xPosition.toFixed(2)}</span>
            </div>
            <div class="slider-control">
                <label>TIME/DIV</label>
                <input type="range" min="0.1" max="1" step="0.05" bind:value={timeDiv} />
                <span class="value">{timeDiv.toFixed(2)}</span>
            </div>
            <div class="slider-control">
                <label>TRIGGER</label>
                <input type="range" min="-1" max="1" step="0.01" bind:value={triggerLevel} />
                <span class="value">{triggerLevel.toFixed(2)}</span>
            </div>
        {/if}
    </div>
    <details class="controls-details">
        <summary>Physics Controls</summary>
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
    </details>
</div>

<style>
    .preview-panel {
        background: #2d2d2d;
        border-radius: 6px;
        border: 1px solid #444;
        margin: 20px 20px 20px 0;
    }

    .canvas-container {
        position: relative;
        display: flex;
        justify-content: center;
        align-items: center;
        background: #1a1f1a;
        border-radius: 4px;
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
        border-radius: 4px;
    }

    .grid-canvas {
        position: absolute;
        /* Offset by -100px to align with scope canvas */
        top: -100px;
        left: -100px;
        display: block;
        background: transparent;
        pointer-events: none;
        border-radius: 4px;
    }

    .mode-selector {
        display: flex;
        gap: 5px;
        padding: 10px 15px;
        background: #1a1a1a;
        border-radius: 4px;
        margin-bottom: 10px;
    }

    .mode-selector button {
        flex: 1;
        padding: 8px 16px;
        background: #2d2d2d;
        color: #888;
        border: 1px solid #444;
        border-radius: 4px;
        font-family: system-ui;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }

    .mode-selector button:hover {
        background: #333;
        color: #aaa;
    }

    .mode-selector button.active {
        background: #4CAF50;
        color: #000;
        border-color: #4CAF50;
    }

    .visible-controls {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 15px;
        background: #1a1a1a;
        border-radius: 4px;
        margin-bottom: 10px;
    }

    .controls-details {
        border: none;
        margin: 0;
    }

    .controls-details summary {
        cursor: pointer;
        padding: 15px;
        background: #1a1a1a;
        color: #4CAF50;
        font-family: system-ui;
        font-size: 13px;
        font-weight: 600;
        list-style: none;
        user-select: none;
        border-radius: 4px;
    }

    .controls-details summary::-webkit-details-marker {
        display: none;
    }

    .controls-details summary::before {
        content: '▶ ';
        display: inline-block;
        transition: transform 0.2s;
    }

    .controls-details[open] summary::before {
        transform: rotate(90deg);
    }

    .controls-details summary:hover {
        background: #252525;
    }

    .sliders {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 15px;
        background: #1a1a1a;
        border-radius: 4px;
    }

    .slider-control {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 10px;
        align-items: center;
    }

    .slider-control label {
        color: #4CAF50;
        font-family: system-ui;
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
    }

    .slider-control .value {
        color: #4CAF50;
        font-family: monospace;
        font-size: 12px;
        font-weight: 600;
        min-width: 40px;
        text-align: right;
    }

    .slider-control input[type="range"] {
        width: 100%;
        height: 4px;
        background: #333;
        border-radius: 2px;
        outline: none;
        -webkit-appearance: none;
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

    .slider-control input[type="range"]::-moz-range-thumb {
        width: 16px;
        height: 16px;
        background: #4CAF50;
        border-radius: 50%;
        cursor: pointer;
        border: none;
    }
</style>

<script>
    import { onMount, onDestroy } from 'svelte';

    let { audioEngine, isPlaying } = $props();

    let canvas;
    let animationId = null;
    let leftData = null;
    let rightData = null;
    let worker = null;
    let workerBusy = false;

    // Physics parameters (adjustable)
    let forceMultiplier = $state(0.22);
    let damping = $state(0.44);
    let mass = $state(0.11);
    let persistence = $state(0.030); // Afterglow/fade effect (0=instant fade, 1=long trail)
    let signalNoise = $state(0.015); // Random noise added to audio signal (0-1)
    let beamPower = $state(0.50); // Beam power (affects opacity: high power = bright, low power = dim)
    let velocityDimming = $state(0.90); // How much fast movements dim (0=no dimming, 1=maximum dimming)
    let focus = $state(1.0); // Focus control (1.0 = perfect focus, 0.0 = maximum blur)

    onMount(() => {
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

        const analysers = audioEngine.getAnalysers();
        if (!analysers.left || !analysers.right) {
            return;
        }

        // Get time domain data from both channels
        analysers.left.getFloatTimeDomainData(leftData);
        analysers.right.getFloatTimeDomainData(rightData);

        // Send data to worker for physics calculation AND rendering
        const centerX = 400 / 2;
        const centerY = 400 / 2;
        const scale = Math.min(400, 400) / 2.5;
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
                    canvasWidth: 400,
                    canvasHeight: 400
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
</script>

<div class="preview-panel">
    <div class="canvas-container">
        <canvas
            bind:this={canvas}
            width="400"
            height="400"
            style="filter: blur({(1 - focus) * 3}px);"
        ></canvas>
    </div>
    <div class="visible-controls">
        <div class="slider-control">
            <label>INTENS: {beamPower.toFixed(2)}</label>
            <input type="range" min="0" max="1" step="0.01" bind:value={beamPower} />
        </div>
        <div class="slider-control">
            <label>FOCUS: {focus.toFixed(2)}</label>
            <input type="range" min="0" max="1" step="0.01" bind:value={focus} />
        </div>
    </div>
    <details class="controls-details">
        <summary>Physics Controls</summary>
        <div class="sliders">
            <div class="slider-control">
                <label>Force: {forceMultiplier.toFixed(2)}</label>
                <input type="range" min="0.01" max="0.5" step="0.01" bind:value={forceMultiplier} />
            </div>
            <div class="slider-control">
                <label>Damping: {damping.toFixed(2)}</label>
                <input type="range" min="0.1" max="0.99" step="0.01" bind:value={damping} />
            </div>
            <div class="slider-control">
                <label>Mass: {mass.toFixed(2)}</label>
                <input type="range" min="0.01" max="5.0" step="0.01" bind:value={mass} />
            </div>
            <div class="slider-control">
                <label>Persistence: {persistence.toFixed(3)}</label>
                <input type="range" min="0.0" max="0.95" step="0.005" bind:value={persistence} />
            </div>
            <div class="slider-control">
                <label>Signal Noise: {signalNoise.toFixed(3)}</label>
                <input type="range" min="0" max="0.2" step="0.001" bind:value={signalNoise} />
            </div>
            <div class="slider-control">
                <label>Velocity Dimming: {velocityDimming.toFixed(2)}</label>
                <input type="range" min="0" max="1" step="0.01" bind:value={velocityDimming} />
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
        display: flex;
        justify-content: center;
        align-items: center;
        background: #000;
        border-radius: 4px;
    }

    canvas {
        display: block;
        background: #000;
        border-radius: 4px;
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
        display: flex;
        flex-direction: column;
        gap: 5px;
    }

    .slider-control label {
        color: #4CAF50;
        font-family: system-ui;
        font-size: 12px;
        font-weight: 600;
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

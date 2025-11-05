<script>
    import { onMount, onDestroy } from 'svelte';

    let { audioEngine, isPlaying } = $props();

    let canvas;
    let ctx;
    let animationId = null;
    let leftData = null;
    let rightData = null;
    let worker = null;

    // Physics simulation state (tracked but calculated in worker)
    let beamX = 0;
    let beamY = 0;
    let velocityX = 0;
    let velocityY = 0;

    // Physics parameters (adjustable)
    let forceMultiplier = $state(0.22);
    let damping = $state(0.44);
    let mass = $state(0.11);
    let persistence = $state(0.330); // Afterglow/fade effect (0=instant fade, 1=long trail)
    let signalNoise = $state(0.004); // Random noise added to audio signal (0-1)
    let beamPower = $state(0.5); // Beam power (affects opacity: high power = bright, low power = dim)

    onMount(() => {
        ctx = canvas.getContext('2d');

        // Initialize Web Worker for physics calculations
        worker = new Worker(new URL('../workers/physics-worker.js', import.meta.url), { type: 'module' });

        // Handle messages from worker
        worker.onmessage = (e) => {
            const { points, beamState } = e.data;

            // Update physics state
            beamX = beamState.beamX;
            beamY = beamState.beamY;
            velocityX = beamState.velocityX;
            velocityY = beamState.velocityY;

            // Draw the points
            drawPoints(points);
        };

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

        const analysers = audioEngine.getAnalysers();
        if (!analysers.left || !analysers.right) {
            return;
        }

        // Get time domain data from both channels
        analysers.left.getFloatTimeDomainData(leftData);
        analysers.right.getFloatTimeDomainData(rightData);

        // Clear canvas with adjustable fade effect for persistence
        ctx.fillStyle = `rgba(0, 0, 0, ${1 - persistence})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw grid
        drawGrid();

        // Send data to worker for physics calculation
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const scale = Math.min(canvas.width, canvas.height) / 2.5;
        const basePower = 0.2 + (beamPower * 0.8);

        if (worker) {
            worker.postMessage({
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
                reset: false
            });
        }
    }

    function drawPoints(points) {
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Draw each line segment
        for (let i = 1; i < points.length; i++) {
            const p1 = points[i - 1];
            const p2 = points[i];

            ctx.strokeStyle = `rgba(76, 175, 80, ${p2.opacity})`;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }
    }

    function drawGrid() {
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        // Draw center crosshair
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(canvas.width, centerY);
        ctx.moveTo(centerX, 0);
        ctx.lineTo(centerX, canvas.height);
        ctx.stroke();

        // Draw circle guide
        const radius = Math.min(canvas.width, canvas.height) / 2.5;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.stroke();
    }

    // React to isPlaying changes
    $effect(() => {
        if (isPlaying) {
            startVisualization();
        } else {
            stopVisualization();
            // Clear canvas and reset physics state when stopped
            if (ctx) {
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            // Reset physics state in worker
            if (worker) {
                worker.postMessage({
                    leftData: [],
                    rightData: [],
                    centerX: 0,
                    centerY: 0,
                    scale: 0,
                    forceMultiplier: 0,
                    damping: 0,
                    mass: 1,
                    signalNoise: 0,
                    basePower: 0,
                    reset: true
                });
            }
            beamX = 0;
            beamY = 0;
            velocityX = 0;
            velocityY = 0;
        }
    });
</script>

<div class="preview-panel">
    <h3>Preview</h3>
    <div class="canvas-container">
        <canvas
            bind:this={canvas}
            width="400"
            height="400"
        ></canvas>
    </div>
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
            <label>Beam Power: {beamPower.toFixed(2)}</label>
            <input type="range" min="0" max="1" step="0.01" bind:value={beamPower} />
        </div>
    </div>

    <p class="hint">This shows the X/Y oscilloscope visualization</p>
</div>

<style>
    .preview-panel {
        background: #2d2d2d;
        padding: 20px;
        border-radius: 6px;
        border: 1px solid #444;
        margin: 20px 20px 20px 0;
    }

    h3 {
        margin: 0 0 15px 0;
        color: #4CAF50;
        font-family: system-ui;
        font-size: 18px;
    }

    .canvas-container {
        display: flex;
        justify-content: center;
        align-items: center;
        background: #000;
        border-radius: 4px;
        padding: 10px;
    }

    canvas {
        display: block;
        background: #000;
        border-radius: 4px;
    }

    .sliders {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin: 15px 0;
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

    .hint {
        margin: 10px 0 0 0;
        color: #888;
        font-size: 12px;
        font-family: system-ui;
        text-align: center;
    }
</style>

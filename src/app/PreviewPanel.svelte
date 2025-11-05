<script>
    import { onMount, onDestroy } from 'svelte';

    let { audioEngine, isPlaying } = $props();

    let canvas;
    let ctx;
    let animationId = null;
    let leftData = null;
    let rightData = null;
    let enableJitter = $state(true);
    let enableOvershoot = $state(true);
    let usePhysicsMode = $state(false);

    // Physics simulation state
    let beamX = 0;
    let beamY = 0;
    let velocityX = 0;
    let velocityY = 0;

    // Physics parameters (adjustable)
    let forceMultiplier = $state(0.10);
    let damping = $state(0.5);
    let mass = $state(0.66);
    let persistence = $state(0.1); // Afterglow/fade effect (0=instant fade, 1=long trail)
    let pointJitter = $state(0); // Per-point random jitter in pixels

    onMount(() => {
        ctx = canvas.getContext('2d');
        if (isPlaying) {
            startVisualization();
        }
    });

    onDestroy(() => {
        stopVisualization();
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

        if (usePhysicsMode) {
            drawPhysicsMode();
        } else {
            drawSimpleMode();
        }
    }

    function drawSimpleMode() {

        // Draw the X/Y plot (oscilloscope mode) with variable opacity based on beam speed
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const scale = Math.min(canvas.width, canvas.height) / 2.5;

        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Apply uniform jitter to entire frame (not per point)
        let frameJitterX = 0;
        let frameJitterY = 0;

        if (enableJitter) {
            // Apply jitter to the entire frame, not individual points
            // This prevents thick lines while still showing instability
            const jitterAmount = 2; // pixels
            frameJitterX = (Math.random() - 0.5) * jitterAmount;
            frameJitterY = (Math.random() - 0.5) * jitterAmount;
        }

        // Convert data to screen coordinates
        const points = [];
        for (let i = 0; i < leftData.length; i++) {
            points.push({
                x: centerX + leftData[i] * scale + frameJitterX,
                y: centerY - rightData[i] * scale + frameJitterY
            });
        }

        // Calculate distances and find maximum for threshold
        const distances = [];
        let maxDistance = 0;
        for (let i = 0; i < points.length - 1; i++) {
            const dx = points[i + 1].x - points[i].x;
            const dy = points[i + 1].y - points[i].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            distances.push(dist);
            maxDistance = Math.max(maxDistance, dist);
        }

        const overshootThreshold = maxDistance * 0.25;

        // Draw segments with beam inertia effect
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];

            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const distance = distances[i];

            // Map distance to opacity with exponential falloff
            const distanceThreshold = 10;
            let opacity;

            if (distance <= distanceThreshold) {
                opacity = 1.0;
            } else {
                const excessDistance = distance - distanceThreshold;
                const falloffRate = 8;
                opacity = Math.exp(-excessDistance / falloffRate);
                opacity = Math.max(opacity, 0.02);
            }

            ctx.strokeStyle = `rgba(76, 175, 80, ${opacity})`;

            // Check if PREVIOUS movement was fast (causes overshoot on THIS segment)
            const prevDistance = i > 0 ? distances[i - 1] : 0;
            const shouldOvershoot = enableOvershoot && prevDistance > overshootThreshold && i > 0;

            if (shouldOvershoot) {
                // Previous movement was fast, so this segment has overshoot
                // The beam wants to continue in the previous direction before turning to p2
                const p0 = points[i - 1];

                // Previous direction vector
                const prevDx = p1.x - p0.x;
                const prevDy = p1.y - p0.y;

                // Control point continues in previous direction from p1
                const overshootAmount = prevDistance * 0.5;
                const controlX = p1.x + prevDx * 0.5;
                const controlY = p1.y + prevDy * 0.5;

                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.quadraticCurveTo(controlX, controlY, p2.x, p2.y);
                ctx.stroke();
            } else {
                // Normal movement, use straight line
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            }
        }
    }

    function drawPhysicsMode() {
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const scale = Math.min(canvas.width, canvas.height) / 2.5;

        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Apply uniform jitter to readings
        let frameJitterX = 0;
        let frameJitterY = 0;
        if (enableJitter) {
            const jitterAmount = 2;
            frameJitterX = (Math.random() - 0.5) * jitterAmount;
            frameJitterY = (Math.random() - 0.5) * jitterAmount;
        }

        // Process each data point with physics simulation
        ctx.strokeStyle = 'rgba(76, 175, 80, 0.8)';
        ctx.beginPath();
        let isFirstPoint = true;

        for (let i = 0; i < leftData.length; i++) {
            // Target position from audio data
            const targetX = leftData[i] * scale;
            const targetY = -rightData[i] * scale;

            // Calculate force (like a spring pulling beam to target)
            const forceX = (targetX - beamX) * forceMultiplier;
            const forceY = (targetY - beamY) * forceMultiplier;

            // Calculate acceleration (F = ma, so a = F/m)
            const accelX = forceX / mass;
            const accelY = forceY / mass;

            // Update velocity
            velocityX += accelX;
            velocityY += accelY;

            // Apply damping (friction/air resistance)
            velocityX *= damping;
            velocityY *= damping;

            // Update position
            beamX += velocityX;
            beamY += velocityY;

            // Apply per-point jitter
            let pJitterX = 0;
            let pJitterY = 0;
            if (pointJitter > 0) {
                pJitterX = (Math.random() - 0.5) * pointJitter;
                pJitterY = (Math.random() - 0.5) * pointJitter;
            }

            // Convert to screen coordinates
            const screenX = centerX + beamX + frameJitterX + pJitterX;
            const screenY = centerY + beamY + frameJitterY + pJitterY;

            if (isFirstPoint) {
                ctx.moveTo(screenX, screenY);
                isFirstPoint = false;
            } else {
                ctx.lineTo(screenX, screenY);
            }
        }

        ctx.stroke();
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
            // Clear canvas when stopped
            if (ctx) {
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
        }
    });

    // Reset physics state when switching modes
    $effect(() => {
        if (usePhysicsMode) {
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
    <div class="controls">
        <label>
            <input type="checkbox" bind:checked={usePhysicsMode} />
            Physics Mode
        </label>
        <label>
            <input type="checkbox" bind:checked={enableJitter} />
            Jitter
        </label>
        <label class:disabled={usePhysicsMode}>
            <input type="checkbox" bind:checked={enableOvershoot} disabled={usePhysicsMode} />
            Overshoot
        </label>
    </div>

    {#if usePhysicsMode}
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
            <label>Persistence: {persistence.toFixed(2)}</label>
            <input type="range" min="0.0" max="0.5" step="0.01" bind:value={persistence} />
        </div>
        <div class="slider-control">
            <label>Point Jitter: {pointJitter.toFixed(1)}px</label>
            <input type="range" min="0" max="10" step="0.1" bind:value={pointJitter} />
        </div>
    </div>
    {/if}

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

    .controls {
        display: flex;
        gap: 15px;
        margin: 10px 0;
        justify-content: center;
    }

    .controls label {
        display: flex;
        align-items: center;
        gap: 5px;
        color: #4CAF50;
        font-family: system-ui;
        font-size: 14px;
        cursor: pointer;
    }

    .controls label.disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .controls input[type="checkbox"] {
        cursor: pointer;
    }

    .controls input[type="checkbox"]:disabled {
        cursor: not-allowed;
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

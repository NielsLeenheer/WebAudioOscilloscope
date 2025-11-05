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

        // Clear canvas with a slight fade effect for persistence
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
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

        // Physics parameters
        const forceMultiplier = 0.15;  // How strongly the beam is pulled to target
        const damping = 0.85;           // Velocity damping (0-1, lower = more damping)
        const mass = 1.0;               // Beam "mass" (affects acceleration)

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

            // Convert to screen coordinates
            const screenX = centerX + beamX + frameJitterX;
            const screenY = centerY + beamY + frameJitterY;

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

    .hint {
        margin: 10px 0 0 0;
        color: #888;
        font-size: 12px;
        font-family: system-ui;
        text-align: center;
    }
</style>

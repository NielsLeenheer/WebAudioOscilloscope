// Physics simulation and rendering worker with OffscreenCanvas
let beamX = 0;
let beamY = 0;
let velocityX = 0;
let velocityY = 0;
let offscreenCanvas = null;
let ctx = null;

// FPS tracking
let lastFrameTime = performance.now();
let fps = 0;
let frameCount = 0;
let fpsUpdateTime = performance.now();

self.onmessage = function(e) {
    const { type, data } = e.data;

    if (type === 'init') {
        // Receive the OffscreenCanvas
        offscreenCanvas = data.canvas;
        ctx = offscreenCanvas.getContext('2d');
        return;
    }

    if (type === 'reset') {
        beamX = 0;
        beamY = 0;
        velocityX = 0;
        velocityY = 0;
        return;
    }

    if (type === 'render') {
        const {
            leftData,
            rightData,
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
            canvasWidth,
            canvasHeight
        } = data;

        if (!ctx) return;

        // Clear canvas with adjustable fade effect for persistence
        ctx.fillStyle = `rgba(0, 0, 0, ${1 - persistence})`;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Draw grid
        drawGrid(ctx, centerX, centerY, canvasWidth, canvasHeight);

        // Calculate physics and collect all points first
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const points = [];
        const speeds = [];

        for (let i = 0; i < leftData.length; i++) {
            // Add noise to audio signal if enabled
            let leftSignal = leftData[i];
            let rightSignal = rightData[i];

            if (signalNoise > 0) {
                leftSignal += (Math.random() - 0.5) * signalNoise;
                rightSignal += (Math.random() - 0.5) * signalNoise;
            }

            // Target position from audio data (with noise)
            const targetX = leftSignal * scale;
            const targetY = -rightSignal * scale;

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

            // Safety checks: prevent NaN/Infinity and extreme values
            if (!isFinite(beamX) || !isFinite(beamY) || !isFinite(velocityX) || !isFinite(velocityY)) {
                // Reset to origin if values become invalid
                beamX = 0;
                beamY = 0;
                velocityX = 0;
                velocityY = 0;
            } else {
                // Clamp beam position to reasonable bounds (prevent runaway)
                const maxPosition = scale * 10; // Allow some overshoot but not too much
                beamX = Math.max(-maxPosition, Math.min(maxPosition, beamX));
                beamY = Math.max(-maxPosition, Math.min(maxPosition, beamY));

                // Clamp velocities to prevent extreme values
                const maxVelocity = scale * 2;
                velocityX = Math.max(-maxVelocity, Math.min(maxVelocity, velocityX));
                velocityY = Math.max(-maxVelocity, Math.min(maxVelocity, velocityY));
            }

            // Convert to screen coordinates
            const screenX = centerX + beamX;
            const screenY = centerY + beamY;

            points.push({ x: screenX, y: screenY });

            // Calculate speed for this point
            if (points.length > 1) {
                const prev = points[points.length - 2];
                const dx = screenX - prev.x;
                const dy = screenY - prev.y;
                const speed = Math.sqrt(dx * dx + dy * dy);
                speeds.push(speed);
            }
        }

        // Smooth the speeds array to avoid harsh opacity transitions
        const smoothedSpeeds = [];
        const smoothWindow = 3; // Smooth over 3 points
        for (let i = 0; i < speeds.length; i++) {
            let sum = 0;
            let count = 0;
            for (let j = Math.max(0, i - smoothWindow); j <= Math.min(speeds.length - 1, i + smoothWindow); j++) {
                sum += speeds[j];
                count++;
            }
            smoothedSpeeds.push(sum / count);
        }

        // Draw smooth continuous path with gradual opacity changes
        if (points.length > 2) {
            // Start the path
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);

            // Build the smooth path using quadratic curves
            for (let i = 1; i < points.length - 1; i++) {
                const curr = points[i];
                const next = points[i + 1];
                // Use midpoint for smooth curves
                const midX = (curr.x + next.x) / 2;
                const midY = (curr.y + next.y) / 2;
                ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
            }

            // Final point
            const last = points[points.length - 1];
            const secondLast = points[points.length - 2];
            ctx.quadraticCurveTo(secondLast.x, secondLast.y, last.x, last.y);

            // Calculate average speed for overall opacity
            let totalSpeed = 0;
            for (let i = 0; i < smoothedSpeeds.length; i++) {
                totalSpeed += smoothedSpeeds[i];
            }
            const avgSpeed = smoothedSpeeds.length > 0 ? totalSpeed / smoothedSpeeds.length : 0;

            // Apply velocity-based opacity
            let velocityOpacity = 1.0;
            if (velocityDimming > 0 && avgSpeed > 0) {
                const falloffRate = 20;
                const dimFactor = Math.exp(-avgSpeed / falloffRate);
                velocityOpacity = 1.0 - velocityDimming * (1.0 - dimFactor);
                const minOpacity = 0.02 * velocityDimming;
                velocityOpacity = Math.max(velocityOpacity, minOpacity);
            }

            const finalOpacity = basePower * velocityOpacity;
            ctx.strokeStyle = `rgba(76, 175, 80, ${finalOpacity})`;
            ctx.stroke();
        }

        // Calculate FPS
        const currentTime = performance.now();
        frameCount++;

        // Update FPS every 500ms
        if (currentTime - fpsUpdateTime >= 500) {
            fps = Math.round((frameCount * 1000) / (currentTime - fpsUpdateTime));
            frameCount = 0;
            fpsUpdateTime = currentTime;
        }

        // Draw FPS indicator
        ctx.fillStyle = '#4CAF50';
        ctx.font = '14px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${fps} FPS`, canvasWidth - 10, 20);

        lastFrameTime = currentTime;

        // Send ready message back to main thread
        self.postMessage({ type: 'ready' });
    }
};

function drawGrid(ctx, centerX, centerY, width, height) {
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;

    // Draw center crosshair
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, height);
    ctx.stroke();

    // Draw circle guide
    const radius = Math.min(width, height) / 2.5;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.stroke();
}

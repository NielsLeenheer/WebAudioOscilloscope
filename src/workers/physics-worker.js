// Physics simulation and rendering worker with OffscreenCanvas
let beamX = 0;
let beamY = 0;
let velocityX = 0;
let velocityY = 0;
let smoothedBeamX = 0;
let smoothedBeamY = 0;
let offscreenCanvas = null;
let ctx = null;

// Position smoothing factor (0-1): higher = less smoothing, lower = more smoothing
const SMOOTHING_ALPHA = 0.4;

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
        smoothedBeamX = 0;
        smoothedBeamY = 0;
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
                smoothedBeamX = 0;
                smoothedBeamY = 0;
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

            // Apply exponential smoothing to positions
            // This creates naturally smooth movement while preserving physics accuracy
            smoothedBeamX = SMOOTHING_ALPHA * beamX + (1 - SMOOTHING_ALPHA) * smoothedBeamX;
            smoothedBeamY = SMOOTHING_ALPHA * beamY + (1 - SMOOTHING_ALPHA) * smoothedBeamY;

            // Convert to screen coordinates using smoothed positions
            const screenX = centerX + smoothedBeamX;
            const screenY = centerY + smoothedBeamY;

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

        // Draw each segment with per-segment velocity-based dimming using smooth curves
        // Use quadratic Bézier curves for visual smoothness
        if (points.length > 2) {
            // First segment: start at first point, curve to midpoint
            const firstMidX = (points[0].x + points[1].x) / 2;
            const firstMidY = (points[0].y + points[1].y) / 2;

            let velocityOpacity = 1.0;
            if (velocityDimming > 0 && speeds[0] > 0) {
                const falloffRate = 20;
                const dimFactor = Math.exp(-speeds[0] / falloffRate);
                velocityOpacity = 1.0 - velocityDimming * (1.0 - dimFactor);
                const minOpacity = 0.02 * velocityDimming;
                velocityOpacity = Math.max(velocityOpacity, minOpacity);
            }

            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            ctx.lineTo(firstMidX, firstMidY);
            ctx.strokeStyle = `rgba(76, 175, 80, ${basePower * velocityOpacity})`;
            ctx.stroke();

            // Middle segments: curve from midpoint to midpoint through the actual point
            for (let i = 1; i < points.length - 1; i++) {
                const prevMidX = (points[i - 1].x + points[i].x) / 2;
                const prevMidY = (points[i - 1].y + points[i].y) / 2;
                const nextMidX = (points[i].x + points[i + 1].x) / 2;
                const nextMidY = (points[i].y + points[i + 1].y) / 2;

                const speed = speeds[i] || 0;

                // Calculate velocity-based opacity for this segment
                velocityOpacity = 1.0;
                if (velocityDimming > 0 && speed > 0) {
                    const falloffRate = 20;
                    const dimFactor = Math.exp(-speed / falloffRate);
                    velocityOpacity = 1.0 - velocityDimming * (1.0 - dimFactor);
                    const minOpacity = 0.02 * velocityDimming;
                    velocityOpacity = Math.max(velocityOpacity, minOpacity);
                }

                const finalOpacity = basePower * velocityOpacity;

                // Draw smooth curve through this point
                ctx.beginPath();
                ctx.moveTo(prevMidX, prevMidY);
                ctx.quadraticCurveTo(points[i].x, points[i].y, nextMidX, nextMidY);
                ctx.strokeStyle = `rgba(76, 175, 80, ${finalOpacity})`;
                ctx.stroke();
            }

            // Last segment: curve from midpoint to last point
            const lastIdx = points.length - 1;
            const lastMidX = (points[lastIdx - 1].x + points[lastIdx].x) / 2;
            const lastMidY = (points[lastIdx - 1].y + points[lastIdx].y) / 2;

            const lastSpeed = speeds[lastIdx - 1] || 0;
            velocityOpacity = 1.0;
            if (velocityDimming > 0 && lastSpeed > 0) {
                const falloffRate = 20;
                const dimFactor = Math.exp(-lastSpeed / falloffRate);
                velocityOpacity = 1.0 - velocityDimming * (1.0 - dimFactor);
                const minOpacity = 0.02 * velocityDimming;
                velocityOpacity = Math.max(velocityOpacity, minOpacity);
            }

            ctx.beginPath();
            ctx.moveTo(lastMidX, lastMidY);
            ctx.lineTo(points[lastIdx].x, points[lastIdx].y);
            ctx.strokeStyle = `rgba(76, 175, 80, ${basePower * velocityOpacity})`;
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

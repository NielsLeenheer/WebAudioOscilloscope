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

// Number of sub-segments to split each curve into for gradual opacity transitions
const SUBSEGMENTS = 8;

// Ease-in-out function for smooth opacity transitions
function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// Calculate point on quadratic Bézier curve at parameter t (0-1)
function quadraticBezierPoint(p0x, p0y, p1x, p1y, p2x, p2y, t) {
    const oneMinusT = 1 - t;
    const x = oneMinusT * oneMinusT * p0x + 2 * oneMinusT * t * p1x + t * t * p2x;
    const y = oneMinusT * oneMinusT * p0y + 2 * oneMinusT * t * p1y + t * t * p2y;
    return { x, y };
}

// Calculate velocity-based opacity for a given speed
function calculateVelocityOpacity(speed, velocityDimming, basePower) {
    let velocityOpacity = 1.0;
    if (velocityDimming > 0 && speed > 0) {
        const falloffRate = 20;
        const dimFactor = Math.exp(-speed / falloffRate);
        velocityOpacity = 1.0 - velocityDimming * (1.0 - dimFactor);
        const minOpacity = 0.02 * velocityDimming;
        velocityOpacity = Math.max(velocityOpacity, minOpacity);
    }
    return basePower * velocityOpacity;
}

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

        // Draw each segment with gradual velocity-based dimming using smooth curves
        // Split each Bézier curve into sub-segments with ease-in-out opacity transitions
        if (points.length > 2) {
            // First segment: start at first point, straight line to midpoint
            const firstMidX = (points[0].x + points[1].x) / 2;
            const firstMidY = (points[0].y + points[1].y) / 2;

            const firstOpacity = calculateVelocityOpacity(speeds[0] || 0, velocityDimming, basePower);
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            ctx.lineTo(firstMidX, firstMidY);
            ctx.strokeStyle = `rgba(76, 175, 80, ${firstOpacity})`;
            ctx.stroke();

            // Middle segments: curve from midpoint to midpoint through the actual point
            // Split each curve into sub-segments for gradual opacity changes
            for (let i = 1; i < points.length - 1; i++) {
                const prevMidX = (points[i - 1].x + points[i].x) / 2;
                const prevMidY = (points[i - 1].y + points[i].y) / 2;
                const nextMidX = (points[i].x + points[i + 1].x) / 2;
                const nextMidY = (points[i].y + points[i + 1].y) / 2;

                // Get opacities for current and next point
                const currentSpeed = speeds[i] || 0;
                const nextSpeed = speeds[i + 1] || 0;
                const currentOpacity = calculateVelocityOpacity(currentSpeed, velocityDimming, basePower);
                const nextOpacity = calculateVelocityOpacity(nextSpeed, velocityDimming, basePower);

                // Draw curve as multiple sub-segments with interpolated opacity
                for (let s = 0; s < SUBSEGMENTS; s++) {
                    const t1 = s / SUBSEGMENTS;
                    const t2 = (s + 1) / SUBSEGMENTS;

                    // Calculate points on the Bézier curve
                    const pt1 = quadraticBezierPoint(prevMidX, prevMidY, points[i].x, points[i].y, nextMidX, nextMidY, t1);
                    const pt2 = quadraticBezierPoint(prevMidX, prevMidY, points[i].x, points[i].y, nextMidX, nextMidY, t2);

                    // Interpolate opacity with ease-in-out
                    const easedT = easeInOutQuad(t1 + 0.5 / SUBSEGMENTS); // Use middle of sub-segment
                    const interpolatedOpacity = currentOpacity + (nextOpacity - currentOpacity) * easedT;

                    // Draw sub-segment
                    ctx.beginPath();
                    ctx.moveTo(pt1.x, pt1.y);
                    ctx.lineTo(pt2.x, pt2.y);
                    ctx.strokeStyle = `rgba(76, 175, 80, ${interpolatedOpacity})`;
                    ctx.stroke();
                }
            }

            // Last segment: straight line from midpoint to last point
            const lastIdx = points.length - 1;
            const lastMidX = (points[lastIdx - 1].x + points[lastIdx].x) / 2;
            const lastMidY = (points[lastIdx - 1].y + points[lastIdx].y) / 2;

            const lastOpacity = calculateVelocityOpacity(speeds[lastIdx - 1] || 0, velocityDimming, basePower);
            ctx.beginPath();
            ctx.moveTo(lastMidX, lastMidY);
            ctx.lineTo(points[lastIdx].x, points[lastIdx].y);
            ctx.strokeStyle = `rgba(76, 175, 80, ${lastOpacity})`;
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

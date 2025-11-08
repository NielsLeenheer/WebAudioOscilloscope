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
const MAX_SUBSEGMENTS = 8;
const MIN_SUBSEGMENT_LENGTH = 4; // Minimum pixels per sub-segment

// Ease-in function for opacity transitions (quartic: slow start with delay, then accelerate)
// Mimics physics behavior where magnetic force takes time to overcome inertia
function easeInQuartic(t) {
    return t * t * t * t;
}

// Calculate point on quadratic Bézier curve at parameter t (0-1)
function quadraticBezierPoint(p0x, p0y, p1x, p1y, p2x, p2y, t) {
    const oneMinusT = 1 - t;
    const x = oneMinusT * oneMinusT * p0x + 2 * oneMinusT * t * p1x + t * t * p2x;
    const y = oneMinusT * oneMinusT * p0y + 2 * oneMinusT * t * p1y + t * t * p2y;
    return { x, y };
}

// Estimate the length of a quadratic Bézier curve
function estimateBezierLength(p0x, p0y, p1x, p1y, p2x, p2y) {
    let length = 0;
    const samples = 10;
    let prevPoint = { x: p0x, y: p0y };

    for (let i = 1; i <= samples; i++) {
        const t = i / samples;
        const point = quadraticBezierPoint(p0x, p0y, p1x, p1y, p2x, p2y, t);
        const dx = point.x - prevPoint.x;
        const dy = point.y - prevPoint.y;
        length += Math.sqrt(dx * dx + dy * dy);
        prevPoint = point;
    }

    return length;
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

// Find trigger point: looks for rising edge where signal crosses trigger level
function findTriggerPoint(data, triggerLevel) {
    // Start search from 10% into the buffer to avoid edge effects
    const startSearch = Math.floor(data.length * 0.1);

    for (let i = startSearch; i < data.length - 1; i++) {
        // Rising edge: previous sample below trigger, current sample above
        if (data[i] <= triggerLevel && data[i + 1] > triggerLevel) {
            return i + 1;
        }
    }

    // No trigger found, return start position
    return 0;
}

// ============================================================================
// STAGE A: SIGNAL PROCESSING
// Add noise to raw audio data (same for all modes)
// ============================================================================
function processSignals(leftData, rightData, signalNoise) {
    const processedLeft = [];
    const processedRight = [];

    for (let i = 0; i < leftData.length; i++) {
        let left = leftData[i];
        let right = rightData[i];

        // Add noise if enabled
        if (signalNoise > 0) {
            left += (Math.random() - 0.5) * signalNoise;
            right += (Math.random() - 0.5) * signalNoise;
        }

        processedLeft.push(left);
        processedRight.push(right);
    }

    return { processedLeft, processedRight };
}

// ============================================================================
// STAGE B: INTERPRETATION
// Convert processed signals to target coordinates based on mode
// ============================================================================
function interpretSignals(processedLeft, processedRight, mode, scale, visibleScale, centerX, centerY, canvasWidth, timeDiv, triggerLevel, amplDivA, positionA, amplDivB, positionB, xPosition, visibleWidth, sampleRate, decay) {
    const targets = [];

    // Use amplitude directly (already calculated from base * fine in UI)
    const expAmplDivA = amplDivA;
    const expAmplDivB = amplDivB;

    if (mode === 'xy') {
        // X/Y mode: left channel = X (with A controls), right channel = Y (with B controls)
        // X position offset - scale by visibleWidth so position control shifts within visible area
        const xOffset = xPosition * visibleWidth;

        // Use only the most recent samples to avoid overdraw from large buffer
        // Decay parameter controls how many points to render
        const startIdx = Math.max(0, processedLeft.length - decay);

        for (let i = startIdx; i < processedLeft.length; i++) {
            // Left channel (A) controls horizontal with AMPL/DIV A and POSITION A
            // Use visibleScale for XY mode to respect AMPL/DIV settings for visible viewport
            const posOffsetA = positionA * visibleScale * 2;
            const targetX = processedLeft[i] * visibleScale / expAmplDivA + posOffsetA + xOffset;

            // Right channel (B) controls vertical with AMPL/DIV B and POSITION B (but inverted for Y axis)
            const posOffsetB = positionB * visibleScale * 2;
            const targetY = -processedRight[i] * visibleScale / expAmplDivB + posOffsetB;

            targets.push({ x: targetX, y: targetY });
        }
    } else {
        // A or B mode: Time-based waveform with triggering
        const channelData = mode === 'a' ? processedLeft : processedRight;

        // Use the appropriate channel controls (with exponential curve applied)
        const amplDiv = mode === 'a' ? expAmplDivA : expAmplDivB;
        const position = mode === 'a' ? positionA : positionB;

        // Find trigger point
        const triggerIndex = findTriggerPoint(channelData, triggerLevel);

        // Calculate how many samples to display based on TIME/DIV
        // timeDiv is in microseconds, convert to seconds and multiply by 10 divisions
        const timePerDiv = timeDiv / 1000000; // Convert microseconds to seconds
        const totalTime = timePerDiv * 10; // 10 divisions across the screen
        const samplesToDisplay = Math.min(
            Math.floor(sampleRate * totalTime),
            channelData.length,
            decay // Limit by decay to prevent overdraw from large buffer
        );

        // Determine start and end indices
        const startIndex = triggerIndex;
        const endIndex = Math.min(startIndex + samplesToDisplay, channelData.length);

        // X position offset (convert from -1 to 1 range to pixel offset)
        // Scale by visibleWidth so position control shifts within visible area
        const xOffset = xPosition * visibleWidth;

        // Create target coordinates for the triggered portion
        for (let i = startIndex; i < endIndex; i++) {
            const relativeIndex = i - startIndex;
            // X position is based on time with position offset
            // Spread waveform across full canvas width (600px) for overscan
            // Visible area (400px) clips it, X POS shifts to reveal different portions
            const targetX = (relativeIndex / samplesToDisplay) * canvasWidth - canvasWidth / 2 + xOffset;
            // Y position is based on amplitude with AMPL/DIV and Y position offset
            // Use visibleScale for amplitude calculations (based on visible 400px area)
            const yOffset = position * visibleScale * 2; // Scale the position offset
            const targetY = -channelData[i] * visibleScale / amplDiv + yOffset;
            targets.push({ x: targetX, y: targetY });
        }
    }

    return targets;
}

// ============================================================================
// STAGE C: PHYSICS SIMULATION
// Apply electron beam physics uniformly to all target coordinates
// ============================================================================
function simulatePhysics(targets, forceMultiplier, damping, mass, scale, centerX, centerY) {
    const points = [];
    const speeds = [];

    for (let i = 0; i < targets.length; i++) {
        const target = targets[i];

        // Calculate force (like a spring pulling beam to target)
        const forceX = (target.x - beamX) * forceMultiplier;
        const forceY = (target.y - beamY) * forceMultiplier;

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
            const maxPosition = scale * 10;
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

    return { points, speeds };
}

// ============================================================================
// RENDERING - Draw the simulated beam path
// ============================================================================
function renderTrace(ctx, points, speeds, velocityDimming, basePower) {
    // Configure canvas for drawing
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'butt'; // Use 'butt' to prevent overlapping caps at connection points
    ctx.lineJoin = 'round';

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

            // Estimate curve length to determine number of sub-segments
            const curveLength = estimateBezierLength(prevMidX, prevMidY, points[i].x, points[i].y, nextMidX, nextMidY);
            const numSubSegments = Math.max(1, Math.min(MAX_SUBSEGMENTS, Math.floor(curveLength / MIN_SUBSEGMENT_LENGTH)));

            // Get opacities for current and next point
            const currentSpeed = speeds[i] || 0;
            const nextSpeed = speeds[i + 1] || 0;
            const currentOpacity = calculateVelocityOpacity(currentSpeed, velocityDimming, basePower);
            const nextOpacity = calculateVelocityOpacity(nextSpeed, velocityDimming, basePower);

            // Draw curve as multiple sub-segments with interpolated opacity
            for (let s = 0; s < numSubSegments; s++) {
                const t1 = s / numSubSegments;
                const t2 = (s + 1) / numSubSegments;

                // Calculate points on the Bézier curve
                // Offset start point very slightly to avoid overlapping with previous segment's endpoint
                const t1Offset = s === 0 ? t1 : t1 + 0.001 / numSubSegments;
                const pt1 = quadraticBezierPoint(prevMidX, prevMidY, points[i].x, points[i].y, nextMidX, nextMidY, t1Offset);
                const pt2 = quadraticBezierPoint(prevMidX, prevMidY, points[i].x, points[i].y, nextMidX, nextMidY, t2);

                // Interpolate opacity with ease-in (slow start, then accelerate)
                const easedT = easeInQuartic(t1 + 0.5 / numSubSegments); // Use middle of sub-segment
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
}

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

    if (type === 'clear') {
        // Clear the canvas completely (power off)
        if (!ctx || !offscreenCanvas) return;
        ctx.fillStyle = 'rgb(26, 31, 26)';
        ctx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);

        // Reset beam position
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
            visibleScale,
            forceMultiplier,
            damping,
            mass,
            signalNoise,
            basePower,
            persistence,
            velocityDimming,
            decay,
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
        } = data;

        if (!ctx) return;

        // Clear canvas with adjustable fade effect for persistence
        // Background: dark gray with greenish tint (#1a1f1a = rgb(26, 31, 26))
        ctx.fillStyle = `rgba(26, 31, 26, ${1 - persistence})`;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // ========================================================================
        // THREE-STAGE RENDERING PIPELINE
        // ========================================================================

        // STAGE A: Signal Processing - Add noise to raw audio data
        const { processedLeft, processedRight } = processSignals(leftData, rightData, signalNoise);

        // Handle A/B mode: render both channels sequentially
        const modesToRender = mode === 'ab' ? ['a', 'b'] : [mode];

        for (const currentMode of modesToRender) {
            // STAGE B: Interpretation - Convert signals to target coordinates based on mode
            const targets = interpretSignals(processedLeft, processedRight, currentMode, scale, visibleScale, centerX, centerY, canvasWidth, timeDiv, triggerLevel, amplDivA, positionA, amplDivB, positionB, xPosition, visibleWidth, sampleRate, decay);

            // Teleport beam to first target to prevent spurious lines from previous frame
            // This eliminates the line that would be drawn from the last position of the
            // previous frame to the first position of the current frame
            if (targets.length > 0) {
                beamX = targets[0].x;
                beamY = targets[0].y;
                velocityX = 0;
                velocityY = 0;
                smoothedBeamX = targets[0].x;
                smoothedBeamY = targets[0].y;
            }

            // STAGE C: Physics Simulation - Apply electron beam physics uniformly
            const { points, speeds } = simulatePhysics(targets, forceMultiplier, damping, mass, scale, centerX, centerY);

            // ========================================================================
            // RENDERING - Draw the simulated beam path
            // ========================================================================

            renderTrace(ctx, points, speeds, velocityDimming, basePower);
        }

        // Send ready message back to main thread
        self.postMessage({ type: 'ready' });
    }
};

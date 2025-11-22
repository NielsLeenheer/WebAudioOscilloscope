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

// Calculate phosphor excitation based on beam power and velocity (dwell time)
// Models realistic CRT phosphor behavior using P31 phosphor characteristics:
// - Higher beam power (current) = more phosphor excitation
// - Lower velocity = longer dwell time = more energy deposited = brighter
// - Realistic phosphor saturation based on actual CRT physics
function calculatePhosphorExcitation(speed, velocityDimming, basePower, deltaTime) {
    // Beam power represents the electron beam current/intensity
    const beamCurrent = basePower;

    // Calculate velocity in pixels/second (frame-rate independent)
    // speed is in pixels/frame, deltaTime is in seconds
    const velocity = deltaTime > 0 ? speed / deltaTime : 0;

    // Dwell time model (recalibrated for realistic scope behavior):
    // The reference velocity is the speed at which dimming becomes noticeable
    // Real scopes show very aggressive dimming - fast movements are almost invisible
    const REFERENCE_VELOCITY = 300; // pixels/second where dimming starts
    const BEAM_SPOT_SIZE = 1.5; // Effective beam spot diameter in pixels

    // Calculate energy deposition factor based on velocity
    // Low velocity → full excitation (factor = 1.0)
    // High velocity → reduced excitation (factor → 0)
    let energyFactor;

    if (velocity < BEAM_SPOT_SIZE) {
        // Very slow or stationary: maximum excitation
        energyFactor = 1.0;
    } else {
        // Energy deposition inversely proportional to velocity
        // This models the physical reality: faster beam = less time on each phosphor grain
        energyFactor = (REFERENCE_VELOCITY / velocity);

        // Apply power curve for aggressive dimming at high speeds
        // Use 1.5 power instead of 2 for less aggressive curve
        energyFactor = Math.pow(energyFactor, 1.5);

        // Clamp to minimum (fast movements dim but still visible)
        energyFactor = Math.max(0.01, Math.min(1.0, energyFactor));
    }

    // Apply velocity dimming control (allows artistic adjustment)
    let depositedEnergy;
    if (velocityDimming < 1.0) {
        // Mix between full physics (velocityDimming=1) and no dimming (velocityDimming=0)
        depositedEnergy = beamCurrent * (velocityDimming * energyFactor + (1.0 - velocityDimming));
    } else {
        depositedEnergy = beamCurrent * energyFactor;
    }

    // P31 phosphor saturation curve
    // Real phosphors follow a logarithmic response at high excitation levels
    // Using a smooth compression curve that matches measured P31 characteristics
    const SATURATION_KNEE = 0.6; // Energy level where saturation becomes noticeable
    const SATURATION_STRENGTH = 0.4; // How aggressive the saturation is (0-1)

    // Logarithmic saturation model: log(1 + energy * k) / log(1 + k)
    // This gives a smooth, realistic phosphor response curve
    const k = 10.0; // Compression factor
    let brightness;

    if (depositedEnergy < SATURATION_KNEE) {
        // Linear region: no saturation
        brightness = depositedEnergy;
    } else {
        // Saturation region: logarithmic compression
        const excess = depositedEnergy - SATURATION_KNEE;
        const compressed = Math.log(1 + excess * k) / Math.log(1 + k);
        brightness = SATURATION_KNEE + compressed * SATURATION_STRENGTH;
    }

    // Ensure brightness is in valid range
    return Math.max(0, Math.min(1, brightness));
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
function interpretSignals(processedLeft, processedRight, mode, scale, visibleScale, centerX, centerY, canvasWidth, timeDiv, triggerLevel, triggerChannel, amplDivA, positionA, amplDivB, positionB, xPosition, visibleWidth, sampleRate, decay) {
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

        // Find trigger point based on triggerChannel (not display mode)
        // This allows both channels to sync to the same trigger source
        const triggerData = triggerChannel === 'a' ? processedLeft : processedRight;
        const triggerIndex = findTriggerPoint(triggerData, triggerLevel);

        // Calculate how many samples to display based on TIME/DIV
        // timeDiv is in microseconds, convert to seconds and multiply by 10 divisions
        const timePerDiv = timeDiv / 1000000; // Convert microseconds to seconds
        const totalTime = timePerDiv * 10; // 10 divisions across the screen
        // For time domain, use exact samples needed for TIME/DIV (don't limit by decay)
        // Decay is only for XY mode overdraw prevention
        const samplesToDisplay = Math.min(
            Math.floor(sampleRate * totalTime),
            channelData.length
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
            // Spread waveform across visible width (400px) for accurate TIME/DIV calibration
            // X POS offset shifts it left/right for alignment
            const targetX = (relativeIndex / samplesToDisplay) * visibleWidth - visibleWidth / 2 + xOffset;
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
// STAGE C: PHYSICS SIMULATION - Spring-Damper Model (Original)
// Apply spring-damper physics to beam
// ============================================================================
function simulatePhysicsSpring(targets, forceMultiplier, damping, mass, scale, centerX, centerY) {
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

        // Clamp velocity to prevent extreme instability with very high force values
        // Max velocity scales with sqrt(force/mass) and allows very high speeds for CRT beam
        const maxVelocity = Math.sqrt(forceMultiplier / mass) * scale * 5.0;
        const currentSpeed = Math.sqrt(velocityX * velocityX + velocityY * velocityY);
        if (currentSpeed > maxVelocity) {
            const scale_factor = maxVelocity / currentSpeed;
            velocityX *= scale_factor;
            velocityY *= scale_factor;
        }

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
// STAGE C: PHYSICS SIMULATION - Electromagnetic Deflection Model (New)
// Simulates realistic CRT electron beam deflection by electromagnetic coils
// ============================================================================
function simulatePhysicsElectromagnetic(targets, forceMultiplier, damping, mass, scale, centerX, centerY) {
    const points = [];
    const speeds = [];

    for (let i = 0; i < targets.length; i++) {
        const target = targets[i];

        // In a real CRT:
        // 1. Deflection coils create magnetic fields proportional to the signal (coil current)
        // 2. The magnetic field deflects the electron beam
        // 3. The beam has inertia and will overshoot the target position
        // 4. The deflection force is proportional to the difference between target and current position

        // Calculate the deflection force (magnetic field pulling beam toward target)
        // The force is proportional to (target - current), like the coil current driving the deflection
        const forceX = (target.x - beamX) * forceMultiplier;
        const forceY = (target.y - beamY) * forceMultiplier;

        // Calculate acceleration from force (F = ma, so a = F/m)
        const accelX = forceX / mass;
        const accelY = forceY / mass;

        // Update velocity with acceleration
        velocityX += accelX;
        velocityY += accelY;

        // Apply damping (represents beam interaction with residual gas in the CRT)
        // Damping value is used directly - adjust via Field Damping parameter
        velocityX *= damping;
        velocityY *= damping;

        // Update beam position
        beamX += velocityX;
        beamY += velocityY;

        // Safety checks: prevent NaN/Infinity and extreme values
        if (!isFinite(beamX) || !isFinite(beamY) || !isFinite(velocityX) || !isFinite(velocityY)) {
            beamX = 0;
            beamY = 0;
            velocityX = 0;
            velocityY = 0;
            smoothedBeamX = 0;
            smoothedBeamY = 0;
        } else {
            // Clamp beam position to reasonable bounds
            const maxPosition = scale * 10;
            beamX = Math.max(-maxPosition, Math.min(maxPosition, beamX));
            beamY = Math.max(-maxPosition, Math.min(maxPosition, beamY));

            // Clamp velocities
            const maxVelocity = scale * 3;
            velocityX = Math.max(-maxVelocity, Math.min(maxVelocity, velocityX));
            velocityY = Math.max(-maxVelocity, Math.min(maxVelocity, velocityY));
        }

        // Less smoothing for electromagnetic model to show more realistic overshoot
        const EM_SMOOTHING = 0.6; // Higher = less smoothing, more responsive
        smoothedBeamX = EM_SMOOTHING * beamX + (1 - EM_SMOOTHING) * smoothedBeamX;
        smoothedBeamY = EM_SMOOTHING * beamY + (1 - EM_SMOOTHING) * smoothedBeamY;

        // Convert to screen coordinates
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
// PHYSICS SIMULATION DISPATCHER
// Chooses the appropriate physics model based on simulationMode
// ============================================================================
function simulatePhysics(targets, simulationMode, forceMultiplier, damping, mass, scale, centerX, centerY) {
    if (simulationMode === 'spring') {
        return simulatePhysicsSpring(targets, forceMultiplier, damping, mass, scale, centerX, centerY);
    } else {
        // Default to electromagnetic model
        return simulatePhysicsElectromagnetic(targets, forceMultiplier, damping, mass, scale, centerX, centerY);
    }
}

// ============================================================================
// RENDERING - Phosphor Model (Current/Default)
// ============================================================================
function renderTracePhosphor(ctx, points, speeds, velocityDimming, basePower, deltaTime) {
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

        const firstOpacity = calculatePhosphorExcitation(speeds[0] || 0, velocityDimming, basePower, deltaTime);
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
            const currentOpacity = calculatePhosphorExcitation(currentSpeed, velocityDimming, basePower, deltaTime);
            const nextOpacity = calculatePhosphorExcitation(nextSpeed, velocityDimming, basePower, deltaTime);

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

        const lastOpacity = calculatePhosphorExcitation(speeds[lastIdx - 1] || 0, velocityDimming, basePower, deltaTime);
        ctx.beginPath();
        ctx.moveTo(lastMidX, lastMidY);
        ctx.lineTo(points[lastIdx].x, points[lastIdx].y);
        ctx.strokeStyle = `rgba(76, 175, 80, ${lastOpacity})`;
        ctx.stroke();
    }
}

// ============================================================================
// INTERPOLATION - Catmull-Rom Spline
// Creates smooth curves through points for sub-sample temporal resolution
// ============================================================================
function catmullRomInterpolate(p0, p1, p2, p3, t) {
    // Catmull-Rom spline interpolation between p1 and p2
    // p0 and p3 are control points for curve shape
    // t is interpolation parameter (0 to 1)
    const t2 = t * t;
    const t3 = t2 * t;

    return {
        x: 0.5 * (
            (2 * p1.x) +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
        ),
        y: 0.5 * (
            (2 * p1.y) +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
        )
    };
}

function interpolatePoints(points, speeds, targetTimePerPoint, actualTimePerPoint) {
    // If target resolution is coarser than actual, no interpolation needed
    if (targetTimePerPoint >= actualTimePerPoint) {
        return { points, speeds };
    }

    // Calculate how many interpolated points we need between each pair
    const pointsPerSegment = Math.ceil(actualTimePerPoint / targetTimePerPoint);

    const interpolatedPoints = [];
    const interpolatedSpeeds = [];

    for (let i = 0; i < points.length; i++) {
        // Get surrounding points for Catmull-Rom spline
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[Math.min(points.length - 1, i + 1)];
        const p3 = points[Math.min(points.length - 1, i + 2)];

        // Add the actual sample point
        interpolatedPoints.push(p1);
        interpolatedSpeeds.push(speeds[i] || 0);

        // Add interpolated points between p1 and p2 (except for last point)
        if (i < points.length - 1) {
            for (let j = 1; j < pointsPerSegment; j++) {
                const t = j / pointsPerSegment;
                const interpolated = catmullRomInterpolate(p0, p1, p2, p3, t);
                interpolatedPoints.push(interpolated);

                // Interpolate speed linearly
                const speed1 = speeds[i] || 0;
                const speed2 = speeds[i + 1] || 0;
                interpolatedSpeeds.push(speed1 + (speed2 - speed1) * t);
            }
        }
    }

    return {
        points: interpolatedPoints,
        speeds: interpolatedSpeeds
    };
}

// ============================================================================
// RENDERING - Alternative Model (Time-based segmentation)
// ============================================================================
function renderTraceAlternative(ctx, points, speeds, velocityDimming, basePower, deltaTime, sampleRate, debugMode, timeSegment, dotOpacity, dotSizeVariation, sampleDotOpacity) {
    // Time-based segmentation approach:
    // - Segment traces based on fixed time intervals
    // - Fast beam movement = points spread out over time segment
    // - Slow beam movement = points closer together over time segment

    if (points.length < 2) return;

    // Time interval for each segment (in seconds, configurable via debug slider)
    const TIME_SEGMENT = timeSegment / 1000; // Convert from milliseconds to seconds

    // Time per point (assuming points correspond to audio samples)
    // Each point represents one sample from the physics simulation
    const timePerPoint = 1 / sampleRate;

    // Store original points for blue dot visualization
    const originalPoints = points;
    const originalSpeeds = speeds;

    // First pass: detect direction changes on ORIGINAL points (before interpolation)
    // This ensures blue dots are not affected by TIME_SEGMENT setting
    // Direction changes occur at local velocity minima (beam reversal points)
    // Calculate angle of direction change to determine brightness
    const directionChanges = new Map(); // Map of index -> brightness
    for (let i = 1; i < originalPoints.length - 1; i++) {
        const prevSpeed = originalSpeeds[i - 1] || 0;
        const currSpeed = originalSpeeds[i] || 0;
        const nextSpeed = originalSpeeds[i + 1] || 0;

        // Detect local minimum in speed (direction change/reversal point)
        // Also detect when speed drops significantly (approaching zero)
        if (currSpeed < prevSpeed && currSpeed < nextSpeed && currSpeed < 5) {
            // Calculate angle of direction change
            // Incoming velocity vector: from point[i-1] to point[i]
            const inX = originalPoints[i].x - originalPoints[i - 1].x;
            const inY = originalPoints[i].y - originalPoints[i - 1].y;

            // Outgoing velocity vector: from point[i] to point[i+1]
            const outX = originalPoints[i + 1].x - originalPoints[i].x;
            const outY = originalPoints[i + 1].y - originalPoints[i].y;

            // Calculate magnitudes
            const inMag = Math.sqrt(inX * inX + inY * inY);
            const outMag = Math.sqrt(outX * outX + outY * outY);

            if (inMag > 0 && outMag > 0) {
                // Calculate dot product
                const dotProduct = inX * outX + inY * outY;

                // Calculate cosine of angle
                const cosAngle = dotProduct / (inMag * outMag);

                // Clamp to valid range for acos
                const clampedCos = Math.max(-1, Math.min(1, cosAngle));

                // Calculate angle in radians, then convert to degrees
                const angleRad = Math.acos(clampedCos);
                const angleDeg = angleRad * (180 / Math.PI);

                // Map angle to brightness
                // 0° = no change, no dot (brightness = 0)
                // 180° = complete reversal, brightest (brightness = 1)
                // Use a power curve for more natural falloff
                const normalizedAngle = angleDeg / 180; // 0 to 1
                const brightness = Math.pow(normalizedAngle, 1.5); // Power curve emphasizes larger angles

                // Only add if brightness is significant (angle > ~30°)
                if (brightness > 0.05) {
                    directionChanges.set(i, brightness);
                }
            }
        }
    }

    // Apply Catmull-Rom interpolation if TIME_SEGMENT is smaller than timePerPoint
    // This creates smooth curves and allows finer temporal resolution
    const interpolated = interpolatePoints(points, speeds, TIME_SEGMENT, timePerPoint);
    points = interpolated.points;
    speeds = interpolated.speeds;

    // Recalculate timePerPoint for interpolated points
    const interpolatedTimePerPoint = TIME_SEGMENT;

    // Configure canvas for drawing
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Second pass: render segments
    let segmentStartIdx = 0;
    let accumulatedTime = 0;
    const segmentEndpoints = []; // Track segment endpoints for debug visualization

    for (let i = 1; i < points.length; i++) {
        accumulatedTime += interpolatedTimePerPoint;

        // When we've accumulated enough time, draw the segment
        if (accumulatedTime >= TIME_SEGMENT || i === points.length - 1) {
            // Calculate average speed for this time segment
            let totalDistance = 0;
            for (let j = segmentStartIdx + 1; j <= i && j < speeds.length; j++) {
                totalDistance += speeds[j] || 0;
            }
            const avgSpeed = totalDistance / Math.max(1, i - segmentStartIdx);

            // Use phosphor excitation model: faster = dimmer (less dwell time)
            const opacity = calculatePhosphorExcitation(avgSpeed, velocityDimming, basePower, deltaTime);

            // Draw line from segment start to current point
            ctx.beginPath();
            ctx.moveTo(points[segmentStartIdx].x, points[segmentStartIdx].y);

            // Draw through all points in this time segment
            for (let j = segmentStartIdx + 1; j <= i; j++) {
                ctx.lineTo(points[j].x, points[j].y);
            }

            ctx.strokeStyle = `rgba(76, 175, 80, ${opacity})`;
            ctx.stroke();

            // Track segment endpoint for debug visualization
            if (debugMode && i < points.length - 1) {
                segmentEndpoints.push(points[i]);
            }

            // Reset for next segment
            segmentStartIdx = i;
            accumulatedTime = 0;
        }
    }

    // Third pass: highlight direction changes with bright dots
    // Brightness is proportional to angle of direction change (180° = brightest)
    for (const [idx, brightness] of directionChanges) {
        const point = points[idx];
        const opacity = basePower * brightness;

        ctx.fillStyle = `rgba(76, 175, 80, ${opacity})`;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
    }

    // Debug visualization: show segment endpoints as red dots
    // Red dots show time-based segmentation (constant size)
    if (debugMode && dotOpacity > 0) {
        ctx.fillStyle = `rgba(255, 0, 0, ${dotOpacity})`;
        for (let i = 0; i < segmentEndpoints.length; i++) {
            const point = segmentEndpoints[i];
            ctx.beginPath();
            ctx.arc(point.x, point.y, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Fourth pass: show blue dots at every ORIGINAL sample point to visualize temporal resolution
    // Use originalPoints to show actual sample rate, not interpolated points
    // Dot size scales with angle of direction change based on dotSizeVariation
    if (debugMode && sampleDotOpacity > 0) {
        for (let i = 0; i < originalPoints.length; i++) {
            const point = originalPoints[i];

            // Get brightness (angle-based) from directionChanges map
            // directionChanges is indexed by original points before interpolation
            const brightness = directionChanges.get(i) || 0;

            // Calculate dot size based on angle and dotSizeVariation
            // dotSizeVariation: 1 = all same size, 10 = 180° dots are 10x larger
            // Base size is 1px, scales up to 1 * dotSizeVariation for 180° changes
            const baseSize = 1;
            const sizeMultiplier = 1 + (brightness * (dotSizeVariation - 1));
            const dotSize = baseSize * sizeMultiplier;

            ctx.fillStyle = `rgba(59, 130, 246, ${sampleDotOpacity})`; // Blue color
            ctx.beginPath();
            ctx.arc(point.x, point.y, dotSize, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

// ============================================================================
// RENDERING DISPATCHER
// Chooses the appropriate rendering model based on renderingMode
// ============================================================================
function renderTrace(ctx, points, speeds, velocityDimming, basePower, deltaTime, renderingMode, sampleRate, debugMode, timeSegment, dotOpacity, dotSizeVariation, sampleDotOpacity) {
    if (renderingMode === 'alternative') {
        return renderTraceAlternative(ctx, points, speeds, velocityDimming, basePower, deltaTime, sampleRate, debugMode, timeSegment, dotOpacity, dotSizeVariation, sampleDotOpacity);
    } else {
        // Default to phosphor model
        return renderTracePhosphor(ctx, points, speeds, velocityDimming, basePower, deltaTime);
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
            simulationMode,
            renderingMode,
            debugMode,
            timeSegment,
            dotOpacity,
            dotSizeVariation,
            sampleDotOpacity,
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
            triggerChannel,
            amplDivA,
            positionA,
            amplDivB,
            positionB,
            xPosition,
            canvasWidth,
            canvasHeight,
            visibleWidth,
            sampleRate,
            deltaTime
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
            const targets = interpretSignals(processedLeft, processedRight, currentMode, scale, visibleScale, centerX, centerY, canvasWidth, timeDiv, triggerLevel, triggerChannel, amplDivA, positionA, amplDivB, positionB, xPosition, visibleWidth, sampleRate, decay);

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
            const { points, speeds } = simulatePhysics(targets, simulationMode, forceMultiplier, damping, mass, scale, centerX, centerY);

            // ========================================================================
            // RENDERING - Draw the simulated beam path
            // ========================================================================

            renderTrace(ctx, points, speeds, velocityDimming, basePower, deltaTime, renderingMode, sampleRate, debugMode, timeSegment, dotOpacity, dotSizeVariation, sampleDotOpacity);
        }

        // Send ready message back to main thread
        self.postMessage({ type: 'ready' });
    }
};

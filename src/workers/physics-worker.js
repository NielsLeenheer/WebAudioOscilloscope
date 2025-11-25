// Physics simulation and rendering worker with OffscreenCanvas
import { RendererManager, RendererType } from './renderers/renderer-manager.js';

let beamX = 0;
let beamY = 0;
let velocityX = 0;
let velocityY = 0;
let smoothedBeamX = 0;
let smoothedBeamY = 0;
let smoothedBasePower = 0; // Smoothed beam intensity for stable persistence calculation
let fps = 0; // Smoothed FPS counter for debug mode
let offscreenCanvas = null;
let rendererManager = null;
let devicePixelRatio = 1;
let logicalWidth = 600;
let logicalHeight = 600;
let currentRendererType = RendererType.CANVAS_2D;

// ============================================================================
// VIRTUAL COORDINATE SYSTEM
// Resolution-independent coordinate conversion utilities
// Virtual space: [-1, 1] normalized coordinates where 1.0 = full canvas radius
// ============================================================================
const VirtualUnits = {
    // Convert virtual distance to pixels
    toPixels: (virtualDist, canvasSize) => virtualDist * (canvasSize / 2),

    // Convert pixel distance to virtual units
    fromPixels: (pixelDist, canvasSize) => pixelDist / (canvasSize / 2),

    // Convert virtual point to pixel coordinates
    pointToPixels: (virtualPoint, canvasWidth, canvasHeight) => {
        const scaleX = canvasWidth / 2;
        const scaleY = canvasHeight / 2;
        return {
            x: canvasWidth / 2 + virtualPoint.x * scaleX,
            y: canvasHeight / 2 + virtualPoint.y * scaleY
        };
    },

    // Convert pixel point to virtual coordinates
    pointFromPixels: (pixelPoint, canvasWidth, canvasHeight) => {
        const scaleX = canvasWidth / 2;
        const scaleY = canvasHeight / 2;
        return {
            x: (pixelPoint.x - canvasWidth / 2) / scaleX,
            y: (pixelPoint.y - canvasHeight / 2) / scaleY
        };
    },

    // Get the scale factor for converting virtual units to pixels
    getScale: (canvasWidth, canvasHeight) => {
        return Math.min(canvasWidth, canvasHeight) / 2;
    }
};

// Calculate phosphor excitation based on beam power and velocity (dwell time)
// Models realistic CRT phosphor behavior using P31 phosphor characteristics:
// - Higher beam power (current) = more phosphor excitation
// - Lower velocity = longer dwell time = more energy deposited = brighter
// - Realistic phosphor saturation based on actual CRT physics
// NOW RESOLUTION-INDEPENDENT: Uses virtual units instead of pixels
function calculatePhosphorExcitation(speed, velocityDimming, basePower, deltaTime) {
    // Beam power represents the electron beam current/intensity
    const beamCurrent = basePower;

    // Calculate velocity in virtual units/second (frame-rate independent and resolution-independent)
    // speed is in virtual units/frame, deltaTime is in seconds
    const velocity = deltaTime > 0 ? speed / deltaTime : 0;

    // Dwell time model (recalibrated for realistic scope behavior):
    // The reference velocity is the speed at which dimming becomes noticeable
    // Real scopes show very aggressive dimming - fast movements are almost invisible
    // VIRTUAL_REFERENCE_VELOCITY: in virtual units/second (resolution-independent)
    // 0.5 = half canvas radius per second, consistent across all canvas sizes
    const VIRTUAL_REFERENCE_VELOCITY = 0.5; // Virtual units/second where dimming starts
    const VIRTUAL_BEAM_SPOT_SIZE = 0.003; // Effective beam spot size in virtual units (0.3% of canvas)

    // Calculate energy deposition factor based on velocity
    // Low velocity → full excitation (factor = 1.0)
    // High velocity → reduced excitation (factor → 0)
    let energyFactor;

    if (velocity < VIRTUAL_BEAM_SPOT_SIZE) {
        // Very slow or stationary: maximum excitation
        energyFactor = 1.0;
    } else {
        // Energy deposition inversely proportional to velocity
        // This models the physical reality: faster beam = less time on each phosphor grain
        energyFactor = (VIRTUAL_REFERENCE_VELOCITY / velocity);

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
// Convert processed signals to target coordinates in VIRTUAL space [-1, 1]
// Audio signals are already normalized, so they map directly to virtual coordinates
// ============================================================================
function interpretSignals(processedLeft, processedRight, mode, scale, visibleScale, centerX, centerY, canvasWidth, timeDiv, triggerLevel, triggerChannel, amplDivA, positionA, amplDivB, positionB, xPosition, visibleWidth, sampleRate, decay) {
    const targets = [];

    // Use amplitude directly (already calculated from base * fine in UI)
    const expAmplDivA = amplDivA;
    const expAmplDivB = amplDivB;

    // Virtual space constants
    // visibleScale in original code = 60 pixels (pixelsPerDivision * VOLTAGE_CALIBRATION)
    // Canvas radius = 300 pixels (for 600x600 canvas)
    // visibleScale in virtual units = 60/300 = 0.2
    // visibleWidth in original code = 400 pixels
    // visibleWidth in virtual units = 400/300 = 1.333
    const VIRTUAL_AMPL_SCALE = 0.2;  // For amplitude scaling (visibleScale in virtual units)
    const VIRTUAL_VISIBLE_WIDTH = 1.333;  // For time-domain waveforms (visibleWidth in virtual units)

    if (mode === 'xy') {
        // X/Y mode: left channel = X (with A controls), right channel = Y (with B controls)
        // X position offset in virtual space (uses VIRTUAL_VISIBLE_WIDTH for consistency with time domain)
        const xOffset = xPosition * VIRTUAL_VISIBLE_WIDTH;

        // Use only the most recent samples to avoid overdraw from large buffer
        // Decay parameter controls how many points to render
        const startIdx = Math.max(0, processedLeft.length - decay);

        for (let i = startIdx; i < processedLeft.length; i++) {
            // Left channel (A) controls horizontal with AMPL/DIV A and POSITION A
            // Signals are already in [-1, 1], scale by VIRTUAL_AMPL_SCALE and apply amplitude division
            const posOffsetA = positionA * VIRTUAL_AMPL_SCALE * 2;
            const targetX = processedLeft[i] * VIRTUAL_AMPL_SCALE / expAmplDivA + posOffsetA + xOffset;

            // Right channel (B) controls vertical with AMPL/DIV B and POSITION B (but inverted for Y axis)
            const posOffsetB = positionB * VIRTUAL_AMPL_SCALE * 2;
            const targetY = -processedRight[i] * VIRTUAL_AMPL_SCALE / expAmplDivB + posOffsetB;

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

        // X position offset in virtual space
        const xOffset = xPosition * VIRTUAL_VISIBLE_WIDTH;

        // Create target coordinates for the triggered portion in virtual space
        for (let i = startIndex; i < endIndex; i++) {
            const relativeIndex = i - startIndex;
            // X position is based on time with position offset
            // Spread waveform across VIRTUAL_VISIBLE_WIDTH
            // X POS offset shifts it left/right for alignment
            const targetX = (relativeIndex / samplesToDisplay) * VIRTUAL_VISIBLE_WIDTH - VIRTUAL_VISIBLE_WIDTH / 2 + xOffset;
            // Y position is based on amplitude with AMPL/DIV and Y position offset
            // Use VIRTUAL_AMPL_SCALE for amplitude calculations
            const yOffset = position * VIRTUAL_AMPL_SCALE * 2; // Scale the position offset
            const targetY = -channelData[i] * VIRTUAL_AMPL_SCALE / amplDiv + yOffset;
            targets.push({ x: targetX, y: targetY });
        }
    }

    return targets;
}

// ============================================================================
// STAGE C: PHYSICS SIMULATION - Electromagnetic Deflection Model
// Simulates realistic CRT electron beam deflection by electromagnetic coils in VIRTUAL space
// Physics operates in resolution-independent virtual coordinates
// ============================================================================
function simulatePhysics(targets, forceMultiplier, damping, mass, scale, centerX, centerY, canvasWidth, canvasHeight) {
    const points = [];
    const speeds = [];

    for (let i = 0; i < targets.length; i++) {
        const target = targets[i];

        // In a real CRT:
        // 1. Deflection coils create magnetic fields proportional to the signal (coil current)
        // 2. The magnetic field deflects the electron beam
        // 3. The beam has inertia and will overshoot the target position
        // 4. The deflection force is proportional to the difference between target and current position

        // Calculate the deflection force (magnetic field pulling beam toward target) in virtual space
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

        // Update beam position in virtual space
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
            // Clamp beam position to reasonable bounds in virtual space
            const maxPosition = 10.0; // Virtual units (10x the visible radius)
            beamX = Math.max(-maxPosition, Math.min(maxPosition, beamX));
            beamY = Math.max(-maxPosition, Math.min(maxPosition, beamY));

            // Clamp velocities in virtual space
            const maxVelocity = 3.0; // Virtual units per frame
            velocityX = Math.max(-maxVelocity, Math.min(maxVelocity, velocityX));
            velocityY = Math.max(-maxVelocity, Math.min(maxVelocity, velocityY));
        }

        // Less smoothing for electromagnetic model to show more realistic overshoot
        const EM_SMOOTHING = 0.6; // Higher = less smoothing, more responsive
        smoothedBeamX = EM_SMOOTHING * beamX + (1 - EM_SMOOTHING) * smoothedBeamX;
        smoothedBeamY = EM_SMOOTHING * beamY + (1 - EM_SMOOTHING) * smoothedBeamY;

        // Convert from virtual space to pixel coordinates for rendering
        const pixelPoint = VirtualUnits.pointToPixels(
            { x: smoothedBeamX, y: smoothedBeamY },
            canvasWidth,
            canvasHeight
        );

        points.push(pixelPoint);

        // Calculate speed in virtual units for this point
        if (points.length > 1) {
            const dx = velocityX;
            const dy = velocityY;
            const virtualSpeed = Math.sqrt(dx * dx + dy * dy);
            speeds.push(virtualSpeed);
        }
    }

    return { points, speeds };
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
        return { points, speeds, isInterpolated: new Array(points.length).fill(false) };
    }

    // Calculate how many interpolated points we need between each pair
    const pointsPerSegment = Math.ceil(actualTimePerPoint / targetTimePerPoint);

    const interpolatedPoints = [];
    const interpolatedSpeeds = [];
    const isInterpolated = []; // Track which points are interpolated vs original

    for (let i = 0; i < points.length; i++) {
        // Get surrounding points for Catmull-Rom spline
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[Math.min(points.length - 1, i + 1)];
        const p3 = points[Math.min(points.length - 1, i + 2)];

        // Add the actual sample point
        interpolatedPoints.push(p1);
        interpolatedSpeeds.push(speeds[i] || 0);
        isInterpolated.push(false); // This is an original sample point

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
                isInterpolated.push(true); // This is an interpolated point
            }
        }
    }

    return {
        points: interpolatedPoints,
        speeds: interpolatedSpeeds,
        isInterpolated: isInterpolated
    };
}

// ============================================================================
// RENDERING - Time-based segmentation
// NOW RESOLUTION-INDEPENDENT: All rendering primitives scale with canvas size
// ============================================================================
function renderTrace(ctx, points, speeds, velocityDimming, basePower, deltaTime, sampleRate, debugMode, timeSegment, dotOpacity, dotSizeVariation, sampleDotOpacity, canvasWidth, canvasHeight) {
    // Time-based segmentation approach:
    // - Segment traces based on fixed time intervals
    // - Fast beam movement = points spread out over time segment
    // - Slow beam movement = points closer together over time segment

    if (points.length < 2) return;

    // Calculate scale factor for resolution-independent rendering
    const canvasScale = Math.min(canvasWidth, canvasHeight);
    const LINE_WIDTH_RATIO = 0.00375;      // 0.375% of canvas (1.5px on 400px)
    const GREEN_DOT_RATIO = 0.001875;      // 0.1875% of canvas (0.75px radius = 1.5px diameter on 400px, matches line width)
    const DEBUG_DOT_RATIO = 0.0025;        // 0.25% of canvas (1px on 400px) - same for red and blue debug dots

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
    // Calculate angle of direction change to determine brightness
    const directionChanges = new Map(); // Map of index -> brightness
    for (let i = 1; i < originalPoints.length - 1; i++) {
        // Calculate angle of direction change between velocity vectors
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

    // Apply Catmull-Rom interpolation if TIME_SEGMENT is smaller than timePerPoint
    // This creates smooth curves and allows finer temporal resolution
    const interpolated = interpolatePoints(points, speeds, TIME_SEGMENT, timePerPoint);
    points = interpolated.points;
    speeds = interpolated.speeds;
    const isInterpolated = interpolated.isInterpolated;

    // Recalculate timePerPoint for interpolated points
    const interpolatedTimePerPoint = TIME_SEGMENT;

    // Configure canvas for drawing with scaled line width
    ctx.lineWidth = LINE_WIDTH_RATIO * canvasScale;
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

    // Third pass: highlight direction changes with green dots (beam dwell time)
    // Brightness is proportional to angle of direction change (180° = brightest)
    // Use originalPoints since directionChanges is indexed by original points
    const greenDotSize = GREEN_DOT_RATIO * canvasScale;
    for (const [idx, brightness] of directionChanges) {
        const point = originalPoints[idx];
        const opacity = basePower * brightness;

        ctx.fillStyle = `rgba(76, 175, 80, ${opacity})`; // Green color
        ctx.beginPath();
        ctx.arc(point.x, point.y, greenDotSize, 0, Math.PI * 2);
        ctx.fill();
    }

    // Debug visualization: show interpolated points as red dots
    // Red dots only appear on interpolated points, not original sample points
    if (debugMode && dotOpacity > 0) {
        const debugDotSize = DEBUG_DOT_RATIO * canvasScale;
        ctx.fillStyle = `rgba(255, 0, 0, ${dotOpacity})`;
        for (let i = 0; i < points.length; i++) {
            // Only show red dots for interpolated points (not original sample points)
            if (isInterpolated[i]) {
                const point = points[i];
                ctx.beginPath();
                ctx.arc(point.x, point.y, debugDotSize, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    // Fourth pass: show blue dots at every ORIGINAL sample point to visualize temporal resolution
    // Use originalPoints to show actual sample rate, not interpolated points
    // Dot size scales with angle of direction change based on dotSizeVariation
    if (debugMode && sampleDotOpacity > 0) {
        const blueDotBaseSize = DEBUG_DOT_RATIO * canvasScale;
        for (let i = 0; i < originalPoints.length; i++) {
            const point = originalPoints[i];

            // Get brightness (angle-based) from directionChanges map
            // directionChanges is indexed by original points before interpolation
            const brightness = directionChanges.get(i) || 0;

            // Calculate dot size based on angle and dotSizeVariation
            // dotSizeVariation: 1 = all same size, 10 = 180° dots are 10x larger
            // Scales proportionally with canvas size
            const sizeMultiplier = 1 + (brightness * (dotSizeVariation - 1));
            const dotSize = blueDotBaseSize * sizeMultiplier;

            ctx.fillStyle = `rgba(59, 130, 246, ${sampleDotOpacity})`; // Blue color
            ctx.beginPath();
            ctx.arc(point.x, point.y, dotSize, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

self.onmessage = async function(e) {
    const { type, data } = e.data;

    if (type === 'init') {
        // Receive the OffscreenCanvas and high-DPI settings
        offscreenCanvas = data.canvas;
        devicePixelRatio = data.devicePixelRatio || 1;
        logicalWidth = data.logicalWidth || 600;
        logicalHeight = data.logicalHeight || 600;
        currentRendererType = data.rendererType || RendererType.CANVAS_2D;

        // Initialize smoothed basePower to typical middle value to avoid slow ramp-up
        smoothedBasePower = 1.2; // Corresponds to beamPower ≈ 0.7

        // Initialize renderer manager
        rendererManager = new RendererManager();
        await rendererManager.init(
            offscreenCanvas,
            devicePixelRatio,
            logicalWidth,
            logicalHeight,
            currentRendererType
        );

        // Send back info about available renderers
        self.postMessage({
            type: 'initialized',
            data: {
                rendererType: rendererManager.getCurrentType(),
                availableRenderers: rendererManager.getAvailableRenderers()
            }
        });

        return;
    }

    if (type === 'switchRenderer') {
        // Switch to a different renderer
        const newType = data.rendererType;
        if (rendererManager && newType !== currentRendererType) {
            const result = await rendererManager.switchRenderer(newType);
            if (result.success) {
                currentRendererType = rendererManager.getCurrentType();
            }
            self.postMessage({
                type: 'rendererSwitched',
                data: {
                    rendererType: currentRendererType,
                    success: result.success,
                    requiresReload: result.requiresReload
                }
            });
        }
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
        if (!rendererManager || !rendererManager.isReady()) return;
        rendererManager.clear();

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

        if (!rendererManager || !rendererManager.isReady()) return;

        // Calculate and smooth FPS for debug mode display
        const currentFps = deltaTime > 0 ? 1 / deltaTime : 0;
        fps = fps === 0 ? currentFps : fps * 0.9 + currentFps * 0.1;

        // Smooth the basePower value to prevent flickering during slider adjustments
        // Use exponential smoothing: slow response prevents unstable persistence during rapid changes
        const PERSISTENCE_SMOOTHING = 0.95; // Higher = slower response, more stable
        smoothedBasePower = PERSISTENCE_SMOOTHING * smoothedBasePower + (1 - PERSISTENCE_SMOOTHING) * basePower;

        // Clear canvas with adjustable fade effect for persistence
        // Physically realistic persistence model:
        // Higher beam intensity excites phosphor more, resulting in longer visible trails
        // basePower range: 0.2 (min) to 3.0 (max) → intensity boost: 0 to 0.3
        const intensityBoost = ((smoothedBasePower - 0.2) / 2.8) * 0.3;
        const effectivePersistence = Math.min(0.99, persistence + intensityBoost);

        rendererManager.clearWithPersistence(effectivePersistence, canvasWidth, canvasHeight);

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
            const { points, speeds } = simulatePhysics(targets, forceMultiplier, damping, mass, scale, centerX, centerY, canvasWidth, canvasHeight);

            // ========================================================================
            // RENDERING - Draw the simulated beam path
            // ========================================================================

            rendererManager.renderTrace({
                points,
                speeds,
                velocityDimming,
                basePower,
                deltaTime,
                sampleRate,
                debugMode,
                timeSegment,
                dotOpacity,
                dotSizeVariation,
                sampleDotOpacity,
                canvasWidth,
                canvasHeight,
                calculatePhosphorExcitation,
                interpolatePoints
            });
        }

        // Draw FPS counter in debug mode
        if (debugMode) {
            rendererManager.drawFPS(fps);
        }

        // Send ready message back to main thread
        self.postMessage({ type: 'ready' });
    }
};

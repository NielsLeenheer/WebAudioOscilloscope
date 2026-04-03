/**
 * ECG waveform generator — three modes:
 *
 * 1. Simulated (BPM):      Fake PQRST at a fixed BPM
 * 2. RR-enhanced:           Fake PQRST timed by real RR-intervals (Polar H7 etc.)
 * 3. Raw ECG passthrough:   Real µV samples from Polar H10 (130 Hz)
 *
 * All modes output segments for the frame processor, rendered as a classic
 * sweeping ECG monitor trace.
 */

// ---------------------------------------------------------------
// Synthetic PQRST waveform
// ---------------------------------------------------------------

function gaussian(x, center, width, amplitude) {
    return amplitude * Math.exp(-((x - center) ** 2) / (2 * width ** 2));
}

/**
 * One synthetic PQRST cycle.
 * @param {number} t - Normalized time within one beat, 0..1
 */
function ecgBeat(t) {
    const p  = gaussian(t, 0.10, 0.020, 0.12);
    const q  = gaussian(t, 0.18, 0.006, -0.10);
    const r  = gaussian(t, 0.20, 0.007, 0.85);
    const s  = gaussian(t, 0.22, 0.006, -0.20);
    const st = gaussian(t, 0.25, 0.015, 0.02);
    const tw = gaussian(t, 0.32, 0.025, 0.18);
    return p + q + r + s + st + tw;
}

// ---------------------------------------------------------------
// Shared sweep-trace renderer
// ---------------------------------------------------------------

/**
 * Render a ring buffer of amplitude values as a sweeping ECG trace.
 * Returns segments in [-1,1] coordinate space.
 */
function renderSweepTrace(buffer, bufferLen, writePos, numPoints, gapFraction) {
    const segments = [];
    let currentSegment = [];

    // The gap is centered around the write position
    const gapPoints = Math.ceil(numPoints * gapFraction);

    for (let i = 0; i < numPoints; i++) {
        const fraction = i / (numPoints - 1);
        const x = -1 + 2 * fraction;

        // Map display position to buffer index
        const bufIdx = Math.floor(fraction * bufferLen);

        // Distance ahead of write position (in buffer space, wrapping)
        let distAhead = bufIdx - writePos;
        if (distAhead < 0) distAhead += bufferLen;
        const distFraction = distAhead / bufferLen;

        // Gap zone
        if (distFraction < gapFraction) {
            if (currentSegment.length > 1) segments.push(currentSegment);
            currentSegment = [];
            continue;
        }

        // Check if this position has been written to yet
        const readIdx = ((bufIdx % bufferLen) + bufferLen) % bufferLen;
        const y = buffer[readIdx];

        if (y === undefined || y === null) {
            if (currentSegment.length > 1) segments.push(currentSegment);
            currentSegment = [];
            continue;
        }

        currentSegment.push([x, y]);
    }

    if (currentSegment.length > 1) segments.push(currentSegment);
    return segments.length > 0 ? segments : [[[-1, 0], [1, 0]]];
}

// ---------------------------------------------------------------
// Mode 1: Simulated BPM
// ---------------------------------------------------------------

export function createECGGenerator({ bpm = 72, numPoints = 300, displaySeconds = 4 } = {}) {
    let currentBPM = bpm;
    let startTime = null;
    let lastTimestamp = null;
    // Accumulated beat phase (wraps 0..1 per beat), tracked continuously
    // so BPM changes don't cause phase jumps
    let beatPhase = 0;
    const gapFraction = 0.06;

    // History ring buffer: store the beat phase for each point in the display
    // so past points keep their original phase even when BPM changes
    const sampleRate = 250; // samples per second of display time
    const histLen = sampleRate * displaySeconds;
    const phaseHistory = new Float32Array(histLen);
    let histWritePos = 0;
    let histSamplesWritten = 0;

    function updateBPM(newBPM) {
        currentBPM = Math.max(30, Math.min(220, newBPM));
    }

    function getFrame(timestamp) {
        if (startTime === null) {
            startTime = timestamp;
            lastTimestamp = timestamp;
        }

        const elapsed = (timestamp - startTime) / 1000;
        const dt = (timestamp - lastTimestamp) / 1000;
        lastTimestamp = timestamp;

        // Advance beat phase based on current BPM
        const beatsPerSecond = currentBPM / 60;
        const samplesToWrite = Math.round(dt * sampleRate);

        for (let s = 0; s < samplesToWrite; s++) {
            beatPhase += beatsPerSecond / sampleRate;
            beatPhase -= Math.floor(beatPhase); // wrap to 0..1
            phaseHistory[histWritePos] = beatPhase;
            histWritePos = (histWritePos + 1) % histLen;
            histSamplesWritten++;
        }

        // Sweep cursor
        const cursorFraction = (elapsed % displaySeconds) / displaySeconds;

        const segments = [];
        let currentSegment = [];

        for (let i = 0; i < numPoints; i++) {
            const fraction = i / (numPoints - 1);
            const x = -1 + 2 * fraction;

            let distAhead = fraction - cursorFraction;
            if (distAhead < 0) distAhead += 1;

            if (distAhead < gapFraction) {
                if (currentSegment.length > 1) segments.push(currentSegment);
                currentSegment = [];
                continue;
            }

            // Map display position to history buffer
            const histIdx = Math.floor(fraction * histLen);
            const readIdx = ((histIdx) % histLen + histLen) % histLen;

            // Only draw if we have written enough samples
            if (histSamplesWritten < histLen) {
                // Check if this position has been reached yet
                const distFromWrite = (histWritePos - histIdx + histLen) % histLen;
                if (distFromWrite > histSamplesWritten) {
                    if (currentSegment.length > 1) segments.push(currentSegment);
                    currentSegment = [];
                    continue;
                }
            }

            const phase = phaseHistory[readIdx];
            const y = ecgBeat(phase) * 0.7 - 0.05;

            currentSegment.push([x, y]);
        }

        if (currentSegment.length > 1) segments.push(currentSegment);
        return segments.length > 0 ? segments : [[[-1, 0], [1, 0]]];
    }

    function reset() {
        startTime = null;
        lastTimestamp = null;
        beatPhase = 0;
        phaseHistory.fill(0);
        histWritePos = 0;
        histSamplesWritten = 0;
    }

    return {
        getFrame,
        updateBPM,
        reset,
        get bpm() { return currentBPM; }
    };
}

// ---------------------------------------------------------------
// Mode 2: RR-interval enhanced
// Uses real beat-to-beat timing, synthetic PQRST shape.
// ---------------------------------------------------------------

export function createRRGenerator({ numPoints = 300, displaySeconds = 4 } = {}) {
    // Ring buffer: one sample per ~1ms of display time
    const sampleRate = 250;  // internal samples per second
    const bufferLen = sampleRate * displaySeconds;
    const buffer = new Float32Array(bufferLen);
    let writePos = 0;
    let samplesWritten = 0;

    // Beat timing state
    let lastBeatTime = 0;    // ms timestamp of last R-peak
    let currentRR = 800;     // current RR interval in ms (default ~75 BPM)
    let lastBPM = 75;

    // Accumulator for sub-frame writing
    let lastFrameTime = null;

    const gapFraction = 0.06;

    /**
     * Feed an RR-interval from the BLE device.
     * @param {number} rrMs - RR interval in milliseconds
     */
    function pushRR(rrMs) {
        currentRR = Math.max(250, Math.min(2000, rrMs));
        lastBPM = Math.round(60000 / currentRR);
    }

    /**
     * Generate the current frame.
     * Call this at display refresh rate (e.g. 30-60 fps).
     */
    function getFrame(timestamp) {
        if (lastFrameTime === null) {
            lastFrameTime = timestamp;
            lastBeatTime = timestamp;
        }

        const dt = timestamp - lastFrameTime;
        lastFrameTime = timestamp;

        // How many internal samples to generate for the elapsed time
        const samplesToWrite = Math.round((dt / 1000) * sampleRate);

        for (let s = 0; s < samplesToWrite; s++) {
            // Time within current beat cycle
            const sampleTime = lastFrameTime - (samplesToWrite - s) * (1000 / sampleRate);
            const timeSinceBeat = sampleTime - lastBeatTime;

            // If we've passed the current RR interval, start a new beat
            if (timeSinceBeat >= currentRR) {
                lastBeatTime += currentRR;
            }

            const phase = Math.max(0, (sampleTime - lastBeatTime) / currentRR);
            const amplitude = ecgBeat(Math.min(phase, 1.0));
            buffer[writePos] = amplitude * 0.7 - 0.05;
            writePos = (writePos + 1) % bufferLen;
            samplesWritten++;
        }

        return renderSweepTrace(buffer, bufferLen, writePos, numPoints, gapFraction);
    }

    function reset() {
        buffer.fill(0);
        writePos = 0;
        samplesWritten = 0;
        lastFrameTime = null;
        lastBeatTime = 0;
    }

    return {
        getFrame,
        pushRR,
        reset,
        get bpm() { return lastBPM; }
    };
}

// ---------------------------------------------------------------
// Mode 3: Raw ECG passthrough (Polar H10)
// Receives real µV samples at 130 Hz, renders as sweep trace.
// ---------------------------------------------------------------

export function createRawECGRenderer({ numPoints = 300, displaySeconds = 4 } = {}) {
    const sampleRate = 130; // Polar H10 ECG rate
    const bufferLen = sampleRate * displaySeconds;
    const buffer = new Float32Array(bufferLen);
    let writePos = 0;
    let samplesWritten = 0;

    // Auto-scaling: track min/max over a sliding window
    let signalMin = -400;
    let signalMax = 400;
    const SCALE_SMOOTH = 0.995; // slow decay toward extremes

    const gapFraction = 0.12;

    // Incoming sample queue — dripped into the ring buffer at 130 Hz
    const queue = [];
    let lastDripTime = null;
    let dripAccum = 0; // fractional samples owed

    /**
     * Feed raw ECG samples from the Polar H10.
     * Queued and released gradually in getFrame().
     * @param {number[]} samples - Array of µV values
     */
    function pushSamples(samples) {
        for (const uv of samples) {
            queue.push(uv);
        }
    }

    function dripSample(uv) {
        // Update auto-scale (smooth tracking)
        signalMin = Math.min(signalMin, uv) * SCALE_SMOOTH + uv * (1 - SCALE_SMOOTH);
        signalMax = Math.max(signalMax, uv) * SCALE_SMOOTH + uv * (1 - SCALE_SMOOTH);

        // Normalize to [-0.8, 0.8] range
        const range = Math.max(signalMax - signalMin, 100);
        const normalized = ((uv - signalMin) / range) * 1.6 - 0.8;

        buffer[writePos] = normalized;
        writePos = (writePos + 1) % bufferLen;
        samplesWritten++;
    }

    /**
     * Generate the current frame from the buffer.
     * Drips queued samples into the ring buffer at the real 130 Hz rate.
     */
    function getFrame() {
        const now = performance.now();

        if (lastDripTime === null) {
            lastDripTime = now;
        }

        // How many samples should have been written since last frame
        const dt = (now - lastDripTime) / 1000;
        lastDripTime = now;
        dripAccum += dt * sampleRate;
        // Cap accumulator so it can't build up while the queue is empty
        // and then dump an entire batch at once when new samples arrive
        dripAccum = Math.min(dripAccum, 4); // at most ~30ms worth of catch-up
        const toDrip = Math.min(Math.floor(dripAccum), queue.length);
        dripAccum -= toDrip;

        for (let i = 0; i < toDrip; i++) {
            dripSample(queue.shift());
        }

        if (samplesWritten < 10) {
            return [[[-1, 0], [1, 0]]];
        }

        return renderSweepTrace(buffer, bufferLen, writePos, numPoints, gapFraction);
    }

    function reset() {
        buffer.fill(0);
        writePos = 0;
        samplesWritten = 0;
        signalMin = -400;
        signalMax = 400;
        queue.length = 0;
        lastDripTime = null;
        dripAccum = 0;
    }

    return {
        getFrame,
        pushSamples,
        reset,
    };
}

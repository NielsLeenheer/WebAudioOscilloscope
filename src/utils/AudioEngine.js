import { writable, get } from 'svelte/store';

export class AudioEngine {
    constructor() {
        this.audioContext = null;
        this.leftOscillator = null;
        this.rightOscillator = null;
        this.leftGain = null;
        this.rightGain = null;
        this.masterGain = null;
        this.merger = null;
        this.leftAnalyser = null;
        this.rightAnalyser = null;
        this.defaultFrequency = 100; // Settings tab default frequency
        this.baseFrequency = 100; // Current playback frequency
        this.currentRotation = 0;
        this.isPlaying = writable(false);
        this.clockInterval = null;

        // Rendering mode: 'frequency' (fixed frame rate) or 'points' (1:1 point mapping)
        this.renderMode = 'frequency';
        this.pointSpacing = 0.02; // For points mode: distance between points in coordinate space (higher = fewer points)

        // Layered buffering for points mode
        this.pointsRingBuffer = [];     // Accumulated points from incoming frames
        this.lastFramePoints = [];      // Copy of last frame for repeat on underrun
        this.maxBufferPoints = 20000;   // Max points to buffer before dropping oldest
        this.pointsOutputTimer = null;  // Timer for continuous output
        this.pointsOutputInterval = 20; // ms between output chunks (50 Hz output rate)
        this.pointsScheduledTime = 0;   // When next chunk should start playing
        this.pointsActiveSources = [];  // Active buffer sources for cleanup

        // Store last waveform for refresh on settings change
        this.lastWaveformPoints = null;
        this.isContinuousGenerator = false;  // True for generators that continuously push frames (e.g., DOOM)
    }

    initialize() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

            // Create gain nodes
            this.leftGain = this.audioContext.createGain();
            this.rightGain = this.audioContext.createGain();
            this.leftGain.gain.value = 0.3; // Initial volume at 30% (matches Settings default)
            this.rightGain.gain.value = 0.3;
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = 1.0; // Unity gain (volume controlled by left/right gains)

            // Create analyser nodes for preview
            this.leftAnalyser = this.audioContext.createAnalyser();
            this.rightAnalyser = this.audioContext.createAnalyser();
            // Use larger buffer to support longer TIME/DIV settings
            // 16384 samples at 48kHz = 341ms, supporting up to ~34ms/div
            this.leftAnalyser.fftSize = 16384;
            this.rightAnalyser.fftSize = 16384;

            // Create channel merger for stereo output
            this.merger = this.audioContext.createChannelMerger(2);

            // Connect: left/right gains → analysers → merger → master gain → destination
            this.leftGain.connect(this.leftAnalyser);
            this.rightGain.connect(this.rightAnalyser);
            this.leftAnalyser.connect(this.merger, 0, 0);   // Left channel
            this.rightAnalyser.connect(this.merger, 0, 1);  // Right channel
            this.merger.connect(this.masterGain);
            this.masterGain.connect(this.audioContext.destination);
        }
    }

    getAnalysers() {
        return {
            left: this.leftAnalyser,
            right: this.rightAnalyser
        };
    }

    start() {
        this.initialize();
        this.isPlaying.set(true);
    }

    stop() {
        if (this.leftOscillator) {
            this.leftOscillator.stop();
            this.leftOscillator = null;
        }
        if (this.rightOscillator) {
            this.rightOscillator.stop();
            this.rightOscillator = null;
        }

        // Stop points mode output
        this.stopPointsOutput();

        // Clear clock interval if active
        if (this.clockInterval) {
            clearInterval(this.clockInterval);
            this.clockInterval = null;
        }

        this.isPlaying.set(false);
    }

    setVolume(value) {
        // Apply volume to channel gains (before analysers) so it affects both scope and speakers
        const gainValue = value / 100;
        if (this.leftGain) {
            this.leftGain.gain.value = gainValue;
        }
        if (this.rightGain) {
            this.rightGain.gain.value = gainValue;
        }
        // masterGain stays at 0.3 as a fixed safety attenuation
    }

    setDefaultFrequency(value) {
        // Called by Settings tab - updates both default and current
        this.defaultFrequency = parseFloat(value);
        this.baseFrequency = parseFloat(value);
        this.refreshWaveform();
    }

    setFrequency(value) {
        // Called by Waves tab - only updates current playback frequency
        this.baseFrequency = parseFloat(value);
        this.refreshWaveform();
    }

    restoreDefaultFrequency() {
        // Called by other tabs to restore Settings frequency
        this.baseFrequency = this.defaultFrequency;
        this.refreshWaveform();
    }

    setRotation(value) {
        this.currentRotation = parseFloat(value);
        // Note: rotation doesn't need refresh as it's applied in real-time for points mode
        // and at buffer creation for frequency mode
    }

    setRenderMode(mode) {
        this.renderMode = mode; // 'frequency' or 'points'
        this.refreshWaveform();
    }

    setPointSpacing(value) {
        this.pointSpacing = parseFloat(value);
        this.refreshWaveform();
    }

    // Mark generator as continuous (won't store points for refresh)
    setContinuousGenerator(isContinuous) {
        this.isContinuousGenerator = isContinuous;
        if (isContinuous) {
            this.lastWaveformPoints = null;
        }
    }

    // Refresh the waveform with current settings (for single-frame generators)
    refreshWaveform() {
        if (this.lastWaveformPoints && get(this.isPlaying) && !this.isContinuousGenerator) {
            this.createWaveform(this.lastWaveformPoints);
        }
    }

    // === Layered buffering for points mode ===

    // Add a frame's worth of points to the ring buffer
    addPointsToBuffer(points) {
        // Flatten if segments (array of arrays)
        let flatPoints;
        if (points.length > 0 && Array.isArray(points[0]) && Array.isArray(points[0][0])) {
            flatPoints = points.flat();
        } else {
            flatPoints = points;
        }

        if (flatPoints.length === 0) return;

        // Store as last frame for repeat on underrun
        this.lastFramePoints = flatPoints.slice();

        // Append to ring buffer
        this.pointsRingBuffer.push(...flatPoints);

        // Trim if buffer exceeds max (drop oldest points)
        if (this.pointsRingBuffer.length > this.maxBufferPoints) {
            const excess = this.pointsRingBuffer.length - this.maxBufferPoints;
            this.pointsRingBuffer.splice(0, excess);
        }
    }

    // Start the continuous output timer for points mode
    startPointsOutput() {
        if (this.pointsOutputTimer) return; // Already running

        // Initialize scheduling time
        this.pointsScheduledTime = this.audioContext.currentTime;

        // Start output loop
        this.pointsOutputTimer = setInterval(() => {
            this.outputPointsChunk();
        }, this.pointsOutputInterval);

        // Output first chunk immediately
        this.outputPointsChunk();
    }

    // Stop the continuous output timer
    stopPointsOutput() {
        if (this.pointsOutputTimer) {
            clearInterval(this.pointsOutputTimer);
            this.pointsOutputTimer = null;
        }

        // Clean up active sources
        for (const sources of this.pointsActiveSources) {
            try {
                sources.left.stop();
                sources.right.stop();
            } catch (e) {
                // Source may have already stopped
            }
        }
        this.pointsActiveSources = [];
        this.pointsRingBuffer = [];
        this.pointsScheduledTime = 0;
    }

    // Output a fixed-size chunk from the buffer
    outputPointsChunk() {
        if (!this.audioContext || !get(this.isPlaying)) return;

        const sampleRate = this.audioContext.sampleRate;
        const now = this.audioContext.currentTime;

        // Calculate chunk size: points needed for one interval (1:1 mapping)
        // At 48kHz with 20ms interval = 960 points
        const chunkDuration = this.pointsOutputInterval / 1000;
        const pointsNeeded = Math.ceil(sampleRate * chunkDuration);

        // Get points from ring buffer or repeat last frame
        let pointsToUse;
        if (this.pointsRingBuffer.length >= pointsNeeded) {
            // Extract from buffer
            pointsToUse = this.pointsRingBuffer.splice(0, pointsNeeded);
        } else if (this.pointsRingBuffer.length > 0) {
            // Partial buffer - use what we have plus pad from last frame (cycling if needed)
            pointsToUse = this.pointsRingBuffer.splice(0, this.pointsRingBuffer.length);
            if (this.lastFramePoints.length > 0) {
                while (pointsToUse.length < pointsNeeded) {
                    const remaining = pointsNeeded - pointsToUse.length;
                    const chunk = this.lastFramePoints.slice(0, Math.min(remaining, this.lastFramePoints.length));
                    pointsToUse.push(...chunk);
                }
            }
        } else if (this.lastFramePoints.length > 0) {
            // Buffer empty - repeat last frame (cycling through it)
            pointsToUse = [];
            while (pointsToUse.length < pointsNeeded) {
                const remaining = pointsNeeded - pointsToUse.length;
                const chunk = this.lastFramePoints.slice(0, Math.min(remaining, this.lastFramePoints.length));
                pointsToUse.push(...chunk);
            }
        } else {
            // No data at all - skip this chunk (don't output silence/center point)
            return;
        }

        // Apply rotation
        const rad = this.currentRotation * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        const rotatedPoints = pointsToUse.map(([x, y]) => [
            x * cos - y * sin,
            x * sin + y * cos
        ]);

        // Create audio buffer (1:1 point to sample mapping)
        const bufferSize = rotatedPoints.length;
        const leftBuffer = this.audioContext.createBuffer(1, bufferSize, sampleRate);
        const rightBuffer = this.audioContext.createBuffer(1, bufferSize, sampleRate);

        const leftData = leftBuffer.getChannelData(0);
        const rightData = rightBuffer.getChannelData(0);

        // Fill buffer - direct 1:1 mapping (no interpolation between points)
        for (let i = 0; i < rotatedPoints.length; i++) {
            leftData[i] = rotatedPoints[i][0];
            rightData[i] = rotatedPoints[i][1];
        }

        // Schedule the buffer
        const leftSource = this.audioContext.createBufferSource();
        const rightSource = this.audioContext.createBufferSource();

        leftSource.buffer = leftBuffer;
        rightSource.buffer = rightBuffer;

        leftSource.connect(this.leftGain);
        rightSource.connect(this.rightGain);

        // If we've fallen behind, catch up
        if (this.pointsScheduledTime < now) {
            this.pointsScheduledTime = now;
        }

        leftSource.start(this.pointsScheduledTime);
        rightSource.start(this.pointsScheduledTime);

        this.pointsScheduledTime += chunkDuration;

        // Track for cleanup
        const sourceEntry = { left: leftSource, right: rightSource, endTime: this.pointsScheduledTime };
        this.pointsActiveSources.push(sourceEntry);

        // Clean up finished sources
        this.pointsActiveSources = this.pointsActiveSources.filter(s => s.endTime > now - 0.5);
    }

    // Resample a segment to have points at regular spacing intervals
    resampleSegment(segment, spacing) {
        if (segment.length < 2 || spacing <= 0) return segment;

        const resampled = [segment[0]]; // Always include first point
        let accumulatedDist = 0;
        let lastOutputPoint = segment[0];

        for (let i = 1; i < segment.length; i++) {
            const prevInputPoint = segment[i - 1];
            const point = segment[i];
            const dx = point[0] - prevInputPoint[0];
            const dy = point[1] - prevInputPoint[1];
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist === 0) continue;

            // Normalized direction vector for this segment
            const dirX = dx / dist;
            const dirY = dy / dist;

            accumulatedDist += dist;

            // Add points at regular spacing intervals
            while (accumulatedDist >= spacing) {
                // New point is exactly 'spacing' distance from last output point
                // in the direction of the current segment
                const newPoint = [
                    lastOutputPoint[0] + dirX * spacing,
                    lastOutputPoint[1] + dirY * spacing
                ];
                resampled.push(newPoint);
                accumulatedDist -= spacing;
                lastOutputPoint = newPoint;
            }
        }

        // Always include last point if it's not too close to the previous one
        const lastResampled = resampled[resampled.length - 1];
        const finalPoint = segment[segment.length - 1];
        const finalDx = finalPoint[0] - lastResampled[0];
        const finalDy = finalPoint[1] - lastResampled[1];
        const finalDist = Math.sqrt(finalDx * finalDx + finalDy * finalDy);
        if (finalDist > spacing * 0.1) {
            resampled.push(finalPoint);
        }

        return resampled;
    }

    createWaveform(pointsOrSegments, isClockUpdate = false) {
        if (!this.audioContext || !get(this.isPlaying)) return;

        // Store points for refresh (unless this is from a continuous generator)
        if (!this.isContinuousGenerator) {
            this.lastWaveformPoints = pointsOrSegments;
        }

        // Clear clock interval if switching to a different shape (but not if this is a clock update)
        if (this.clockInterval && !isClockUpdate) {
            clearInterval(this.clockInterval);
            this.clockInterval = null;
        }

        // Detect if input is segments (array of arrays) or flat points (array of [x,y])
        const isSegmented = pointsOrSegments.length > 0 &&
                           Array.isArray(pointsOrSegments[0]) &&
                           Array.isArray(pointsOrSegments[0][0]);

        const segments = isSegmented ? pointsOrSegments : [pointsOrSegments];

        // Points mode: use layered buffering (rotation is applied in outputPointsChunk)
        if (this.renderMode === 'points') {
            // Stop looping oscillators if switching from frequency mode
            if (this.leftOscillator) {
                this.leftOscillator.stop();
                this.leftOscillator = null;
            }
            if (this.rightOscillator) {
                this.rightOscillator.stop();
                this.rightOscillator = null;
            }

            // Resample segments to desired point spacing
            const resampledSegments = segments.map(segment =>
                this.resampleSegment(segment, this.pointSpacing)
            );

            // Add to ring buffer (flattens segments internally)
            this.addPointsToBuffer(resampledSegments);

            // Start continuous output if not already running
            this.startPointsOutput();
            return;
        }

        // For frequency mode: stop points output if it was running
        this.stopPointsOutput();

        // Store references to old oscillators - we'll stop them right before starting new ones
        // to minimize the gap (stopping here would create a gap during buffer processing)
        const oldLeftOscillator = this.leftOscillator;
        const oldRightOscillator = this.rightOscillator;
        this.leftOscillator = null;
        this.rightOscillator = null;

        // Apply rotation to all segments
        const rad = this.currentRotation * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        const rotatedSegments = segments.map(segment =>
            segment.map(([x, y]) => [
                x * cos - y * sin,
                x * sin + y * cos
            ])
        );

        // Create buffer for custom waveform
        const sampleRate = this.audioContext.sampleRate;

        // Determine buffer size based on frequency
        const totalPoints = rotatedSegments.reduce((sum, seg) => sum + seg.length, 0);
        const duration = 1 / this.baseFrequency;
        const bufferSize = Math.ceil(sampleRate * duration);

        const leftBuffer = this.audioContext.createBuffer(1, bufferSize, sampleRate);
        const rightBuffer = this.audioContext.createBuffer(1, bufferSize, sampleRate);

        const leftData = leftBuffer.getChannelData(0);
        const rightData = rightBuffer.getChannelData(0);

        // Allocate buffer space proportionally to point count
        // Use cumulative proportion to avoid rounding error accumulation
        let bufferOffset = 0;
        let cumulativePoints = 0;
        rotatedSegments.forEach((segment) => {
            cumulativePoints += segment.length;
            // Calculate where this segment should end based on cumulative proportion
            const targetEndOffset = Math.round(bufferSize * cumulativePoints / totalPoints);
            const segmentBufferSize = targetEndOffset - bufferOffset;

            if (segmentBufferSize <= 0) return;

            // Fill this segment's portion of the buffer with interpolation
            for (let i = 0; i < segmentBufferSize; i++) {
                const t = i / segmentBufferSize;
                const pointIndex = t * segment.length;
                const index1 = Math.floor(pointIndex);
                const index2 = Math.min(index1 + 1, segment.length - 1);
                const frac = pointIndex - Math.floor(pointIndex);

                // Linear interpolation within this segment
                const bufferIndex = bufferOffset + i;
                if (bufferIndex < bufferSize) {
                    leftData[bufferIndex] = segment[index1][0] * (1 - frac) + segment[index2][0] * frac;
                    rightData[bufferIndex] = segment[index1][1] * (1 - frac) + segment[index2][1] * frac;
                }
            }

            bufferOffset = targetEndOffset;
        });

        // Looping mode for frequency mode
        // Create buffer sources
        this.leftOscillator = this.audioContext.createBufferSource();
        this.rightOscillator = this.audioContext.createBufferSource();

        this.leftOscillator.buffer = leftBuffer;
        this.rightOscillator.buffer = rightBuffer;

        this.leftOscillator.loop = true;
        this.rightOscillator.loop = true;

        // Connect to gain nodes
        this.leftOscillator.connect(this.leftGain);
        this.rightOscillator.connect(this.rightGain);

        // Stop old oscillators right before starting new ones to minimize gap
        if (oldLeftOscillator) oldLeftOscillator.stop();
        if (oldRightOscillator) oldRightOscillator.stop();

        // Start playback
        this.leftOscillator.start();
        this.rightOscillator.start();
    }

    startClock(generateClockPoints) {
        // Restore Settings tab default frequency
        this.restoreDefaultFrequency();

        // Clear any existing clock interval
        if (this.clockInterval) {
            clearInterval(this.clockInterval);
        }

        // Draw initial clock
        this.createWaveform(generateClockPoints());

        // Set up interval to redraw every second
        this.clockInterval = setInterval(() => {
            if (get(this.isPlaying)) {
                this.createWaveform(generateClockPoints(), true); // true = this is a clock update
            }
        }, 1000);
    }

    clearClockInterval() {
        if (this.clockInterval) {
            clearInterval(this.clockInterval);
            this.clockInterval = null;
        }
    }
}

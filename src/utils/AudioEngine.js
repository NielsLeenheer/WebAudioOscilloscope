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
    }

    setFrequency(value) {
        // Called by Waves tab - only updates current playback frequency
        this.baseFrequency = parseFloat(value);
    }

    restoreDefaultFrequency() {
        // Called by other tabs to restore Settings frequency
        this.baseFrequency = this.defaultFrequency;
    }

    setRotation(value) {
        this.currentRotation = parseFloat(value);
    }

    createWaveform(pointsOrSegments, isClockUpdate = false) {
        if (!this.audioContext || !get(this.isPlaying)) return;

        // Clear clock interval if switching to a different shape (but not if this is a clock update)
        if (this.clockInterval && !isClockUpdate) {
            clearInterval(this.clockInterval);
            this.clockInterval = null;
        }

        // Stop existing oscillators
        if (this.leftOscillator) this.leftOscillator.stop();
        if (this.rightOscillator) this.rightOscillator.stop();

        // Detect if input is segments (array of arrays) or flat points (array of [x,y])
        const isSegmented = pointsOrSegments.length > 0 &&
                           Array.isArray(pointsOrSegments[0]) &&
                           Array.isArray(pointsOrSegments[0][0]);

        const segments = isSegmented ? pointsOrSegments : [pointsOrSegments];

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
        const duration = 1 / this.baseFrequency;
        const bufferSize = Math.ceil(sampleRate * duration);

        const leftBuffer = this.audioContext.createBuffer(1, bufferSize, sampleRate);
        const rightBuffer = this.audioContext.createBuffer(1, bufferSize, sampleRate);

        const leftData = leftBuffer.getChannelData(0);
        const rightData = rightBuffer.getChannelData(0);

        // Calculate total points across all segments
        const totalPoints = rotatedSegments.reduce((sum, seg) => sum + seg.length, 0);

        // Allocate buffer space proportionally to each segment
        let bufferOffset = 0;
        rotatedSegments.forEach((segment, segmentIndex) => {
            const segmentBufferSize = Math.floor(bufferSize * segment.length / totalPoints);

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

            bufferOffset += segmentBufferSize;
        });

        // Fill any remaining buffer space (due to rounding) by repeating the last segment
        if (bufferOffset < bufferSize && rotatedSegments.length > 0) {
            const lastSegment = rotatedSegments[rotatedSegments.length - 1];
            const lastPoint = lastSegment[lastSegment.length - 1];
            for (let i = bufferOffset; i < bufferSize; i++) {
                leftData[i] = lastPoint[0];
                rightData[i] = lastPoint[1];
            }
        }

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

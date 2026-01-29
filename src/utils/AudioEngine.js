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

        // AudioWorklet for points mode (runs on audio thread, stutter-free)
        this.pointsWorkletNode = null;
        this.pointsWorkletReady = false;
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

        // Stop points mode worklet
        this.stopPointsWorklet();

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

    setRotation(value) {
        this.currentRotation = parseFloat(value);
    }

    // === AudioWorklet for points mode ===

    // Load the worklet module (call once after initialize)
    async ensurePointsWorklet() {
        if (this.pointsWorkletReady) return;
        if (!this.audioContext) return;

        const workletUrl = new URL('../worklets/points-processor.js', import.meta.url);
        await this.audioContext.audioWorklet.addModule(workletUrl);
        this.pointsWorkletReady = true;
    }

    // Start the worklet node for points mode output
    async startPointsWorklet() {
        if (this.pointsWorkletNode) return; // Already running

        await this.ensurePointsWorklet();

        this.pointsWorkletNode = new AudioWorkletNode(this.audioContext, 'points-processor', {
            numberOfInputs: 0,
            numberOfOutputs: 2,
            outputChannelCount: [1, 1]
        });

        // Connect worklet outputs directly to gain nodes (no splitter needed)
        // Output 0 = X → left channel, Output 1 = Y → right channel
        this.pointsWorkletNode.connect(this.leftGain, 0);
        this.pointsWorkletNode.connect(this.rightGain, 1);
    }

    // Stop the worklet node
    stopPointsWorklet() {
        if (this.pointsWorkletNode) {
            this.pointsWorkletNode.port.postMessage({ type: 'clear' });
            this.pointsWorkletNode.disconnect();
            this.pointsWorkletNode = null;
        }
    }

    // === Waves tab waveform (bypasses FrameProcessor worker) ===

    /**
     * Create and play a looping waveform from flat [x,y] points.
     * Used only by Waves tab which generates its own stereo buffer data.
     */
    createWaveform(points) {
        if (!this.audioContext || !get(this.isPlaying)) return;

        // Stop points worklet if it was running
        this.stopPointsWorklet();

        const oldLeftOscillator = this.leftOscillator;
        const oldRightOscillator = this.rightOscillator;
        this.leftOscillator = null;
        this.rightOscillator = null;

        // Apply rotation
        const rad = this.currentRotation * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        const rotated = points.map(([x, y]) => [
            x * cos - y * sin,
            x * sin + y * cos
        ]);

        const sampleRate = this.audioContext.sampleRate;
        const duration = 1 / this.baseFrequency;
        const bufferSize = Math.ceil(sampleRate * duration);

        const leftBuffer = this.audioContext.createBuffer(1, bufferSize, sampleRate);
        const rightBuffer = this.audioContext.createBuffer(1, bufferSize, sampleRate);

        const leftData = leftBuffer.getChannelData(0);
        const rightData = rightBuffer.getChannelData(0);

        // Interpolate points into buffer
        for (let i = 0; i < bufferSize; i++) {
            const t = i / bufferSize;
            const pointIndex = t * rotated.length;
            const index1 = Math.floor(pointIndex);
            const index2 = Math.min(index1 + 1, rotated.length - 1);
            const frac = pointIndex - index1;

            leftData[i] = rotated[index1][0] * (1 - frac) + rotated[index2][0] * frac;
            rightData[i] = rotated[index1][1] * (1 - frac) + rotated[index2][1] * frac;
        }

        this.leftOscillator = this.audioContext.createBufferSource();
        this.rightOscillator = this.audioContext.createBufferSource();
        this.leftOscillator.buffer = leftBuffer;
        this.rightOscillator.buffer = rightBuffer;
        this.leftOscillator.loop = true;
        this.rightOscillator.loop = true;
        this.leftOscillator.connect(this.leftGain);
        this.rightOscillator.connect(this.rightGain);

        if (oldLeftOscillator) oldLeftOscillator.stop();
        if (oldRightOscillator) oldRightOscillator.stop();

        this.leftOscillator.start();
        this.rightOscillator.start();
    }

    // === Processed frame playback (from FrameProcessor worker) ===

    /**
     * Play a pre-processed frequency mode frame.
     * Receives left/right Float32Arrays already rotated and resampled.
     */
    playProcessedFrequencyFrame(leftData, rightData) {
        if (!this.audioContext || !get(this.isPlaying)) return;

        // Stop points worklet if switching from points mode
        this.stopPointsWorklet();

        const sampleRate = this.audioContext.sampleRate;
        const bufferSize = leftData.length;

        const leftBuffer = this.audioContext.createBuffer(1, bufferSize, sampleRate);
        const rightBuffer = this.audioContext.createBuffer(1, bufferSize, sampleRate);

        leftBuffer.getChannelData(0).set(leftData);
        rightBuffer.getChannelData(0).set(rightData);

        // Store references to old oscillators
        const oldLeftOscillator = this.leftOscillator;
        const oldRightOscillator = this.rightOscillator;

        this.leftOscillator = this.audioContext.createBufferSource();
        this.rightOscillator = this.audioContext.createBufferSource();

        this.leftOscillator.buffer = leftBuffer;
        this.rightOscillator.buffer = rightBuffer;
        this.leftOscillator.loop = true;
        this.rightOscillator.loop = true;

        this.leftOscillator.connect(this.leftGain);
        this.rightOscillator.connect(this.rightGain);

        // Stop old oscillators right before starting new ones
        if (oldLeftOscillator) oldLeftOscillator.stop();
        if (oldRightOscillator) oldRightOscillator.stop();

        this.leftOscillator.start();
        this.rightOscillator.start();
    }

    /**
     * Play a pre-processed points mode frame.
     * Receives interleaved Float32Array [x0,y0,x1,y1,...] already rotated and resampled.
     */
    async playProcessedPointsFrame(interleavedData) {
        if (!this.audioContext || !get(this.isPlaying)) return;

        // Stop looping oscillators if switching from frequency mode
        if (this.leftOscillator) {
            this.leftOscillator.stop();
            this.leftOscillator = null;
        }
        if (this.rightOscillator) {
            this.rightOscillator.stop();
            this.rightOscillator = null;
        }

        await this.startPointsWorklet();

        if (!this.pointsWorkletNode) return;

        // Send pre-processed data directly to worklet
        this.pointsWorkletNode.port.postMessage(
            { type: 'points', data: interleavedData },
            [interleavedData.buffer]
        );
    }

}

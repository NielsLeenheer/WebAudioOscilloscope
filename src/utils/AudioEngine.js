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
        this.baseFrequency = 100;
        this.currentRotation = 0;
        this.isPlaying = false;
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
        this.isPlaying = true;
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

        this.isPlaying = false;
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

    setFrequency(value) {
        this.baseFrequency = parseFloat(value);
    }

    setRotation(value) {
        this.currentRotation = parseFloat(value);
    }

    createWaveform(points, isClockUpdate = false) {
        if (!this.audioContext || !this.isPlaying) return;

        // Clear clock interval if switching to a different shape (but not if this is a clock update)
        if (this.clockInterval && !isClockUpdate) {
            clearInterval(this.clockInterval);
            this.clockInterval = null;
        }

        // Stop existing oscillators
        if (this.leftOscillator) this.leftOscillator.stop();
        if (this.rightOscillator) this.rightOscillator.stop();

        // Apply rotation
        const rad = this.currentRotation * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        const rotatedPoints = points.map(([x, y]) => {
            return [
                x * cos - y * sin,
                x * sin + y * cos
            ];
        });

        // Create buffer for custom waveform
        const sampleRate = this.audioContext.sampleRate;
        const duration = 1 / this.baseFrequency;
        const bufferSize = Math.ceil(sampleRate * duration);

        const leftBuffer = this.audioContext.createBuffer(1, bufferSize, sampleRate);
        const rightBuffer = this.audioContext.createBuffer(1, bufferSize, sampleRate);

        const leftData = leftBuffer.getChannelData(0);
        const rightData = rightBuffer.getChannelData(0);

        // Fill buffers with interpolated points
        for (let i = 0; i < bufferSize; i++) {
            const t = i / bufferSize;
            const pointIndex = t * rotatedPoints.length;
            const index1 = Math.floor(pointIndex) % rotatedPoints.length;
            const index2 = (index1 + 1) % rotatedPoints.length;
            const frac = pointIndex - Math.floor(pointIndex);

            // Linear interpolation
            leftData[i] = rotatedPoints[index1][0] * (1 - frac) + rotatedPoints[index2][0] * frac;
            rightData[i] = rotatedPoints[index1][1] * (1 - frac) + rotatedPoints[index2][1] * frac;
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
        // Clear any existing clock interval
        if (this.clockInterval) {
            clearInterval(this.clockInterval);
        }

        // Draw initial clock
        this.createWaveform(generateClockPoints());

        // Set up interval to redraw every second
        this.clockInterval = setInterval(() => {
            if (this.isPlaying) {
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

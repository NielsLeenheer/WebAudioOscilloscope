/**
 * Microphone Input Helper
 * Manages microphone access, audio context, and stereo channel analysers
 */

export class MicrophoneInput {
    constructor() {
        this.stream = null;
        this.audioContext = null;
        this.analyserLeft = null;
        this.analyserRight = null;
        this.source = null;
    }

    /**
     * Start microphone input with stereo channel separation
     * @param {Object} options - Configuration options
     * @param {number} options.fftSize - FFT size for analysers (default: 16384)
     * @param {boolean} options.echoCancellation - Enable echo cancellation (default: false)
     * @param {boolean} options.noiseSuppression - Enable noise suppression (default: false)
     * @param {boolean} options.autoGainControl - Enable auto gain control (default: false)
     * @returns {Promise<Object>} Object containing audioContext, analyserLeft, analyserRight
     */
    async start({
        fftSize = 16384,
        echoCancellation = false,
        noiseSuppression = false,
        autoGainControl = false
    } = {}) {
        // Stop any existing stream first
        this.stop();

        try {
            // Request microphone access
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation,
                    noiseSuppression,
                    autoGainControl
                }
            });

            // Create audio context
            this.audioContext = new AudioContext();
            this.source = this.audioContext.createMediaStreamSource(this.stream);

            // Create stereo splitter
            const splitter = this.audioContext.createChannelSplitter(2);
            this.source.connect(splitter);

            // Create analysers for left channel
            this.analyserLeft = this.audioContext.createAnalyser();
            this.analyserLeft.fftSize = fftSize;
            splitter.connect(this.analyserLeft, 0);

            // Create analysers for right channel
            this.analyserRight = this.audioContext.createAnalyser();
            this.analyserRight.fftSize = fftSize;
            splitter.connect(this.analyserRight, 1);

            console.log('Microphone input started');

            return {
                audioContext: this.audioContext,
                analyserLeft: this.analyserLeft,
                analyserRight: this.analyserRight
            };
        } catch (error) {
            console.error('Error accessing microphone:', error);
            this.stop(); // Clean up any partial initialization
            throw error;
        }
    }

    /**
     * Stop microphone input and clean up resources
     */
    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        this.source = null;
        this.analyserLeft = null;
        this.analyserRight = null;

        console.log('Microphone input stopped');
    }

    /**
     * Check if microphone is currently active
     * @returns {boolean}
     */
    isActive() {
        return this.stream !== null && this.audioContext !== null;
    }

    /**
     * Get current audio context
     * @returns {AudioContext|null}
     */
    getAudioContext() {
        return this.audioContext;
    }

    /**
     * Get left channel analyser
     * @returns {AnalyserNode|null}
     */
    getAnalyserLeft() {
        return this.analyserLeft;
    }

    /**
     * Get right channel analyser
     * @returns {AnalyserNode|null}
     */
    getAnalyserRight() {
        return this.analyserRight;
    }

    /**
     * Get all analysers
     * @returns {Object} Object containing analyserLeft and analyserRight
     */
    getAnalysers() {
        return {
            analyserLeft: this.analyserLeft,
            analyserRight: this.analyserRight
        };
    }
}

/**
 * Create a new microphone input instance
 * @returns {MicrophoneInput}
 */
export function createMicrophoneInput() {
    return new MicrophoneInput();
}

/**
 * AudioWorklet processor for points mode.
 *
 * Runs on the audio thread, cycling through the latest frame of XY points
 * and outputting them as two mono outputs: output 0 = X, output 1 = Y.
 * When no new frame arrives, the current frame keeps repeating — so the
 * oscilloscope beam holds its position instead of snapping to 0,0.
 *
 * Each new frame REPLACES the previous one (no queue). This ensures the
 * analyser window always shows a single stable frame repeating, rather
 * than a stream of different frames that would create ghost images.
 *
 * Frames arrive pre-processed (rotated, resampled) from the frame-processor
 * worker. This worklet is a pure ring buffer player.
 *
 * Communication with the main thread:
 *   port.postMessage({ type: 'points', data: Float32Array })
 *     - Interleaved [x0,y0, x1,y1, ...] point data (pre-rotated)
 *   port.postMessage({ type: 'clear' })
 *     - Reset all buffers (e.g. on stop)
 */
class PointsProcessor extends AudioWorkletProcessor {
    constructor() {
        super();

        // Current frame: interleaved Float32Array [x0,y0, x1,y1, ...]
        this.frame = null;
        this.frameOffset = 0;

        this.port.onmessage = (e) => {
            const msg = e.data;
            if (msg.type === 'points') {
                // Replace current frame (no queue — always show latest)
                this.frame = msg.data;
                this.frameOffset = 0;
            } else if (msg.type === 'clear') {
                this.frame = null;
                this.frameOffset = 0;
            }
        };
    }

    process(inputs, outputs) {
        // Output 0 = X (left channel), Output 1 = Y (right channel)
        const xOut = outputs[0]?.[0];
        const yOut = outputs[1]?.[0];
        if (!xOut || !yOut) return true;

        const frame = this.frame;
        if (!frame || frame.length < 2) {
            // No data yet — output silence
            xOut.fill(0);
            yOut.fill(0);
            return true;
        }

        const len = xOut.length; // Typically 128 samples
        const frameLen = frame.length;
        let offset = this.frameOffset;

        for (let i = 0; i < len; i++) {
            xOut[i] = frame[offset];
            yOut[i] = frame[offset + 1];
            offset += 2;
            if (offset >= frameLen) {
                offset = 0;
            }
        }

        this.frameOffset = offset;
        return true;
    }
}

registerProcessor('points-processor', PointsProcessor);

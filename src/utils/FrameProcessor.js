/**
 * Reconstruct segment arrays from flat preview buffers.
 * @param {Float32Array} data - Interleaved [x0,y0, x1,y1, ...]
 * @param {Uint32Array} offsets - Cumulative point offsets per segment, length = segmentCount + 1
 * @returns {Array} Segments: [[[x,y], ...], ...]
 */
function reconstructSegments(data, offsets) {
    const segments = [];
    for (let i = 0; i < offsets.length - 1; i++) {
        const start = offsets[i];
        const end = offsets[i + 1];
        const segment = [];
        for (let j = start; j < end; j++) {
            segment.push([data[j * 2], data[j * 2 + 1]]);
        }
        segments.push(segment);
    }
    return segments;
}

/**
 * FrameProcessor — Main thread wrapper for the frame-processor worker.
 *
 * Provides a clean API for tabs to send raw segments for processing,
 * and delivers processed audio-ready frames via a callback.
 */
export class FrameProcessor {
    constructor() {
        this.worker = new Worker(
            new URL('../workers/frame-processor.js', import.meta.url),
            { type: 'module' }
        );
        this.frameId = 0;
        this.latestSentId = 0;
        this.ready = false;

        /** Processed preview segments: [[[x,y], ...], ...] */
        this.processedPreview = null;
        /** Processed point count (after resampling) */
        this.processedPointCount = 0;
        /** Processed segment count */
        this.processedSegmentCount = 0;

        /** @type {((data: object) => void) | null} */
        this.onFrameReady = null;

        /** @type {(() => void) | null} Called when processedPreview updates (including from settings changes) */
        this.onPreviewUpdate = null;

        this.worker.onmessage = (e) => {
            const msg = e.data;
            if (msg.type === 'ready') {
                this.ready = true;
            } else if (msg.type === 'frameReady') {
                // Discard stale frames (from before a newer request)
                if (msg.id < this.latestSentId) return;

                // Reconstruct preview segments from transferable buffers
                if (msg.previewData && msg.segmentOffsets) {
                    this.processedPreview = reconstructSegments(
                        msg.previewData, msg.segmentOffsets
                    );
                }
                this.processedPointCount = msg.pointCount || 0;
                this.processedSegmentCount = msg.segmentOffsets
                    ? msg.segmentOffsets.length - 1
                    : 0;

                this.onPreviewUpdate?.();
                this.onFrameReady?.(msg);
            }
        };
    }

    /**
     * Send raw segments for processing.
     * @param {Array} segments - Array of segments: [[[x,y], ...], ...]
     */
    processFrame(segments) {
        this.frameId++;
        this.latestSentId = this.frameId;
        // Deep-copy to plain arrays — Svelte 5 $state proxies can't be structured-cloned
        const plain = segments.map(seg => seg.map(pt => [pt[0], pt[1]]));
        this.worker.postMessage({
            type: 'processFrame',
            segments: plain,
            id: this.frameId
        });
    }

    /**
     * Update processing settings.
     * @param {object} newSettings - Partial settings to merge
     */
    updateSettings(newSettings) {
        this.worker.postMessage({
            type: 'updateSettings',
            ...newSettings
        });
    }

    /**
     * Reset beam position tracking (e.g., on tab switch).
     */
    resetBeamPosition() {
        this.worker.postMessage({ type: 'resetBeamPosition' });
    }

    /**
     * Terminate the worker.
     */
    destroy() {
        this.worker.terminate();
    }
}

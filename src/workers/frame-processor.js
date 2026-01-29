/**
 * Frame Processing Worker
 *
 * Centralizes all segment processing for oscilloscope output.
 * Receives raw segments from generator tabs, processes them
 * (reorder, rotate, resample), and outputs ready-to-play audio data.
 *
 * Communication:
 *   Inbound:
 *     { type: 'processFrame', segments, id }  — raw segments to process
 *     { type: 'updateSettings', ...settings }  — update processing settings
 *     { type: 'resetBeamPosition' }            — clear last beam position
 *
 *   Outbound:
 *     { type: 'frameReady', id, left?, right?, interleaved?, segmentCount, pointCount }
 */

// ─── Worker State ────────────────────────────────────────────────────────────

let settings = {
    mode: 'frequency',           // 'frequency' or 'points'
    frequency: 100,              // Hz (frequency mode buffer size)
    sampleRate: 48000,
    rotation: 0,                 // degrees
    pointSpacing: 0.02,          // for points mode
    resampleMode: 'proportional', // 'off', 'uniform', 'proportional'
    optimizeOrder: true,
    trackBeamPosition: true,
    previewAfterResample: true   // true: optimize→resample→preview→rotate
                                 // false: optimize→preview→resample→rotate
};

let lastBeamPosition = null;     // [x, y] — persists across frames
let lastSegments = null;         // Cache last raw segments for re-processing on settings change
let lastFrameId = 0;             // ID of last processed frame

// ─── Message Handler ─────────────────────────────────────────────────────────

self.onmessage = (e) => {
    const msg = e.data;

    if (msg.type === 'processFrame') {
        lastSegments = msg.segments;
        lastFrameId = msg.id;
        processFrame(msg.segments, msg.id);
    } else if (msg.type === 'updateSettings') {
        Object.assign(settings, msg);
        // Remove the 'type' key that got merged in
        delete settings.type;
        // Re-process last frame with new settings so static content updates immediately
        if (lastSegments) {
            processFrame(lastSegments, lastFrameId);
        }
    } else if (msg.type === 'resetBeamPosition') {
        lastBeamPosition = null;
    }
};

// Signal ready
self.postMessage({ type: 'ready' });

// ─── Frame Processing Pipeline ───────────────────────────────────────────────

function processFrame(segments, id) {
    if (!segments || segments.length === 0) return;

    // Filter out empty segments
    let segs = segments.filter(s => s && s.length >= 2);
    if (segs.length === 0) return;

    // 1. Optimize segment order
    if (settings.optimizeOrder) {
        const startPos = settings.trackBeamPosition ? lastBeamPosition : null;
        segs = optimizeSegmentOrder(segs, startPos);
    }

    // Update beam position for next frame
    if (settings.trackBeamPosition && segs.length > 0) {
        const lastSeg = segs[segs.length - 1];
        lastBeamPosition = lastSeg[lastSeg.length - 1];
    }

    // 2. Resample
    const resampled = resampleSegments(segs);

    // 3. Capture preview (configurable: before or after resample)
    const preview = serializePreview(settings.previewAfterResample ? resampled : segs);

    // 4. Apply rotation (output-only transform, after preview)
    let output = resampled;
    if (settings.rotation !== 0) {
        const rad = settings.rotation * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        output = output.map(seg =>
            seg.map(([x, y]) => [
                x * cos - y * sin,
                x * sin + y * cos
            ])
        );
    }

    // 5. Output audio data
    if (settings.mode === 'points') {
        outputPointsMode(output, id, preview);
    } else {
        outputFrequencyMode(output, id, preview);
    }
}

/**
 * Resample segments based on current mode and settings.
 * Points mode uses pointSpacing; frequency mode uses a fixed spacing of 0.008.
 */
function resampleSegments(segments) {
    const spacing = settings.mode === 'points' ? settings.pointSpacing : 0.008;

    if (settings.resampleMode === 'uniform') {
        return segments.map(seg => resampleSegment(seg, spacing));
    } else if (settings.resampleMode === 'proportional') {
        return proportionalResampleFrame(segments, spacing);
    }
    return segments;
}

// ─── Points Mode Output ──────────────────────────────────────────────────────

function outputPointsMode(segments, id, preview) {
    // Flatten to interleaved Float32Array [x0,y0, x1,y1, ...]
    const totalPoints = segments.reduce((sum, seg) => sum + seg.length, 0);
    const interleaved = new Float32Array(totalPoints * 2);
    let offset = 0;
    for (const seg of segments) {
        for (const [x, y] of seg) {
            interleaved[offset++] = x;
            interleaved[offset++] = y;
        }
    }

    self.postMessage(
        {
            type: 'frameReady',
            id,
            interleaved,
            segmentCount: segments.length,
            pointCount: totalPoints,
            previewData: preview.previewData,
            segmentOffsets: preview.segmentOffsets
        },
        [interleaved.buffer, preview.previewData.buffer, preview.segmentOffsets.buffer]
    );
}

// ─── Frequency Mode Output ───────────────────────────────────────────────────

function outputFrequencyMode(segments, id, preview) {
    // Interpolate into fixed-size left/right buffers
    const sampleRate = settings.sampleRate;
    const duration = 1 / settings.frequency;
    const bufferSize = Math.ceil(sampleRate * duration);

    const left = new Float32Array(bufferSize);
    const right = new Float32Array(bufferSize);

    const totalPoints = segments.reduce((sum, seg) => sum + seg.length, 0);
    if (totalPoints === 0) return;

    let bufferOffset = 0;
    let cumulativePoints = 0;

    for (const segment of segments) {
        cumulativePoints += segment.length;
        const targetEndOffset = Math.round(bufferSize * cumulativePoints / totalPoints);
        const segmentBufferSize = targetEndOffset - bufferOffset;

        if (segmentBufferSize <= 0) continue;

        for (let i = 0; i < segmentBufferSize; i++) {
            const t = i / segmentBufferSize;
            const pointIndex = t * segment.length;
            const index1 = Math.floor(pointIndex);
            const index2 = Math.min(index1 + 1, segment.length - 1);
            const frac = pointIndex - index1;

            const bufferIndex = bufferOffset + i;
            if (bufferIndex < bufferSize) {
                left[bufferIndex] = segment[index1][0] * (1 - frac) + segment[index2][0] * frac;
                right[bufferIndex] = segment[index1][1] * (1 - frac) + segment[index2][1] * frac;
            }
        }

        bufferOffset = targetEndOffset;
    }

    self.postMessage(
        {
            type: 'frameReady',
            id,
            left,
            right,
            segmentCount: segments.length,
            pointCount: bufferSize,
            previewData: preview.previewData,
            segmentOffsets: preview.segmentOffsets
        },
        [left.buffer, right.buffer, preview.previewData.buffer, preview.segmentOffsets.buffer]
    );
}

// ─── Preview Serialization ───────────────────────────────────────────────────

/**
 * Serialize segments into transferable buffers for preview rendering.
 * @param {Array} segments - Array of segments: [[[x,y], ...], ...]
 * @returns {{ previewData: Float32Array, segmentOffsets: Uint32Array }}
 */
function serializePreview(segments) {
    const offsets = new Uint32Array(segments.length + 1);
    let total = 0;
    for (let i = 0; i < segments.length; i++) {
        offsets[i] = total;
        total += segments[i].length;
    }
    offsets[segments.length] = total;

    const data = new Float32Array(total * 2);
    let off = 0;
    for (const seg of segments) {
        for (const [x, y] of seg) {
            data[off++] = x;
            data[off++] = y;
        }
    }
    return { previewData: data, segmentOffsets: offsets };
}

// ─── Segment Reordering ──────────────────────────────────────────────────────

/**
 * Reorder segments to minimize beam travel distance (greedy nearest-neighbor).
 * @param {Array} segments - Array of segments, each is [[x,y], ...]
 * @param {Array|null} startPosition - [x,y] start point, or null to start from center
 */
function optimizeSegmentOrder(segments, startPosition) {
    if (segments.length <= 1) return segments;

    const ordered = [];
    const used = new Uint8Array(segments.length);

    // Find starting segment
    let startIdx = 0;
    let minDist = Infinity;

    if (startPosition) {
        // Find segment closest to startPosition
        const [sx, sy] = startPosition;
        for (let i = 0; i < segments.length; i++) {
            const s = segments[i];
            const ds = (s[0][0] - sx) ** 2 + (s[0][1] - sy) ** 2;
            const de = (s[s.length - 1][0] - sx) ** 2 + (s[s.length - 1][1] - sy) ** 2;
            const d = Math.min(ds, de);
            if (d < minDist) { minDist = d; startIdx = i; }
        }
        // Check if start or end is closer, and reverse if end is closer
        const s = segments[startIdx];
        const ds = (s[0][0] - startPosition[0]) ** 2 + (s[0][1] - startPosition[1]) ** 2;
        const de = (s[s.length - 1][0] - startPosition[0]) ** 2 + (s[s.length - 1][1] - startPosition[1]) ** 2;
        ordered.push(de < ds ? [...s].reverse() : s);
    } else {
        // Find segment closest to center (0,0)
        for (let i = 0; i < segments.length; i++) {
            const s = segments[i];
            const ds = s[0][0] ** 2 + s[0][1] ** 2;
            const de = s[s.length - 1][0] ** 2 + s[s.length - 1][1] ** 2;
            const d = Math.min(ds, de);
            if (d < minDist) { minDist = d; startIdx = i; }
        }
        ordered.push(segments[startIdx]);
    }
    used[startIdx] = 1;

    // Greedily pick nearest segment
    for (let n = 1; n < segments.length; n++) {
        const lastSeg = ordered[ordered.length - 1];
        const lastEnd = lastSeg[lastSeg.length - 1];
        let bestIdx = -1;
        let bestDist = Infinity;
        let reverse = false;

        for (let i = 0; i < segments.length; i++) {
            if (used[i]) continue;
            const seg = segments[i];
            const ds = (seg[0][0] - lastEnd[0]) ** 2 + (seg[0][1] - lastEnd[1]) ** 2;
            const de = (seg[seg.length - 1][0] - lastEnd[0]) ** 2 + (seg[seg.length - 1][1] - lastEnd[1]) ** 2;
            if (ds < bestDist) { bestDist = ds; bestIdx = i; reverse = false; }
            if (de < bestDist) { bestDist = de; bestIdx = i; reverse = true; }
        }

        if (bestIdx >= 0) {
            used[bestIdx] = 1;
            ordered.push(reverse ? [...segments[bestIdx]].reverse() : segments[bestIdx]);
        }
    }

    return ordered;
}

// ─── Uniform Resampling ──────────────────────────────────────────────────────

/**
 * Resample a segment so points are uniformly spaced along its length.
 */
function resampleSegment(segment, spacing) {
    if (segment.length < 2 || spacing <= 0) return segment;

    const resampled = [segment[0]];
    let accDist = 0;
    let last = segment[0];

    for (let i = 1; i < segment.length; i++) {
        const dx = segment[i][0] - segment[i - 1][0];
        const dy = segment[i][1] - segment[i - 1][1];
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) continue;

        const dirX = dx / dist;
        const dirY = dy / dist;
        accDist += dist;

        while (accDist >= spacing) {
            last = [last[0] + dirX * spacing, last[1] + dirY * spacing];
            resampled.push(last);
            accDist -= spacing;
        }
    }

    // Include final point if not too close
    const end = segment[segment.length - 1];
    const fdx = end[0] - resampled[resampled.length - 1][0];
    const fdy = end[1] - resampled[resampled.length - 1][1];
    if (Math.sqrt(fdx * fdx + fdy * fdy) > spacing * 0.1) {
        resampled.push(end);
    }

    return resampled;
}

// ─── Proportional Resampling ─────────────────────────────────────────────────

/**
 * Calculate the polyline length of a segment.
 */
function segmentLength(segment) {
    let len = 0;
    for (let i = 1; i < segment.length; i++) {
        const dx = segment[i][0] - segment[i - 1][0];
        const dy = segment[i][1] - segment[i - 1][1];
        len += Math.sqrt(dx * dx + dy * dy);
    }
    return len;
}

/**
 * Interpolate extra points into a segment, preserving all original points.
 * Distributes `extraCount` new points among edges proportional to edge length.
 */
function interpolateSegment(segment, extraCount) {
    if (extraCount <= 0 || segment.length < 2) return segment;

    const edgeCount = segment.length - 1;
    const edgeLengths = new Float64Array(edgeCount);
    let totalLen = 0;
    for (let i = 0; i < edgeCount; i++) {
        const dx = segment[i + 1][0] - segment[i][0];
        const dy = segment[i + 1][1] - segment[i][1];
        edgeLengths[i] = Math.sqrt(dx * dx + dy * dy);
        totalLen += edgeLengths[i];
    }
    if (totalLen === 0) return segment;

    const edgeExtras = new Uint32Array(edgeCount);
    let assigned = 0;
    for (let i = 0; i < edgeCount; i++) {
        edgeExtras[i] = Math.floor(extraCount * edgeLengths[i] / totalLen);
        assigned += edgeExtras[i];
    }
    let remaining = extraCount - assigned;
    if (remaining > 0) {
        const indices = Array.from({ length: edgeCount }, (_, i) => i);
        indices.sort((a, b) => edgeLengths[b] - edgeLengths[a]);
        for (let i = 0; remaining > 0 && i < edgeCount; i++) {
            edgeExtras[indices[i]]++;
            remaining--;
        }
    }

    const result = [segment[0]];
    for (let i = 0; i < edgeCount; i++) {
        const n = edgeExtras[i];
        if (n > 0) {
            const [x0, y0] = segment[i];
            const [x1, y1] = segment[i + 1];
            const steps = n + 1;
            for (let j = 1; j <= n; j++) {
                const t = j / steps;
                result.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
            }
        }
        result.push(segment[i + 1]);
    }

    return result;
}

/**
 * Proportional resampling: distribute a point budget across all segments
 * proportional to their length.
 */
function proportionalResampleFrame(segments, spacing) {
    if (segments.length === 0) return segments;

    const lengths = segments.map(segmentLength);
    const totalLength = lengths.reduce((s, l) => s + l, 0);
    if (totalLength === 0) return segments;

    const targetTotal = Math.ceil(totalLength / spacing);
    const currentTotal = segments.reduce((s, seg) => s + seg.length, 0);
    const extraTotal = Math.max(0, targetTotal - currentTotal);

    if (extraTotal === 0) return segments;

    const segExtras = new Uint32Array(segments.length);
    let assigned = 0;
    for (let i = 0; i < segments.length; i++) {
        segExtras[i] = Math.floor(extraTotal * lengths[i] / totalLength);
        assigned += segExtras[i];
    }
    let remaining = extraTotal - assigned;
    if (remaining > 0) {
        const indices = Array.from({ length: segments.length }, (_, i) => i);
        indices.sort((a, b) => lengths[b] - lengths[a]);
        for (let i = 0; remaining > 0 && i < segments.length; i++) {
            segExtras[indices[i]]++;
            remaining--;
        }
    }

    return segments.map((seg, i) => interpolateSegment(seg, segExtras[i]));
}

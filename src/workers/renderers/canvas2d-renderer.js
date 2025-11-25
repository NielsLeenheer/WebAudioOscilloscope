// Canvas 2D Renderer for oscilloscope visualization
// Implements the standard Canvas 2D API rendering

export class Canvas2DRenderer {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.devicePixelRatio = 1;
        this.logicalWidth = 600;
        this.logicalHeight = 600;
    }

    /**
     * Initialize the renderer with an OffscreenCanvas
     * @param {OffscreenCanvas} canvas - The canvas to render to
     * @param {number} devicePixelRatio - Display pixel ratio for high-DPI support
     * @param {number} logicalWidth - Logical width in CSS pixels
     * @param {number} logicalHeight - Logical height in CSS pixels
     */
    init(canvas, devicePixelRatio, logicalWidth, logicalHeight) {
        this.canvas = canvas;
        this.devicePixelRatio = devicePixelRatio || 1;
        this.logicalWidth = logicalWidth || 600;
        this.logicalHeight = logicalHeight || 600;

        this.ctx = canvas.getContext('2d');

        // Scale context for high-DPI displays
        this.ctx.scale(devicePixelRatio, devicePixelRatio);
    }

    /**
     * Check if the renderer is initialized and ready
     * @returns {boolean}
     */
    isReady() {
        return this.ctx !== null;
    }

    /**
     * Get the rendering context (for debug FPS drawing)
     * @returns {CanvasRenderingContext2D}
     */
    getContext() {
        return this.ctx;
    }

    /**
     * Clear the canvas with persistence effect
     * @param {number} persistence - Persistence level (0 = instant clear, 0.99 = long trails)
     * @param {number} canvasWidth - Canvas width in logical pixels
     * @param {number} canvasHeight - Canvas height in logical pixels
     */
    clearWithPersistence(persistence, canvasWidth, canvasHeight) {
        if (!this.ctx) return;

        // Background: dark gray with greenish tint (#1a1f1a = rgb(26, 31, 26))
        this.ctx.fillStyle = `rgba(26, 31, 26, ${1 - persistence})`;
        this.ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    /**
     * Clear the canvas completely (power off)
     */
    clear() {
        if (!this.ctx) return;

        this.ctx.fillStyle = 'rgb(26, 31, 26)';
        this.ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);
    }

    /**
     * Render the oscilloscope trace
     * @param {Object} params - Rendering parameters
     */
    renderTrace(params) {
        const {
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
        } = params;

        if (!this.ctx || points.length < 2) return;

        const ctx = this.ctx;

        // Calculate scale factor for resolution-independent rendering
        const canvasScale = Math.min(canvasWidth, canvasHeight);
        const LINE_WIDTH_RATIO = 0.00375;      // 0.375% of canvas
        const GREEN_DOT_RATIO = 0.001875;      // 0.1875% of canvas
        const DEBUG_DOT_RATIO = 0.0025;        // 0.25% of canvas

        // Time interval for each segment
        const TIME_SEGMENT = timeSegment / 1000; // Convert from milliseconds to seconds

        // Time per point
        const timePerPoint = 1 / sampleRate;

        // Store original points for blue dot visualization
        const originalPoints = points;
        const originalSpeeds = speeds;

        // First pass: detect direction changes on ORIGINAL points
        const directionChanges = new Map();
        for (let i = 1; i < originalPoints.length - 1; i++) {
            const inX = originalPoints[i].x - originalPoints[i - 1].x;
            const inY = originalPoints[i].y - originalPoints[i - 1].y;
            const outX = originalPoints[i + 1].x - originalPoints[i].x;
            const outY = originalPoints[i + 1].y - originalPoints[i].y;

            const inMag = Math.sqrt(inX * inX + inY * inY);
            const outMag = Math.sqrt(outX * outX + outY * outY);

            if (inMag > 0 && outMag > 0) {
                const dotProduct = inX * outX + inY * outY;
                const cosAngle = dotProduct / (inMag * outMag);
                const clampedCos = Math.max(-1, Math.min(1, cosAngle));
                const angleRad = Math.acos(clampedCos);
                const angleDeg = angleRad * (180 / Math.PI);
                const normalizedAngle = angleDeg / 180;
                const brightness = Math.pow(normalizedAngle, 1.5);

                if (brightness > 0.05) {
                    directionChanges.set(i, brightness);
                }
            }
        }

        // Apply interpolation
        const interpolated = interpolatePoints(points, speeds, TIME_SEGMENT, timePerPoint);
        let renderPoints = interpolated.points;
        let renderSpeeds = interpolated.speeds;
        const isInterpolated = interpolated.isInterpolated;

        const interpolatedTimePerPoint = TIME_SEGMENT;

        // Configure canvas for drawing
        ctx.lineWidth = LINE_WIDTH_RATIO * canvasScale;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Second pass: render segments
        let segmentStartIdx = 0;
        let accumulatedTime = 0;

        for (let i = 1; i < renderPoints.length; i++) {
            accumulatedTime += interpolatedTimePerPoint;

            if (accumulatedTime >= TIME_SEGMENT || i === renderPoints.length - 1) {
                let totalDistance = 0;
                for (let j = segmentStartIdx + 1; j <= i && j < renderSpeeds.length; j++) {
                    totalDistance += renderSpeeds[j] || 0;
                }
                const avgSpeed = totalDistance / Math.max(1, i - segmentStartIdx);

                const opacity = calculatePhosphorExcitation(avgSpeed, velocityDimming, basePower, deltaTime);

                ctx.beginPath();
                ctx.moveTo(renderPoints[segmentStartIdx].x, renderPoints[segmentStartIdx].y);

                for (let j = segmentStartIdx + 1; j <= i; j++) {
                    ctx.lineTo(renderPoints[j].x, renderPoints[j].y);
                }

                ctx.strokeStyle = `rgba(76, 175, 80, ${opacity})`;
                ctx.stroke();

                segmentStartIdx = i;
                accumulatedTime = 0;
            }
        }

        // Third pass: highlight direction changes with green dots
        const greenDotSize = GREEN_DOT_RATIO * canvasScale;
        for (const [idx, brightness] of directionChanges) {
            const point = originalPoints[idx];
            const opacity = basePower * brightness;

            ctx.fillStyle = `rgba(76, 175, 80, ${opacity})`;
            ctx.beginPath();
            ctx.arc(point.x, point.y, greenDotSize, 0, Math.PI * 2);
            ctx.fill();
        }

        // Debug visualization: red dots for interpolated points
        if (debugMode && dotOpacity > 0) {
            const debugDotSize = DEBUG_DOT_RATIO * canvasScale;
            ctx.fillStyle = `rgba(255, 0, 0, ${dotOpacity})`;
            for (let i = 0; i < renderPoints.length; i++) {
                if (isInterpolated[i]) {
                    const point = renderPoints[i];
                    ctx.beginPath();
                    ctx.arc(point.x, point.y, debugDotSize, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        // Fourth pass: blue dots at original sample points
        if (debugMode && sampleDotOpacity > 0) {
            const blueDotBaseSize = DEBUG_DOT_RATIO * canvasScale;
            for (let i = 0; i < originalPoints.length; i++) {
                const point = originalPoints[i];
                const brightness = directionChanges.get(i) || 0;
                const sizeMultiplier = 1 + (brightness * (dotSizeVariation - 1));
                const dotSize = blueDotBaseSize * sizeMultiplier;

                ctx.fillStyle = `rgba(59, 130, 246, ${sampleDotOpacity})`;
                ctx.beginPath();
                ctx.arc(point.x, point.y, dotSize, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    /**
     * Draw FPS counter for debug mode
     * @param {number} fps - Current FPS value
     */
    drawFPS(fps) {
        if (!this.ctx) return;

        const ctx = this.ctx;
        const fpsText = `${Math.round(fps)} FPS`;

        ctx.font = 'bold 14px "Courier New", monospace';
        const textMetrics = ctx.measureText(fpsText);
        const textWidth = textMetrics.width;

        const padding = 8;
        const boxX = 110;
        const boxY = 480 - padding - 14;
        const boxWidth = textWidth + padding * 2;
        const boxHeight = 14 + padding;

        ctx.fillStyle = 'rgba(26, 26, 26, 0.7)';
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 4);
        ctx.fill();

        ctx.fillStyle = '#4CAF50';
        ctx.fillText(fpsText, boxX + padding, boxY + padding + 11);
    }

    /**
     * Get renderer name for display
     * @returns {string}
     */
    getName() {
        return 'Canvas 2D';
    }

    /**
     * Destroy the renderer and release resources
     */
    destroy() {
        this.ctx = null;
        this.canvas = null;
    }
}

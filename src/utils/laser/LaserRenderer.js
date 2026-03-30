/**
 * Laser Renderer for oscilloscope visualization
 * 
 * Converts oscilloscope trace data to ILDA laser format and sends to Helios DAC.
 * Unlike canvas renderers, this outputs to physical hardware via WebUSB.
 */

import { HeliosDevice, HeliosPoint, connectHeliosDevice, getHeliosDevices, HELIOS } from '../../utils/laser/HeliosDac.js';

/**
 * Trapezoid calibration for keystone correction
 * Transforms a unit square to an arbitrary quadrilateral
 */
export class TrapezoidCalibration {
    constructor() {
        // Corner positions in normalized coordinates (0-1)
        // Default: no transformation (unit square)
        this.corners = {
            topLeft: { x: 0, y: 0 },
            topRight: { x: 1, y: 0 },
            bottomLeft: { x: 0, y: 1 },
            bottomRight: { x: 1, y: 1 }
        };
        
        // Precomputed transformation coefficients
        this.coefficients = null;
        this.inverseCoefficients = null;
        this.computeCoefficients();
    }

    /**
     * Set corner positions
     * @param {Object} corners - Object with topLeft, topRight, bottomLeft, bottomRight, each {x, y}
     */
    setCorners(corners) {
        this.corners = { ...this.corners, ...corners };
        this.computeCoefficients();
    }

    /**
     * Compute perspective transformation coefficients
     * Uses bilinear interpolation for the quadrilateral mapping
     */
    computeCoefficients() {
        const { topLeft, topRight, bottomLeft, bottomRight } = this.corners;
        
        // For bilinear interpolation, we compute:
        // P = (1-u)(1-v)P00 + u(1-v)P10 + (1-u)vP01 + uvP11
        // Where u,v are normalized input coords and P00,P10,P01,P11 are corners
        
        this.coefficients = {
            // X coefficients
            ax: topLeft.x,
            bx: topRight.x - topLeft.x,
            cx: bottomLeft.x - topLeft.x,
            dx: topLeft.x - topRight.x - bottomLeft.x + bottomRight.x,
            // Y coefficients  
            ay: topLeft.y,
            by: topRight.y - topLeft.y,
            cy: bottomLeft.y - topLeft.y,
            dy: topLeft.y - topRight.y - bottomLeft.y + bottomRight.y
        };
    }

    /**
     * Transform a point from normalized space (0-1) to output space (0-1)
     * @param {number} x - Input X (0-1)
     * @param {number} y - Input Y (0-1)
     * @returns {{x: number, y: number}}
     */
    transform(x, y) {
        const { ax, bx, cx, dx, ay, by, cy, dy } = this.coefficients;
        
        return {
            x: ax + bx * x + cx * y + dx * x * y,
            y: ay + by * x + cy * y + dy * x * y
        };
    }

    /**
     * Reset to identity transformation
     */
    reset() {
        this.corners = {
            topLeft: { x: 0, y: 0 },
            topRight: { x: 1, y: 0 },
            bottomLeft: { x: 0, y: 1 },
            bottomRight: { x: 1, y: 1 }
        };
        this.computeCoefficients();
    }

    /**
     * Export calibration data
     */
    toJSON() {
        return { corners: this.corners };
    }

    /**
     * Import calibration data
     */
    fromJSON(data) {
        if (data && data.corners) {
            this.setCorners(data.corners);
        }
    }
}

/**
 * Laser output renderer
 */
export class LaserRenderer {
    constructor() {
        this.device = null;
        this.calibration = new TrapezoidCalibration();
        
        // Intuitive calibration parameters (used by UI)
        this.calibrationParams = {
            rotate: 0,
            scale: 1.0,
            topBottom: 0,
            leftRight: 0
        };

        // Frame pacing
        this.lastFrameTime = 0;
        this.minFrameInterval = 20; // ~50fps max to avoid overwhelming device
        this.pendingFrame = null;
        this.isSending = false;
        
        // Stats tracking
        this.framesSentThisSecond = 0;
        this.framesSkippedThisSecond = 0;
        this.lastStatsTime = 0;
        
        // Laser output settings
        this.settings = {
            pps: 30000,              // Points per second
            targetFps: 30,            // Target frame rate for point budget
            intensity: 1.0,           // Overall intensity (0-1)
            color: { r: 0, g: 255, b: 0 }, // Default green
            blankingPoints: 15,       // Number of blanking points between segments
            blankingDwell: 5,         // Dwell points at start/end of blanking (galvo settle)
            cornerDwell: 3,           // Extra points at corners for sharpness
            invertX: true,            // Flip X axis (adjust for projector orientation)
            invertY: true,            // Flip Y axis (adjust for projector orientation)
            swapXY: false,
            safetyBorder: 0.05,       // Keep away from edges (0-1)
            pincushionH: 0.0,         // Horizontal pincushion correction
            pincushionV: 0.0,         // Vertical pincushion correction
            offsetX: 0.0,             // Horizontal position shift
            offsetY: 0.0,             // Vertical position shift
            velocityDimming: 0.5      // How much velocity affects brightness
        };

        // State
        this.enabled = false;
        this.lastFrame = [];
        this.frameCount = 0;
        this.onStatusChange = null;

        // Statistics
        this.stats = {
            framesPerSecond: 0,
            pointsPerFrame: 0,
            inputPoints: 0,
            actualPps: 0
        };
    }

    /**
     * Check if WebUSB and laser output is available
     */
    static isSupported() {
        return 'usb' in navigator && window.isSecureContext;
    }

    /**
     * Connect to a Helios DAC
     * Shows browser USB device picker
     */
    async connect() {
        console.log('[LaserRenderer] Connecting to Helios DAC...');
        try {
            this.emitStatus('connecting');
            console.log('[LaserRenderer] Requesting device from browser...');
            this.device = await connectHeliosDevice();
            console.log('[LaserRenderer] Device returned:', this.device);
            
            if (this.device) {
                this.device.pps = this.settings.pps;
                this.device.onStatusChange = (status) => {
                    console.log('[LaserRenderer] Device status:', status);
                    if (this.onStatusChange) {
                        this.onStatusChange(status);
                    }
                };
                
                console.log('[LaserRenderer] Calling device.connect()...');
                const result = await this.device.connect();
                console.log('[LaserRenderer] device.connect() returned:', result);
                this.emitStatus('connected', {
                    name: this.device.name,
                    firmware: this.device.firmwareVersion
                });
                return true;
            }
            console.log('[LaserRenderer] No device selected');
            return false;
        } catch (error) {
            console.error('[LaserRenderer] Failed to connect:', error);
            this.emitStatus('error', { error: error.message });
            return false;
        }
    }

    /**
     * Get list of previously authorized devices
     */
    async getAvailableDevices() {
        return getHeliosDevices();
    }

    /**
     * Disconnect from the device
     */
    async disconnect() {
        if (this.device) {
            await this.device.close();
            this.device = null;
            this.enabled = false;
            this.emitStatus('disconnected');
        }
    }

    /**
     * Enable/disable laser output
     */
    setEnabled(enabled) {
        this.enabled = enabled && this.device && !this.device.closed;
        this.emitStatus(enabled ? 'enabled' : 'disabled');
    }

    /**
     * Update settings
     */
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        if (this.device) {
            this.device.pps = this.settings.pps;
        }
    }

    /**
     * Emit status event
     */
    emitStatus(status, data = {}) {
        if (this.onStatusChange) {
            this.onStatusChange({ status, ...data });
        }
    }

    /**
     * Check if connected and ready
     */
    isReady() {
        return this.device && !this.device.closed && this.enabled;
    }

    /**
     * Convert virtual coordinates (-1 to 1) to laser DAC coordinates (0-4095)
     * Applies calibration transformation
     */
    virtualToLaser(x, y) {
        const { invertX, invertY, swapXY, safetyBorder, pincushionH, pincushionV, offsetX, offsetY } = this.settings;
        
        // Apply position offset in virtual space
        x += offsetX;
        y += offsetY;
        
        // Convert from virtual space (-1, 1) to normalized (0, 1)
        let nx = (x + 1) / 2;
        let ny = (y + 1) / 2;
        
        // Apply pincushion/barrel correction in centered space (H and V independently)
        if (pincushionH !== 0 || pincushionV !== 0) {
            const cx = nx - 0.5;
            const cy = ny - 0.5;
            const r2 = cx * cx + cy * cy;
            nx = 0.5 + cx * (1 + pincushionH * r2 * 0.4);
            ny = 0.5 + cy * (1 + pincushionV * r2 * 0.4);
        }
        
        // Handle axis inversions
        if (invertX) nx = 1 - nx;
        if (invertY) ny = 1 - ny;
        
        // Handle axis swapping
        if (swapXY) {
            [nx, ny] = [ny, nx];
        }
        
        // Apply safety border
        const range = 1 - 2 * safetyBorder;
        nx = safetyBorder + nx * range;
        ny = safetyBorder + ny * range;
        
        // Apply trapezoid calibration
        const calibrated = this.calibration.transform(nx, ny);
        
        // Convert to DAC coordinates (0-4095)
        return {
            x: Math.max(0, Math.min(4095, Math.round(calibrated.x * 4095))),
            y: Math.max(0, Math.min(4095, Math.round(calibrated.y * 4095)))
        };
    }

    /**
     * Generate blanking points to travel from one position to another.
     * Includes dwell at start (turn off) and end (settle before turning on).
     */
    generateBlanking(fromX, fromY, toX, toY) {
        const points = [];
        const count = this.settings.blankingPoints;
        const dwell = this.settings.blankingDwell;
        
        // Brief turn-off dwell at start (let laser modulator fully blank
        // before galvos start moving — prevents stray light during travel)
        const turnOffDwell = Math.max(2, Math.floor(dwell / 2));
        for (let i = 0; i < turnOffDwell; i++) {
            points.push(HeliosPoint.blank(fromX, fromY));
        }
        
        // Travel from start to end with laser off
        for (let i = 0; i <= count; i++) {
            const t = i / count;
            const x = fromX + (toX - fromX) * t;
            const y = fromY + (toY - fromY) * t;
            points.push(HeliosPoint.blank(x, y));
        }
        
        // Dwell at destination with laser off (let galvos settle before turning on)
        for (let i = 0; i < dwell; i++) {
            points.push(HeliosPoint.blank(toX, toY));
        }
        
        return points;
    }

    /**
     * Convert oscilloscope trace points to laser points
     * @param {Array} points - Array of {x, y} points in virtual space
     * @param {Array} speeds - Array of speeds for each point
     * @param {Object} params - Rendering parameters
     * @returns {HeliosPoint[]}
     */
    convertTraceToLaserPoints(points, speeds, params = {}) {
        if (!points || points.length < 2) return [];

        const {
            velocityDimming = this.settings.velocityDimming,
            basePower = 1.0
        } = params;

        const laserPoints = [];
        const { color, intensity, cornerDwell } = this.settings;
        
        let prevLaserPoint = null;
        let prevVirtual = null;
        let lastWasBlank = true;

        for (let i = 0; i < points.length; i++) {
            const pt = points[i];
            const speed = speeds ? speeds[i] : 0;
            
            // Convert coordinates
            const laserCoords = this.virtualToLaser(pt.x, pt.y);
            
            // Calculate intensity based on speed
            // Slower = brighter (more energy per point)
            const speedFactor = 1 - Math.min(speed * velocityDimming, 0.9);
            const pointIntensity = intensity * basePower * speedFactor * 255;
            
            // Check for discontinuity: explicit segment break, first point, or large jump
            let needsBlanking = pt.segmentStart || i === 0;
            
            // Detect large jumps within a continuous trace (galvos can't keep up)
            if (!needsBlanking && prevVirtual) {
                const dx = pt.x - prevVirtual.x;
                const dy = pt.y - prevVirtual.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 0.15) { // Jump larger than ~7.5% of full range
                    needsBlanking = true;
                }
            }
            
            if (needsBlanking && prevLaserPoint && !lastWasBlank) {
                // Anchor dwell: repeat last visible point to solidify segment end
                for (let d = 0; d < cornerDwell; d++) {
                    laserPoints.push(prevLaserPoint);
                }
                // Add blanking to travel to new position
                const blanking = this.generateBlanking(
                    prevLaserPoint.x, prevLaserPoint.y,
                    laserCoords.x, laserCoords.y
                );
                laserPoints.push(...blanking);
                lastWasBlank = true;
            }

            // Calculate corner angle for dwell points
            let isCorner = false;
            if (i > 0 && i < points.length - 1 && !lastWasBlank) {
                const prev = points[i - 1];
                const next = points[i + 1];
                const angle = Math.abs(
                    Math.atan2(next.y - pt.y, next.x - pt.x) -
                    Math.atan2(pt.y - prev.y, pt.x - prev.x)
                );
                isCorner = angle > Math.PI / 4; // More than 45 degrees
            }

            // Create the point (use per-point color if available, else global color)
            const ptColor = pt.r !== undefined ? pt : color;
            const laserPoint = new HeliosPoint(
                laserCoords.x,
                laserCoords.y,
                Math.round(ptColor.r * pointIntensity / 255),
                Math.round(ptColor.g * pointIntensity / 255),
                Math.round(ptColor.b * pointIntensity / 255),
                Math.round(pointIntensity)
            );

            // After blanking, add turn-on dwell to anchor segment start
            // At corners, add extra dwell for sharpness
            const dwellCount = lastWasBlank ? Math.max(cornerDwell, this.settings.blankingDwell) : (isCorner ? cornerDwell : 1);
            for (let d = 0; d < dwellCount; d++) {
                laserPoints.push(laserPoint);
            }

            prevLaserPoint = laserPoint;
            prevVirtual = pt;
            lastWasBlank = laserPoint.isBlank();
        }

        // Close the frame: anchor last point, then blank back to first point
        if (laserPoints.length > 0 && prevLaserPoint) {
            // Anchor dwell at end of last segment
            for (let d = 0; d < cornerDwell; d++) {
                laserPoints.push(prevLaserPoint);
            }
            const firstPoint = laserPoints[0];
            const blanking = this.generateBlanking(
                prevLaserPoint.x, prevLaserPoint.y,
                firstPoint.x, firstPoint.y
            );
            laserPoints.push(...blanking);
        }

        return laserPoints;
    }

    /**
     * Render the oscilloscope trace to the laser
     * This method matches the signature of canvas renderers
     * @param {Object} params - Rendering parameters
     */
    async renderTrace(params) {
        if (!this.isReady()) {
            if (!this._readyWarned) {
                console.log('[LaserRenderer] Not ready - device:', !!this.device, 'closed:', this.device?.closed, 'enabled:', this.enabled);
                this._readyWarned = true;
            }
            return;
        }
        this._readyWarned = false;

        const { points, speeds, velocityDimming, basePower } = params;
        
        if (!points || points.length < 2) {
            return;
        }

        // If already sending, skip this frame (concurrency guard)
        if (this.isSending) {
            this.framesSkippedThisSecond++;
            return;
        }

        this.isSending = true;
        const now = performance.now();

        try {
            // Check if device is ready for a new frame
            // The Helios DAC loops the current frame until it signals ready for a new one
            const status = await this.device.getStatus();
            if (status !== 1) { // HELIOS_SUCCESS = 1 means ready
                this.framesSkippedThisSecond++;
                this.isSending = false;  // IMPORTANT: reset flag on early return
                return;
            }

            // Resample input points to match target point budget BEFORE
            // converting to laser points. This way convertTraceToLaserPoints
            // adds proper corner dwell and blanking that won't be disturbed.
            const maxPoints = HELIOS.MAX_POINTS;
            const targetFps = this.settings.targetFps || 30;
            const targetPoints = Math.min(Math.floor(this.settings.pps / targetFps), maxPoints);
            this.stats.inputPoints = points.length;

            // Estimate overhead: blanking + dwell per segment adds ~30-50 points
            // Reserve budget for that so drawing points + overhead ≈ targetPoints
            const segments = this._countSegments(points);
            const overheadPerSegment = this.settings.blankingPoints + this.settings.blankingDwell * 2 + this.settings.cornerDwell * 2;
            const estimatedOverhead = segments * overheadPerSegment;
            const drawingBudget = Math.max(20, targetPoints - estimatedOverhead);

            const resampledPoints = this.resampleInputPoints(points, drawingBudget);

            // Convert resampled points to laser points (adds dwell, blanking)
            const laserPoints = this.convertTraceToLaserPoints(resampledPoints, speeds, {
                velocityDimming,
                basePower
            });

            if (laserPoints.length === 0) {
                this.isSending = false;
                return;
            }

            const finalPoints = laserPoints.length > maxPoints
                ? laserPoints.slice(0, maxPoints)
                : laserPoints;

            // Store for statistics
            this.lastFrame = finalPoints;
            this.frameCount++;
            this.stats.pointsPerFrame = finalPoints.length;

            // Send to device
            await this.device.sendFrame(finalPoints, this.settings.pps);
            this.framesSentThisSecond++;
            
            // Log stats every second
            if (now - this.lastStatsTime > 1000) {
                console.log(`[Laser] FPS: ${this.framesSentThisSecond}, skipped: ${this.framesSkippedThisSecond}, points: ${finalPoints.length}`);
                this.framesSentThisSecond = 0;
                this.framesSkippedThisSecond = 0;
                this.lastStatsTime = now;
            }
            
        } catch (error) {
            console.error('[LaserRenderer] Error sending laser frame:', error);
        } finally {
            this.isSending = false;
        }
    }

    /**
     * Count the number of segments in input points (for overhead estimation).
     */
    _countSegments(points) {
        let count = 1;
        for (let i = 1; i < points.length; i++) {
            if (points[i].segmentStart) count++;
            else {
                // Also count jump-detected segments
                const dx = points[i].x - points[i - 1].x;
                const dy = points[i].y - points[i - 1].y;
                if (Math.sqrt(dx * dx + dy * dy) > 0.15) count++;
            }
        }
        return count;
    }

    /**
     * Resample raw input points to a target count.
     * Corner-aware: distributes more points near sharp angles.
     * Operates on input points {x, y, segmentStart, ...} before laser conversion.
     */
    resampleInputPoints(points, targetCount) {
        if (points.length === 0) return points;
        if (points.length === targetCount) return points;

        // Split into continuous segments (by segmentStart or large jumps)
        const segments = [];
        let segStart = 0;
        for (let i = 1; i <= points.length; i++) {
            let isBreak = i === points.length;
            if (!isBreak && points[i].segmentStart) isBreak = true;
            if (!isBreak) {
                const dx = points[i].x - points[i - 1].x;
                const dy = points[i].y - points[i - 1].y;
                if (Math.sqrt(dx * dx + dy * dy) > 0.15) isBreak = true;
            }
            if (isBreak) {
                segments.push({ start: segStart, end: i - 1 });
                segStart = i;
            }
        }

        // Compute weighted length for each segment
        for (const seg of segments) {
            seg.weight = 0;
            for (let i = seg.start; i < seg.end; i++) {
                const dx = points[i + 1].x - points[i].x;
                const dy = points[i + 1].y - points[i].y;
                const edgeLen = Math.sqrt(dx * dx + dy * dy);
                seg.weight += edgeLen;
                // Add corner weight
                seg.weight += this._inputCornerWeight(points, i + 1, seg.start, seg.end);
            }
            seg.weight = Math.max(seg.weight, 0.001);
        }

        const totalWeight = segments.reduce((s, seg) => s + seg.weight, 0);
        const result = [];

        for (const seg of segments) {
            const segLen = seg.end - seg.start + 1;
            const segBudget = Math.max(2, Math.round(targetCount * seg.weight / totalWeight));

            if (segLen <= 2 || segBudget >= segLen) {
                // Keep all points (or too few to resample)
                for (let i = seg.start; i <= seg.end; i++) {
                    const pt = { ...points[i] };
                    if (i === seg.start && result.length > 0) pt.segmentStart = true;
                    result.push(pt);
                }
            } else {
                // Build cumulative weight table for this segment
                const cumWeight = [0];
                for (let i = seg.start; i < seg.end; i++) {
                    const dx = points[i + 1].x - points[i].x;
                    const dy = points[i + 1].y - points[i].y;
                    const edgeLen = Math.sqrt(dx * dx + dy * dy);
                    const cornerW = this._inputCornerWeight(points, i + 1, seg.start, seg.end);
                    cumWeight.push(cumWeight[cumWeight.length - 1] + edgeLen + cornerW);
                }
                const totalW = cumWeight[cumWeight.length - 1];

                if (totalW === 0) {
                    // All points at same position
                    const pt = { ...points[seg.start] };
                    if (result.length > 0) pt.segmentStart = true;
                    result.push(pt);
                    continue;
                }

                const isUpsampling = segBudget > segLen;

                for (let j = 0; j < segBudget; j++) {
                    const targetW = segBudget > 1 ? (j / (segBudget - 1)) * totalW : 0;
                    // Binary search for the edge
                    let lo = 0, hi = cumWeight.length - 2;
                    while (lo < hi) {
                        const mid = (lo + hi) >> 1;
                        if (cumWeight[mid + 1] < targetW) lo = mid + 1;
                        else hi = mid;
                    }

                    let pt;
                    if (isUpsampling) {
                        // Interpolate between source points
                        const edgeW = cumWeight[lo + 1] - cumWeight[lo];
                        const frac = edgeW > 0 ? (targetW - cumWeight[lo]) / edgeW : 0;
                        const a = points[seg.start + lo];
                        const b = points[Math.min(seg.start + lo + 1, seg.end)];
                        pt = {
                            x: a.x + (b.x - a.x) * frac,
                            y: a.y + (b.y - a.y) * frac,
                        };
                        // Preserve per-point color from nearest source
                        if (a.r !== undefined) {
                            pt.r = Math.round(a.r + (b.r - a.r) * frac);
                            pt.g = Math.round(a.g + (b.g - a.g) * frac);
                            pt.b = Math.round(a.b + (b.b - a.b) * frac);
                        }
                    } else {
                        // Downsample: snap to nearest source point
                        const edgeW = cumWeight[lo + 1] - cumWeight[lo];
                        const frac = edgeW > 0 ? (targetW - cumWeight[lo]) / edgeW : 0;
                        const idx = frac < 0.5 ? seg.start + lo : Math.min(seg.start + lo + 1, seg.end);
                        pt = { ...points[idx] };
                    }

                    if (j === 0 && result.length > 0) pt.segmentStart = true;
                    else if (j > 0) pt.segmentStart = false;
                    result.push(pt);
                }
            }
        }
        return result;
    }

    /**
     * Corner weight for raw input points (virtual space coordinates).
     */
    _inputCornerWeight(points, idx, segStart, segEnd) {
        if (idx <= segStart || idx >= segEnd) return 0;
        const prev = points[idx - 1], cur = points[idx], next = points[idx + 1];
        const ax = cur.x - prev.x, ay = cur.y - prev.y;
        const bx = next.x - cur.x, by = next.y - cur.y;
        const magA = Math.sqrt(ax * ax + ay * ay);
        const magB = Math.sqrt(bx * bx + by * by);
        if (magA === 0 || magB === 0) return 0;
        const dot = ax * bx + ay * by;
        const cosAngle = dot / (magA * magB);
        const sharpness = Math.max(0, (1 - cosAngle) / 2);
        const avgEdge = (magA + magB) / 2;
        return sharpness * avgEdge * (this.settings.cornerDwell || 3);
    }

    /**
     * Resample points array to fit within max points.
     * Corner-aware: preserves sharp angle changes by keeping corner points.
     */
    resamplePoints(points, maxPoints) {
        if (points.length <= maxPoints) return points;

        // Build visible/blank segments
        const segments = this._buildSegments(points);
        const blankCount = segments.reduce((s, seg) => s + (seg.blank ? seg.end - seg.start + 1 : 0), 0);
        const visibleBudget = maxPoints - blankCount;
        if (visibleBudget <= 0) return points.slice(0, maxPoints);

        // Compute weights for visible segments (corner points get higher weight)
        const totalWeight = segments.reduce((s, seg) => s + (seg.blank ? 0 : seg.weight), 0);

        const result = [];
        for (const seg of segments) {
            if (seg.blank) {
                for (let i = seg.start; i <= seg.end; i++) result.push(points[i]);
            } else {
                const segBudget = Math.max(2, Math.round(visibleBudget * seg.weight / totalWeight));
                const srcLen = seg.end - seg.start;
                if (srcLen <= 0 || segBudget >= seg.end - seg.start + 1) {
                    // Keep all points
                    for (let i = seg.start; i <= seg.end; i++) result.push(points[i]);
                } else {
                    // Subsample using arc-length parameterization weighted by corners
                    const subsampled = this._weightedResample(points, seg, segBudget);
                    result.push(...subsampled);
                }
            }
        }
        return result;
    }

    /**
     * Interpolate laser points to reach a target count.
     * Corner-aware: distributes more points near sharp angle changes
     * so galvos slow down at corners for sharper geometry.
     */
    interpolatePoints(points, targetCount) {
        if (points.length >= targetCount || points.length < 2) return points;

        // Build visible/blank segments with corner weights
        const segments = this._buildSegments(points);
        const blankCount = segments.reduce((s, seg) => s + (seg.blank ? seg.end - seg.start + 1 : 0), 0);
        const budget = targetCount - blankCount;
        if (budget <= 0) return points;

        const totalWeight = segments.reduce((s, seg) => s + (seg.blank ? 0 : seg.weight), 0);
        if (totalWeight === 0) return points;

        const result = [];
        for (const seg of segments) {
            if (seg.blank) {
                for (let i = seg.start; i <= seg.end; i++) result.push(points[i]);
            } else {
                const segBudget = Math.max(seg.end - seg.start + 1, Math.round(budget * seg.weight / totalWeight));
                const srcLen = seg.end - seg.start;
                if (srcLen <= 0) {
                    result.push(points[seg.start]);
                    continue;
                }

                // Build arc-length table with corner dwell weights
                const cumWeight = [0];
                for (let i = seg.start; i < seg.end; i++) {
                    const a = points[i], b = points[i + 1];
                    const dx = b.x - a.x, dy = b.y - a.y;
                    const edgeLen = Math.sqrt(dx * dx + dy * dy);
                    // Add extra weight at corners (angle change at point i+1)
                    const cornerWeight = this._cornerWeight(points, i + 1, seg.start, seg.end);
                    cumWeight.push(cumWeight[cumWeight.length - 1] + edgeLen + cornerWeight);
                }
                const totalW = cumWeight[cumWeight.length - 1];
                if (totalW === 0) {
                    // All points at same position — just duplicate
                    for (let j = 0; j < segBudget; j++) result.push(points[seg.start]);
                    continue;
                }

                // Distribute points uniformly in weighted arc-length space
                for (let j = 0; j < segBudget; j++) {
                    const targetW = (j / (segBudget - 1)) * totalW;
                    // Binary search for the edge
                    let lo = 0, hi = cumWeight.length - 2;
                    while (lo < hi) {
                        const mid = (lo + hi) >> 1;
                        if (cumWeight[mid + 1] < targetW) lo = mid + 1;
                        else hi = mid;
                    }
                    const edgeW = cumWeight[lo + 1] - cumWeight[lo];
                    const frac = edgeW > 0 ? (targetW - cumWeight[lo]) / edgeW : 0;
                    const a = points[seg.start + lo];
                    const b = points[Math.min(seg.start + lo + 1, seg.end)];
                    result.push(new HeliosPoint(
                        a.x + (b.x - a.x) * frac,
                        a.y + (b.y - a.y) * frac,
                        a.r + (b.r - a.r) * frac,
                        a.g + (b.g - a.g) * frac,
                        a.b + (b.b - a.b) * frac,
                        a.i + (b.i - a.i) * frac
                    ));
                }
            }
        }
        return result;
    }

    /**
     * Build segments (runs of visible/blank points) with corner-weighted lengths.
     */
    _buildSegments(points) {
        const segments = [];
        let segStart = 0;
        for (let i = 1; i <= points.length; i++) {
            if (i === points.length || points[i].isBlank() !== points[segStart].isBlank()) {
                segments.push({ start: segStart, end: i - 1, blank: points[segStart].isBlank() });
                segStart = i;
            }
        }

        // Compute weighted length for each visible segment
        for (const seg of segments) {
            seg.weight = 0;
            if (!seg.blank) {
                for (let i = seg.start; i < seg.end; i++) {
                    const a = points[i], b = points[i + 1];
                    const dx = b.x - a.x, dy = b.y - a.y;
                    seg.weight += Math.sqrt(dx * dx + dy * dy);
                    seg.weight += this._cornerWeight(points, i + 1, seg.start, seg.end);
                }
                // Ensure minimum weight so tiny segments still get some budget
                seg.weight = Math.max(seg.weight, 1);
            }
        }
        return segments;
    }

    /**
     * Compute extra weight for a corner at point index idx.
     * Returns 0 for straight lines, up to ~cornerDwell * avgEdgeLen for sharp corners.
     */
    _cornerWeight(points, idx, segStart, segEnd) {
        if (idx <= segStart || idx >= segEnd) return 0;
        const prev = points[idx - 1], cur = points[idx], next = points[idx + 1];
        const ax = cur.x - prev.x, ay = cur.y - prev.y;
        const bx = next.x - cur.x, by = next.y - cur.y;
        const magA = Math.sqrt(ax * ax + ay * ay);
        const magB = Math.sqrt(bx * bx + by * by);
        if (magA === 0 || magB === 0) return 0;

        // Dot product gives cos(angle), cross product gives sin(angle)
        const dot = ax * bx + ay * by;
        const cosAngle = dot / (magA * magB);
        // sharpness: 0 = straight, 1 = 180° reversal
        const sharpness = Math.max(0, (1 - cosAngle) / 2);

        // Extra weight proportional to sharpness and local edge length
        // cornerDwell controls how much extra dwell corners get
        const avgEdge = (magA + magB) / 2;
        return sharpness * avgEdge * (this.settings.cornerDwell || 3);
    }

    /**
     * Weighted resample for downsampling: preserves corners.
     */
    _weightedResample(points, seg, budget) {
        const srcLen = seg.end - seg.start;
        // Build cumulative weight table (same as interpolation)
        const cumWeight = [0];
        for (let i = seg.start; i < seg.end; i++) {
            const a = points[i], b = points[i + 1];
            const dx = b.x - a.x, dy = b.y - a.y;
            const edgeLen = Math.sqrt(dx * dx + dy * dy);
            const cornerW = this._cornerWeight(points, i + 1, seg.start, seg.end);
            cumWeight.push(cumWeight[cumWeight.length - 1] + edgeLen + cornerW);
        }
        const totalW = cumWeight[cumWeight.length - 1];
        if (totalW === 0) return [points[seg.start]];

        const result = [];
        for (let j = 0; j < budget; j++) {
            const targetW = (j / (budget - 1)) * totalW;
            let lo = 0, hi = cumWeight.length - 2;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (cumWeight[mid + 1] < targetW) lo = mid + 1;
                else hi = mid;
            }
            // Snap to nearest source point (no interpolation for downsampling)
            const edgeW = cumWeight[lo + 1] - cumWeight[lo];
            const frac = edgeW > 0 ? (targetW - cumWeight[lo]) / edgeW : 0;
            const idx = frac < 0.5 ? seg.start + lo : Math.min(seg.start + lo + 1, seg.end);
            result.push(points[idx]);
        }
        return result;
    }

    /**
     * Generate a test pattern for calibration
     * Returns points for a rectangle with corner markers
     */
    generateTestPattern() {
        const points = [];

        // Helper: add a line of virtual-space points
        const addLine = (x1, y1, x2, y2, r, g, b, steps, segmentStart = false) => {
            for (let s = 0; s <= steps; s++) {
                const t = s / steps;
                points.push({
                    x: x1 + (x2 - x1) * t,
                    y: y1 + (y2 - y1) * t,
                    r, g, b,
                    segmentStart: s === 0 && segmentStart
                });
            }
        };

        // --- Green square ---
        const border = 0.9;
        const corners = [
            [-border, -border], [border, -border],
            [border, border], [-border, border]
        ];
        for (let c = 0; c < 4; c++) {
            const [x1, y1] = corners[c];
            const [x2, y2] = corners[(c + 1) % 4];
            addLine(x1, y1, x2, y2, 0, 255, 0, 50, c === 0);
        }

        // --- Red circle ---
        const radius = 0.6;
        const circleSteps = 100;
        for (let s = 0; s <= circleSteps; s++) {
            const angle = (s / circleSteps) * Math.PI * 2;
            points.push({
                x: radius * Math.cos(angle),
                y: radius * Math.sin(angle),
                r: 255, g: 0, b: 0,
                segmentStart: s === 0
            });
        }

        // --- Blue cross (two separate segments) ---
        const crossSize = 0.4;
        addLine(-crossSize, 0, crossSize, 0, 0, 0, 255, 30, true);
        addLine(0, -crossSize, 0, crossSize, 0, 0, 255, 30, true);

        return points;
    }

    /**
     * Clear the laser output (send blank frame)
     * Call this when oscilloscope is powered off
     */
    async clear() {
        if (!this.device || this.device.closed) {
            return;
        }

        console.log('[LaserRenderer] Clearing laser output...');

        // Wait for any in-progress send to complete
        while (this.isSending) {
            await new Promise(resolve => setTimeout(resolve, 5));
        }

        try {
            // Wait for device to be ready (up to 500ms)
            let ready = false;
            for (let i = 0; i < 25 && !ready; i++) {
                const status = await this.device.getStatus();
                if (status === 1) {
                    ready = true;
                } else {
                    await new Promise(resolve => setTimeout(resolve, 20));
                }
            }

            if (!ready) {
                console.warn('[LaserRenderer] Device not ready for clear, sending anyway');
            }

            // Send a blank frame to clear the display
            const blankPoints = [];
            for (let i = 0; i < 100; i++) {
                blankPoints.push(HeliosPoint.blank(2048, 2048)); // Center, blanked
            }
            await this.device.sendFrame(blankPoints, this.settings.pps);
            console.log('[LaserRenderer] Cleared laser output');
        } catch (error) {
            console.error('[LaserRenderer] Error clearing laser:', error);
        }
    }

    /**
     * Display the test pattern for calibration
     */
    async showTestPattern() {
        if (!this.isReady()) return;
        if (this.isSending) return;
        
        this.isSending = true;
        try {
            const status = await this.device.getStatus();
            if (status !== 1) {
                this.isSending = false;
                return;
            }
            const points = this.generateTestPattern();
            const laserPoints = this.convertTraceToLaserPoints(points, null, {
                velocityDimming: 0,
                basePower: 1.0
            });
            if (laserPoints.length === 0) {
                this.isSending = false;
                return;
            }
            const maxPoints = HELIOS.MAX_POINTS;
            const finalPoints = laserPoints.length > maxPoints
                ? this.resamplePoints(laserPoints, maxPoints)
                : laserPoints;
            await this.device.sendFrame(finalPoints, this.settings.pps);
        } catch (error) {
            console.error('[LaserRenderer] Error sending test pattern:', error);
        } finally {
            this.isSending = false;
        }
    }

    /**
     * Destroy the renderer
     */
    async destroy() {
        await this.disconnect();
    }

    /**
     * Get the renderer name
     */
    getName() {
        return 'laser';
    }
}

// Export singleton instance and classes
export default LaserRenderer;

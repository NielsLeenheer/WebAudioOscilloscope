/**
 * SVG Sampler Utility
 * Handles SVG DOM creation and continuous path sampling for oscilloscope visualization
 */

/**
 * Normalize points to -1 to 1 range for oscilloscope coordinates
 * @param {Array<[number, number]>} points - Raw points as [x, y] pairs
 * @param {Object} bbox - Bounding box with x, y, width, height
 * @returns {Array<[number, number]>} Normalized points
 */
export function normalizePoints(points, bbox) {
    const centerX = bbox.x + bbox.width / 2;
    const centerY = bbox.y + bbox.height / 2;
    const scale = Math.max(bbox.width, bbox.height);

    // Normalize to -1 to 1 range
    return points.map(([x, y]) => [
        ((x - centerX) / scale) * 2,
        -((y - centerY) / scale) * 2  // Flip Y for oscilloscope coordinates
    ]);
}

/**
 * Extract raw points and bbox from SVG path data
 * @param {string} pathData - SVG path data string
 * @param {number} numSamples - Number of points to sample
 * @returns {Object} Object with points and bbox
 */
export function extractPathPoints(pathData, numSamples = 200) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

    path.setAttribute('d', pathData);
    svg.appendChild(path);

    const totalLength = path.getTotalLength();
    const points = [];

    for (let i = 0; i < numSamples; i++) {
        const distance = (i / numSamples) * totalLength;
        const point = path.getPointAtLength(distance);
        points.push([point.x, point.y]);
    }

    // Calculate bbox
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    points.forEach(([x, y]) => {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
    });

    const bbox = {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
    };

    return { points, bbox };
}

/**
 * Extract points from an SVG element using browser APIs
 * @param {SVGGeometryElement} element - SVG element to extract points from
 * @param {number} samples - Number of samples to take
 * @returns {Array<[number, number]>} Array of points
 */
export function extractPointsFromElement(element, samples) {
    const points = [];

    // Check if element is an SVGGeometryElement (has getTotalLength)
    if (typeof element.getTotalLength === 'function') {
        try {
            const totalLength = element.getTotalLength();

            // Get the SVG root
            const svg = element.ownerSVGElement;

            // Get transformation matrix - use getScreenCTM for CSS transforms
            let matrix = null;
            if (svg) {
                // getScreenCTM includes CSS transforms, getCTM does not in some browsers
                const elementCTM = element.getScreenCTM();
                const svgCTM = svg.getScreenCTM();

                if (elementCTM && svgCTM) {
                    // Calculate element transform relative to SVG by removing SVG's screen transform
                    // matrix = elementCTM × inverse(svgCTM)
                    const svgCTMInverse = svgCTM.inverse();
                    matrix = elementCTM.multiply(svgCTMInverse);
                }
            }

            for (let i = 0; i <= samples; i++) {
                const distance = (i / samples) * totalLength;
                const point = element.getPointAtLength(distance);

                // Apply transformation matrix if available
                if (matrix && svg) {
                    const svgPoint = svg.createSVGPoint();
                    svgPoint.x = point.x;
                    svgPoint.y = point.y;
                    const transformedPoint = svgPoint.matrixTransform(matrix);
                    points.push([transformedPoint.x, transformedPoint.y]);
                } else {
                    points.push([point.x, point.y]);
                }
            }
        } catch (error) {
            // Skip elements that can't be sampled (e.g., display:none, inside <defs>, etc.)
            console.warn('Could not extract points from element:', error.message);
        }
    }

    return points;
}

/**
 * Parse full SVG markup and extract all paths (static, no animation)
 * @param {string} markup - Full SVG markup string
 * @param {number} samples - Number of samples per element
 * @param {HTMLElement} container - Container element for rendering SVG
 * @returns {Array<[number, number]>} Normalized points
 */
export function parseSVGMarkupStatic(markup, samples, container) {
    if (!container) {
        throw new Error('Container element is required');
    }

    // Clear container and inject SVG
    container.innerHTML = markup;

    const svgElement = container.querySelector('svg');
    if (!svgElement) {
        throw new Error('No <svg> element found in markup');
    }

    // Normalize SVG dimensions to match viewBox to avoid scaling issues with transform-origin
    const viewBox = svgElement.getAttribute('viewBox');
    if (viewBox) {
        const [, , vbWidth, vbHeight] = viewBox.split(/\s+/).map(Number);
        if (vbWidth && vbHeight) {
            svgElement.setAttribute('width', vbWidth);
            svgElement.setAttribute('height', vbHeight);
        }
    }

    // Get all drawable elements
    const elements = svgElement.querySelectorAll('path, circle, ellipse, rect, polygon, polyline, line');

    if (elements.length === 0) {
        throw new Error('No drawable shapes found in SVG');
    }

    // Extract points from all elements and combine
    let allPoints = [];
    elements.forEach((element) => {
        const elementPoints = extractPointsFromElement(element, Math.floor(samples / elements.length));
        if (elementPoints.length > 0) {
            allPoints = allPoints.concat(elementPoints);
        }
    });

    if (allPoints.length === 0) {
        throw new Error('Could not extract points from SVG');
    }

    // Get bounding box to normalize coordinates
    const bbox = svgElement.getBBox();

    // Normalize points for preview and audio engine
    return normalizePoints(allPoints, bbox);
}

/**
 * Sample current frame from live animations
 * @param {SVGSVGElement} svgElement - SVG root element
 * @param {NodeList} elements - List of drawable elements
 * @param {number} samples - Number of samples per element
 * @returns {Array<[number, number]>} Raw points from current frame
 */
export function sampleCurrentFrame(svgElement, elements, samples) {
    // Force style recalculation to get current animated state
    svgElement.getBoundingClientRect();

    // Extract points from all elements at current animation state
    let framePoints = [];
    elements.forEach((element) => {
        const elementPoints = extractPointsFromElement(element, Math.floor(samples / elements.length));
        if (elementPoints.length > 0) {
            framePoints = framePoints.concat(elementPoints);
        }
    });

    return framePoints;
}

/**
 * Create a continuous sampler for animated SVGs
 * @param {string} markup - Full SVG markup string
 * @param {number} samples - Number of samples per frame
 * @param {HTMLElement} container - Container element for rendering SVG
 * @param {number} fps - Frames per second for sampling
 * @param {Function} onFrame - Callback function called with normalized points each frame
 * @param {Function} isPlayingGetter - Function that returns whether playback is active
 * @returns {Object} Sampler object with stop() method
 */
export function createContinuousSampler(markup, samples, container, fps, onFrame, isPlayingGetter) {
    if (!container) {
        throw new Error('Container element is required');
    }

    // Setup SVG
    container.innerHTML = markup;
    const svgElement = container.querySelector('svg');
    if (!svgElement) {
        throw new Error('No <svg> element found in markup');
    }

    // Normalize SVG dimensions to match viewBox to avoid scaling issues with transform-origin
    const viewBox = svgElement.getAttribute('viewBox');
    if (viewBox) {
        const [, , vbWidth, vbHeight] = viewBox.split(/\s+/).map(Number);
        if (vbWidth && vbHeight) {
            svgElement.setAttribute('width', vbWidth);
            svgElement.setAttribute('height', vbHeight);
        }
    }

    const elements = svgElement.querySelectorAll('path, circle, ellipse, rect, polygon, polyline, line');
    if (elements.length === 0) {
        throw new Error('No drawable shapes found in SVG');
    }

    // Get bounding box for normalization
    const bbox = svgElement.getBBox();

    const frameDuration = 1000 / fps;
    let samplingInterval = null;

    // Sample continuously at specified FPS
    samplingInterval = setInterval(() => {
        if (!isPlayingGetter()) {
            if (samplingInterval) {
                clearInterval(samplingInterval);
                samplingInterval = null;
            }
            return;
        }

        try {
            const framePoints = sampleCurrentFrame(svgElement, elements, samples);

            if (framePoints.length === 0) return;

            // Normalize points for preview and audio engine
            const normalized = normalizePoints(framePoints, bbox);

            // Call the callback with normalized points
            onFrame(normalized);
        } catch (error) {
            console.error('Error sampling animation frame:', error);
        }
    }, frameDuration);

    // Return sampler object with stop method
    return {
        stop: () => {
            if (samplingInterval) {
                clearInterval(samplingInterval);
                samplingInterval = null;
            }
        }
    };
}

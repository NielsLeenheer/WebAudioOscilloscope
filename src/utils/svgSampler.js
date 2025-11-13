/**
 * SVG Sampler Utility
 * Handles SVG DOM creation and continuous path sampling for oscilloscope visualization
 */

import { svgPathProperties } from 'svg-path-properties';

// Singleton container for SVG rendering
let svgContainer = null;

/**
 * Get or create the hidden SVG container element
 * @returns {HTMLElement} Container element
 */
function getContainer() {
    if (!svgContainer) {
        svgContainer = document.createElement('div');
        svgContainer.style.position = 'fixed';
        svgContainer.style.left = '0';
        svgContainer.style.top = '0';
        svgContainer.style.width = '500px';
        svgContainer.style.height = '500px';
        svgContainer.style.opacity = '0';
        svgContainer.style.pointerEvents = 'none';
        svgContainer.style.zIndex = '-9999';
        document.body.appendChild(svgContainer);
    }
    return svgContainer;
}

/**
 * Split SVG path data into segments based on M/m (moveto) commands
 * @param {string} pathData - SVG path data string
 * @returns {Array<string>} Array of path segment strings
 */
function splitPathIntoSegments(pathData) {
    // Split on M or m commands, keeping the command
    const segments = pathData.split(/(?=[Mm])/).filter(s => s.trim());

    if (segments.length === 0) return [pathData];

    return segments;
}

/**
 * Sample points from a path segment using svg-path-properties
 * @param {string} pathData - SVG path segment data
 * @param {number} numSamples - Number of points to sample
 * @returns {Array<[number, number]>} Array of [x, y] points
 */
function samplePathSegment(pathData, numSamples) {
    try {
        const properties = svgPathProperties(pathData);
        const length = properties.getTotalLength();

        if (!isFinite(length) || length === 0) {
            console.warn('Path segment has zero or invalid length:', pathData.substring(0, 50) + '...');
            return [];
        }

        const points = [];
        for (let i = 0; i < numSamples; i++) {
            const distance = (i / numSamples) * length;
            const point = properties.getPointAtLength(distance);
            points.push([point.x, point.y]);
        }

        return points;
    } catch (error) {
        console.error('Error sampling path segment:', error.message, '\nPath:', pathData.substring(0, 100) + '...');
        return [];
    }
}

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
 * Extract raw segments and bbox from SVG path data
 * @param {string} pathData - SVG path data string
 * @param {number} numSamples - Number of points to sample
 * @returns {Object} Object with segments and bbox
 */
export function extractPathPoints(pathData, numSamples = 200) {
    // Split path into segments
    const pathSegments = splitPathIntoSegments(pathData);
    const segments = [];

    // Sample each segment
    pathSegments.forEach(segmentData => {
        const segmentPoints = samplePathSegment(segmentData, Math.floor(numSamples / pathSegments.length));
        if (segmentPoints.length > 0) {
            segments.push(segmentPoints);
        }
    });

    if (segments.length === 0) {
        throw new Error('No valid segments could be extracted from path');
    }

    // Calculate bbox across all segments
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    segments.forEach(segment => {
        segment.forEach(([x, y]) => {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        });
    });

    // Validate bbox
    if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) {
        throw new Error('Invalid bounding box calculated from path');
    }

    const bbox = {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
    };

    return { segments, bbox };
}

/**
 * Extract points from an SVG element using browser APIs
 * Detects segments within path elements based on M/m commands
 * @param {SVGGeometryElement} element - SVG element to extract points from
 * @param {number} samples - Number of samples to take
 * @returns {Array<Array<[number, number]>>} Array of segments, each containing points
 */
export function extractPointsFromElement(element, samples) {
    const segments = [];

    // Check if element is an SVGGeometryElement (has getTotalLength)
    if (typeof element.getTotalLength === 'function') {
        try {
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

            // For path elements, try to detect segments
            if (element.tagName.toLowerCase() === 'path') {
                const pathData = element.getAttribute('d');
                if (pathData) {
                    const pathSegments = splitPathIntoSegments(pathData);

                    // Sample each segment separately
                    pathSegments.forEach(segmentData => {
                        const segmentPoints = samplePathSegment(segmentData, Math.floor(samples / pathSegments.length));

                        // Apply transformation matrix to all points in this segment
                        if (matrix && svg) {
                            const transformedPoints = segmentPoints.map(([x, y]) => {
                                const svgPoint = svg.createSVGPoint();
                                svgPoint.x = x;
                                svgPoint.y = y;
                                const transformed = svgPoint.matrixTransform(matrix);
                                return [transformed.x, transformed.y];
                            });
                            if (transformedPoints.length > 0) {
                                segments.push(transformedPoints);
                            }
                        } else {
                            if (segmentPoints.length > 0) {
                                segments.push(segmentPoints);
                            }
                        }
                    });
                }
            } else {
                // For non-path elements (circle, rect, etc.), treat as single segment
                const points = [];
                const totalLength = element.getTotalLength();

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

                if (points.length > 0) {
                    segments.push(points);
                }
            }
        } catch (error) {
            // Skip elements that can't be sampled (e.g., display:none, inside <defs>, etc.)
            console.warn('Could not extract points from element:', error.message);
        }
    }

    return segments;
}

/**
 * Parse full SVG markup and extract all paths (static, no animation)
 * @param {string} markup - Full SVG markup string
 * @param {number} samples - Number of samples per element
 * @returns {Array<Array<[number, number]>>} Array of normalized segments
 */
export function parseSVGMarkupStatic(markup, samples) {
    // Get or create the container
    const container = getContainer();

    // Clean up markup - remove XML declarations which can cause issues
    let cleanedMarkup = markup.trim();
    if (cleanedMarkup.startsWith('<?xml')) {
        cleanedMarkup = cleanedMarkup.replace(/<\?xml[^?]*\?>\s*/i, '');
    }

    // Clear container and inject SVG
    container.innerHTML = cleanedMarkup;

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

    // Extract segments from all elements
    let allSegments = [];
    elements.forEach((element) => {
        const elementSegments = extractPointsFromElement(element, Math.floor(samples / elements.length));
        if (elementSegments.length > 0) {
            allSegments = allSegments.concat(elementSegments);
        }
    });

    if (allSegments.length === 0) {
        throw new Error('Could not extract points from SVG');
    }

    // Get bounding box to normalize coordinates
    let bbox;
    try {
        bbox = svgElement.getBBox();
    } catch (error) {
        throw new Error(`Could not get bounding box from SVG: ${error.message}`);
    }

    // Validate bbox
    if (!bbox || !isFinite(bbox.width) || !isFinite(bbox.height) || bbox.width === 0 || bbox.height === 0) {
        throw new Error('Invalid bounding box from SVG');
    }

    // Normalize all segments together using the same bounding box
    const normalizedSegments = allSegments.map(segment =>
        normalizePoints(segment, bbox)
    );

    return normalizedSegments;
}

/**
 * Sample current frame from live animations
 * @param {SVGSVGElement} svgElement - SVG root element
 * @param {NodeList} elements - List of drawable elements
 * @param {number} samples - Number of samples per element
 * @returns {Array<Array<[number, number]>>} Array of segments from current frame
 */
export function sampleCurrentFrame(svgElement, elements, samples) {
    // Force style recalculation to get current animated state
    svgElement.getBoundingClientRect();

    // Extract segments from all elements at current animation state
    let frameSegments = [];
    elements.forEach((element) => {
        const elementSegments = extractPointsFromElement(element, Math.floor(samples / elements.length));
        if (elementSegments.length > 0) {
            frameSegments = frameSegments.concat(elementSegments);
        }
    });

    return frameSegments;
}

/**
 * Create a continuous sampler for animated SVGs
 * @param {string} markup - Full SVG markup string
 * @param {number} samples - Number of samples per frame
 * @param {number} fps - Frames per second for sampling
 * @param {Function} onFrame - Callback function called with normalized points each frame
 * @param {Function} isPlayingGetter - Function that returns whether playback is active
 * @returns {Object} Sampler object with stop() method
 */
export function createContinuousSampler(markup, samples, fps, onFrame, isPlayingGetter) {
    // Get or create the container
    const container = getContainer();

    // Clean up markup - remove XML declarations which can cause issues
    let cleanedMarkup = markup.trim();
    if (cleanedMarkup.startsWith('<?xml')) {
        cleanedMarkup = cleanedMarkup.replace(/<\?xml[^?]*\?>\s*/i, '');
    }

    // Setup SVG
    container.innerHTML = cleanedMarkup;
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
            const frameSegments = sampleCurrentFrame(svgElement, elements, samples);

            if (frameSegments.length === 0) return;

            // Normalize all segments together using the same bounding box
            const normalizedSegments = frameSegments.map(segment =>
                normalizePoints(segment, bbox)
            );

            // Call the callback with normalized segments
            onFrame(normalizedSegments);
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

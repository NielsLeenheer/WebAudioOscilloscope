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
        const properties = new svgPathProperties(pathData);
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
 * Calculate distance between two points
 * @param {[number, number]} p1 - First point
 * @param {[number, number]} p2 - Second point
 * @returns {number} Euclidean distance
 */
function distance(p1, p2) {
    const dx = p1[0] - p2[0];
    const dy = p1[1] - p2[1];
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Optimize segment order to minimize jump distances
 * Uses greedy nearest-neighbor algorithm starting from center
 * @param {Array<Array<[number, number]>>} segments - Array of segments
 * @param {boolean} startFromCenter - If true, start with segment closest to (0,0)
 * @returns {Array<Array<[number, number]>>} Reordered segments
 */
function optimizeSegmentOrder(segments, startFromCenter = true) {
    if (segments.length <= 1) return segments;

    const ordered = [];
    const remaining = [...segments];

    // Find the segment closest to center (0, 0) if requested
    let startIndex = 0;
    if (startFromCenter) {
        let minDistToCenter = Infinity;
        remaining.forEach((segment, index) => {
            const segStart = segment[0];
            const segEnd = segment[segment.length - 1];

            // Check both start and end of segment
            const distStartToCenter = distance(segStart, [0, 0]);
            const distEndToCenter = distance(segEnd, [0, 0]);

            const minDist = Math.min(distStartToCenter, distEndToCenter);
            if (minDist < minDistToCenter) {
                minDistToCenter = minDist;
                startIndex = index;
            }
        });
    }

    // Start with the chosen segment
    let current = remaining.splice(startIndex, 1)[0];
    ordered.push(current);

    // Greedily add the closest segment
    while (remaining.length > 0) {
        const currentEnd = current[current.length - 1];
        let minDist = Infinity;
        let minIndex = -1;
        let shouldReverse = false;

        // Find the closest segment (considering both orientations)
        remaining.forEach((segment, index) => {
            const segStart = segment[0];
            const segEnd = segment[segment.length - 1];

            // Distance to segment start
            const distToStart = distance(currentEnd, segStart);
            if (distToStart < minDist) {
                minDist = distToStart;
                minIndex = index;
                shouldReverse = false;
            }

            // Distance to segment end (would need to reverse segment)
            const distToEnd = distance(currentEnd, segEnd);
            if (distToEnd < minDist) {
                minDist = distToEnd;
                minIndex = index;
                shouldReverse = true;
            }
        });

        // Add the closest segment
        if (minIndex !== -1) {
            let nextSegment = remaining.splice(minIndex, 1)[0];

            // Reverse if needed
            if (shouldReverse) {
                nextSegment = [...nextSegment].reverse();
            }

            ordered.push(nextSegment);
            current = nextSegment;
        }
    }

    return ordered;
}

/**
 * Double draw segments - draw forward then backward
 * This makes the beam return to the starting point of each segment
 * @param {Array<Array<[number, number]>>} segments - Array of segments
 * @returns {Array<Array<[number, number]>>} Segments with doubled paths
 */
function doubleDrawSegments(segments) {
    return segments.map(segment => {
        if (segment.length === 0) return segment;

        // Create reversed copy (excluding the last point to avoid duplication)
        const reversed = [...segment].reverse().slice(1);

        // Concatenate forward + backward
        return [...segment, ...reversed];
    });
}

/**
 * Extract raw segments and bbox from SVG path data
 * @param {string} pathData - SVG path data string
 * @param {number} numSamples - Number of points to sample
 * @param {boolean} optimize - If true, optimize segment order
 * @param {boolean} doubleDraw - If true, draw each segment forward and back
 * @returns {Object} Object with segments and bbox
 */
export function extractPathPoints(pathData, numSamples = 200, optimize = true, doubleDraw = true) {
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

    // Apply optimizations
    let processedSegments = segments;

    if (optimize) {
        processedSegments = optimizeSegmentOrder(processedSegments, true);
    }

    if (doubleDraw) {
        processedSegments = doubleDrawSegments(processedSegments);
    }

    // Calculate bbox across all segments
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    processedSegments.forEach(segment => {
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

    return { segments: processedSegments, bbox };
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
 * @param {boolean} optimize - If true, optimize segment order
 * @param {boolean} doubleDraw - If true, draw each segment forward and back
 * @returns {Array<Array<[number, number]>>} Array of normalized segments
 */
export function parseSVGMarkupStatic(markup, samples, optimize = true, doubleDraw = true) {
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

    // Apply optimizations
    let processedSegments = allSegments;

    if (optimize) {
        processedSegments = optimizeSegmentOrder(processedSegments, true);
    }

    if (doubleDraw) {
        processedSegments = doubleDrawSegments(processedSegments);
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
    const normalizedSegments = processedSegments.map(segment =>
        normalizePoints(segment, bbox)
    );

    return normalizedSegments;
}

/**
 * Sample current frame from live animations
 * @param {SVGSVGElement} svgElement - SVG root element
 * @param {NodeList} elements - List of drawable elements
 * @param {number} samples - Number of samples per element
 * @param {boolean} optimize - If true, optimize segment order
 * @param {boolean} doubleDraw - If true, draw each segment forward and back
 * @returns {Array<Array<[number, number]>>} Array of segments from current frame
 */
export function sampleCurrentFrame(svgElement, elements, samples, optimize = true, doubleDraw = true) {
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

    // Apply optimizations
    let processedSegments = frameSegments;

    if (optimize) {
        processedSegments = optimizeSegmentOrder(processedSegments, true);
    }

    if (doubleDraw) {
        processedSegments = doubleDrawSegments(processedSegments);
    }

    return processedSegments;
}

/**
 * Create a continuous sampler for animated SVGs
 * @param {string} markup - Full SVG markup string
 * @param {number} samples - Number of samples per frame
 * @param {number} fps - Frames per second for sampling
 * @param {Function} onFrame - Callback function called with normalized points each frame
 * @param {Function} isPlayingGetter - Function that returns whether playback is active
 * @param {boolean} optimize - If true, optimize segment order
 * @param {boolean} doubleDraw - If true, draw each segment forward and back
 * @returns {Object} Sampler object with stop() method
 */
export function createContinuousSampler(markup, samples, fps, onFrame, isPlayingGetter, optimize = true, doubleDraw = true) {
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
            const frameSegments = sampleCurrentFrame(svgElement, elements, samples, optimize, doubleDraw);

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

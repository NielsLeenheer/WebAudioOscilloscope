import { getCharStrokes, getCharWidth, getCharHeight } from './vectorFont.js';

// Default settings
const DEFAULT_CHAR_SPACING = 0.2; // Space between characters (normalized units scaled by size)
const DEFAULT_POINT_DENSITY = 50; // Points per unit length (in normalized coordinates)

/**
 * Calculate the length of a stroke (sum of segment lengths)
 * @param {Array<[number, number]>} stroke - Array of points defining the stroke
 * @param {number} scaleX - X scale factor
 * @param {number} scaleY - Y scale factor
 * @returns {number} Total length of the stroke
 */
function calculateStrokeLength(stroke, scaleX, scaleY) {
    let length = 0;
    for (let i = 0; i < stroke.length - 1; i++) {
        const [x1, y1] = stroke[i];
        const [x2, y2] = stroke[i + 1];
        const dx = (x2 - x1) * scaleX;
        const dy = (y2 - y1) * scaleY;
        length += Math.sqrt(dx * dx + dy * dy);
    }
    return length;
}

/**
 * Generate points for a single character at a given position
 * Points are distributed at uniform distances along each stroke for consistent brightness
 * @param {string} char - The character to render
 * @param {number} x - X position (left edge of character)
 * @param {number} y - Y position (baseline)
 * @param {number} scale - Scale factor for the character
 * @param {number} pointDensity - Points per unit length
 * @returns {Array<Array<[number, number]>>} Array of strokes, each stroke is array of points
 */
function generateCharPoints(char, x, y, scale, pointDensity = DEFAULT_POINT_DENSITY) {
    const strokes = getCharStrokes(char);
    const charHeight = getCharHeight();
    const charWidth = getCharWidth(char);
    const scaleX = scale * charWidth;
    const scaleY = scale * charHeight;
    const segments = [];

    for (const stroke of strokes) {
        if (stroke.length < 2) continue;

        // Calculate total stroke length to determine number of points
        const strokeLength = calculateStrokeLength(stroke, scaleX, scaleY);
        const numPoints = Math.max(2, Math.ceil(strokeLength * pointDensity));
        const targetSpacing = strokeLength / (numPoints - 1);

        // Build array of segment lengths for the stroke
        const segmentLengths = [];
        let totalLength = 0;
        for (let i = 0; i < stroke.length - 1; i++) {
            const [x1, y1] = stroke[i];
            const [x2, y2] = stroke[i + 1];
            const dx = (x2 - x1) * scaleX;
            const dy = (y2 - y1) * scaleY;
            const len = Math.sqrt(dx * dx + dy * dy);
            segmentLengths.push(len);
            totalLength += len;
        }

        // Sample points at uniform distances along the stroke
        const points = [];
        let currentDist = 0;
        let segmentIndex = 0;
        let segmentStart = 0;

        for (let i = 0; i < numPoints; i++) {
            const targetDist = i * targetSpacing;

            // Find which segment contains this distance
            while (segmentIndex < segmentLengths.length - 1 &&
                   targetDist > segmentStart + segmentLengths[segmentIndex]) {
                segmentStart += segmentLengths[segmentIndex];
                segmentIndex++;
            }

            // Interpolate within the segment
            const segmentLen = segmentLengths[segmentIndex];
            const t = segmentLen > 0 ? (targetDist - segmentStart) / segmentLen : 0;
            const clampedT = Math.max(0, Math.min(1, t));

            const [x1, y1] = stroke[segmentIndex];
            const [x2, y2] = stroke[segmentIndex + 1];

            const px = x + (x1 + (x2 - x1) * clampedT) * scaleX;
            const py = y + (y1 + (y2 - y1) * clampedT) * scaleY;
            points.push([px, py]);
        }

        if (points.length > 0) {
            segments.push(points);
        }
    }

    return segments;
}

/**
 * Calculate the total width of a text string
 * @param {string} text - The text to measure
 * @param {number} scale - Scale factor
 * @param {number} charSpacing - Space between characters
 * @returns {number} Total width of the text
 */
export function measureText(text, scale = 1, charSpacing = DEFAULT_CHAR_SPACING) {
    if (text.length === 0) return 0;
    const spacing = charSpacing * scale;
    let width = 0;
    for (let i = 0; i < text.length; i++) {
        width += getCharWidth(text[i]) * scale;
        if (i < text.length - 1) {
            width += spacing;
        }
    }
    return width;
}

/**
 * Generate points for scrolling text at a given scroll offset
 * @param {string} text - The text to render
 * @param {number} scrollOffset - Current scroll position (0 = text starts at right edge, increases as text scrolls left)
 * @param {Object} options - Rendering options
 * @param {number} options.scale - Character scale (default: 0.3)
 * @param {number} options.charSpacing - Space between characters (default: 0.2)
 * @param {number} options.pointDensity - Points per unit length (default: 50)
 * @param {number} options.viewportWidth - Viewport width in normalized coords (default: 2 for -1 to 1)
 * @param {number} options.yOffset - Vertical offset (default: 0, centered)
 * @returns {Array<Array<[number, number]>>} Array of segments for the visible text
 */
export function generateScrollingText(text, scrollOffset, options = {}) {
    const {
        scale = 0.3,
        charSpacing = DEFAULT_CHAR_SPACING,
        pointDensity = DEFAULT_POINT_DENSITY,
        viewportWidth = 2,
        yOffset = 0
    } = options;

    if (text.length === 0) {
        return [];
    }

    const charHeight = getCharHeight() * scale;
    const spacing = charSpacing * scale;

    // Text starts at right edge (1.0) and scrolls left
    // scrollOffset = 0 means first char starts at right edge
    const startX = 1 - scrollOffset;

    // Calculate vertical centering
    const baseY = yOffset - charHeight / 2;

    const allSegments = [];

    // Calculate visible range
    const viewportLeft = -1;
    const viewportRight = 1;

    // Generate characters
    let cursorX = startX;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const charWidth = getCharWidth(char) * scale;

        // Skip characters completely outside viewport
        if (cursorX + charWidth >= viewportLeft && cursorX <= viewportRight) {
            const charSegments = generateCharPoints(char, cursorX, baseY, scale, pointDensity);

            // Clip segments to viewport
            for (const segment of charSegments) {
                const clippedPoints = [];
                for (const [px, py] of segment) {
                    if (px >= viewportLeft && px <= viewportRight) {
                        clippedPoints.push([px, py]);
                    }
                }
                if (clippedPoints.length >= 2) {
                    allSegments.push(clippedPoints);
                }
            }
        }

        cursorX += charWidth + spacing;
    }

    return allSegments;
}

/**
 * Calculate the total scroll distance for a complete loop
 * Text scrolls from right edge, across viewport, and exits left, then repeats
 * @param {string} text - The text to scroll
 * @param {number} scale - Character scale
 * @param {number} charSpacing - Space between characters
 * @param {number} viewportWidth - Viewport width (default: 2)
 * @returns {number} Total scroll distance for one complete cycle
 */
export function calculateScrollCycle(text, scale = 0.3, charSpacing = DEFAULT_CHAR_SPACING, viewportWidth = 2) {
    const textWidth = measureText(text, scale, charSpacing);
    // Distance: text must travel from right edge (1) to left edge (-1) plus its own width
    return viewportWidth + textWidth;
}

/**
 * Create an animation state object for scrolling text
 * @param {string} text - The text to scroll
 * @param {Object} options - Animation options
 * @param {number} options.speed - Scroll speed (units per second, default: 0.5)
 * @param {number} options.scale - Character scale (default: 0.3)
 * @param {number} options.charSpacing - Space between characters (default: 0.2)
 * @param {number} options.pointDensity - Points per unit length (default: 50)
 * @param {number} options.yOffset - Vertical offset (default: 0)
 * @returns {Object} Animation state with update method
 */
export function createTextScroller(text, options = {}) {
    const {
        speed = 0.5,
        scale = 0.3,
        charSpacing = DEFAULT_CHAR_SPACING,
        pointDensity = DEFAULT_POINT_DENSITY,
        yOffset = 0
    } = options;

    const scrollCycle = calculateScrollCycle(text, scale, charSpacing);

    return {
        text,
        speed,
        scale,
        charSpacing,
        pointDensity,
        yOffset,
        scrollOffset: 0,
        scrollCycle,

        /**
         * Update scroll position
         * @param {number} deltaTime - Time elapsed in seconds
         * @returns {Array<Array<[number, number]>>} Current frame's segments
         */
        update(deltaTime) {
            this.scrollOffset += this.speed * deltaTime;

            // Loop the scroll
            if (this.scrollOffset >= this.scrollCycle) {
                this.scrollOffset = this.scrollOffset % this.scrollCycle;
            }

            return this.getPoints();
        },

        /**
         * Get current frame's points without updating
         * @returns {Array<Array<[number, number]>>} Current frame's segments
         */
        getPoints() {
            return generateScrollingText(this.text, this.scrollOffset, {
                scale: this.scale,
                charSpacing: this.charSpacing,
                pointDensity: this.pointDensity,
                yOffset: this.yOffset
            });
        },

        /**
         * Reset scroll position
         */
        reset() {
            this.scrollOffset = 0;
        },

        /**
         * Update text (recalculates scroll cycle)
         * @param {string} newText - New text to display
         */
        setText(newText) {
            this.text = newText;
            this.scrollCycle = calculateScrollCycle(newText, this.scale, this.charSpacing);
        },

        /**
         * Update options
         * @param {Object} newOptions - New options to apply
         */
        setOptions(newOptions) {
            if (newOptions.speed !== undefined) this.speed = newOptions.speed;
            if (newOptions.scale !== undefined) {
                this.scale = newOptions.scale;
                this.scrollCycle = calculateScrollCycle(this.text, this.scale, this.charSpacing);
            }
            if (newOptions.charSpacing !== undefined) {
                this.charSpacing = newOptions.charSpacing;
                this.scrollCycle = calculateScrollCycle(this.text, this.scale, this.charSpacing);
            }
            if (newOptions.pointDensity !== undefined) this.pointDensity = newOptions.pointDensity;
            if (newOptions.yOffset !== undefined) this.yOffset = newOptions.yOffset;
        }
    };
}

/**
 * Generate static (non-scrolling) text centered in the viewport
 * @param {string} text - The text to render
 * @param {Object} options - Rendering options
 * @returns {Array<Array<[number, number]>>} Array of segments
 */
export function generateStaticText(text, options = {}) {
    const {
        scale = 0.3,
        charSpacing = DEFAULT_CHAR_SPACING,
        pointDensity = DEFAULT_POINT_DENSITY,
        yOffset = 0,
        xOffset = 0
    } = options;

    if (text.length === 0) {
        return [];
    }

    const textWidth = measureText(text, scale, charSpacing);
    const charHeight = getCharHeight() * scale;
    const spacing = charSpacing * scale;

    // Center the text
    const startX = xOffset - textWidth / 2;
    const baseY = yOffset - charHeight / 2;

    const allSegments = [];

    let cursorX = startX;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const charSegments = generateCharPoints(char, cursorX, baseY, scale, pointDensity);
        allSegments.push(...charSegments);
        cursorX += getCharWidth(char) * scale + spacing;
    }

    return allSegments;
}

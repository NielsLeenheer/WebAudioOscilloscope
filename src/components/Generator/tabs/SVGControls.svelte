<script>
    import { parseSVGPath } from '../../../utils/shapes.js';
    import { svgExamples } from '../../../utils/svgExamples/index.js';
    import { onMount } from 'svelte';

    let { audioEngine, isPlaying, animationFPS = $bindable(30), numSamples = $bindable(200) } = $props();

    let svgInput = $state('');
    let selectedExample = $state('star');
    let validationError = $state('');
    let isValid = $state(true);
    let validationTimeout = null;
    let applyTimeout = null;
    let svgContainer;
    let previewCanvas;
    let previewCtx;

    // Animation interval
    let samplingInterval = null;

    // Auto-detect if input is full SVG markup or just path data
    function detectInputType(input) {
        const trimmed = input.trim();
        return trimmed.includes('<svg') ? 'full' : 'path';
    }

    // Extract raw points and bbox from SVG path data for preview
    function extractPathPoints(pathData, numSamples = 200) {
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

    // Extract points from an SVG element using browser APIs
    function extractPointsFromElement(element, samples) {
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

    // Draw extracted points on preview canvas
    function drawPreview(points, bbox) {
        if (!previewCanvas) return;

        // Initialize context if needed
        if (!previewCtx) {
            previewCtx = previewCanvas.getContext('2d');
        }

        const canvas = previewCanvas;
        const ctx = previewCtx;

        // Clear canvas (transparent)
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (points.length === 0) return;

        // Calculate scaling to fit canvas while maintaining aspect ratio
        const padding = 10;
        const availableWidth = canvas.width - padding * 2;
        const availableHeight = canvas.height - padding * 2;

        const bboxWidth = bbox.width || 1;
        const bboxHeight = bbox.height || 1;
        const scale = Math.min(availableWidth / bboxWidth, availableHeight / bboxHeight);

        const centerX = bbox.x + bboxWidth / 2;
        const centerY = bbox.y + bboxHeight / 2;
        const canvasCenterX = canvas.width / 2;
        const canvasCenterY = canvas.height / 2;

        // Draw points as a path with 70% opacity
        ctx.strokeStyle = 'rgba(60, 60, 60, 0.7)';
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        let firstPoint = true;
        let prevCanvasX = 0;
        let prevCanvasY = 0;

        for (let i = 0; i < points.length; i++) {
            const [x, y] = points[i];
            const canvasX = canvasCenterX + (x - centerX) * scale;
            const canvasY = canvasCenterY + (y - centerY) * scale;

            if (firstPoint) {
                ctx.moveTo(canvasX, canvasY);
                firstPoint = false;
            } else {
                // Calculate distance from previous point
                const dx = canvasX - prevCanvasX;
                const dy = canvasY - prevCanvasY;
                const distance = Math.sqrt(dx * dx + dy * dy);

                // If it's a huge leap (more than 50 pixels), draw with 10% opacity
                if (distance > 50) {
                    ctx.stroke(); // Finish current path
                    ctx.strokeStyle = 'rgba(60, 60, 60, 0.1)';
                    ctx.beginPath();
                    ctx.moveTo(prevCanvasX, prevCanvasY);
                    ctx.lineTo(canvasX, canvasY);
                    ctx.stroke();
                    ctx.strokeStyle = 'rgba(60, 60, 60, 0.7)';
                    ctx.beginPath();
                    ctx.moveTo(canvasX, canvasY);
                } else {
                    ctx.lineTo(canvasX, canvasY);
                }
            }

            prevCanvasX = canvasX;
            prevCanvasY = canvasY;
        }

        ctx.stroke();
    }

    // Parse full SVG markup and extract all paths (static, no animation)
    function parseSVGMarkupStatic(markup, samples) {
        if (!svgContainer) return [];

        // Clear container and inject SVG
        svgContainer.innerHTML = markup;

        const svgElement = svgContainer.querySelector('svg');
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

        // Draw preview with raw points
        drawPreview(allPoints, bbox);

        const centerX = bbox.x + bbox.width / 2;
        const centerY = bbox.y + bbox.height / 2;
        const scale = Math.max(bbox.width, bbox.height);

        // Normalize to -1 to 1 range
        const normalizedPoints = allPoints.map(([x, y]) => [
            ((x - centerX) / scale) * 2,
            -((y - centerY) / scale) * 2  // Flip Y for oscilloscope coordinates
        ]);

        return normalizedPoints;
    }

    // Sample current frame from live animations
    function sampleCurrentFrame(svgElement, elements, samples) {
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

    // Start continuous sampling of animations
    function startContinuousSampling(markup, samples) {
        // Stop any existing sampling
        stopContinuousSampling();

        if (!svgContainer) return;

        // Setup SVG
        svgContainer.innerHTML = markup;
        const svgElement = svgContainer.querySelector('svg');
        if (!svgElement) return;

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
        if (elements.length === 0) return;

        // Get bounding box for normalization
        const bbox = svgElement.getBBox();
        const centerX = bbox.x + bbox.width / 2;
        const centerY = bbox.y + bbox.height / 2;
        const scale = Math.max(bbox.width, bbox.height);

        const frameDuration = 1000 / animationFPS;

        // Sample continuously at specified FPS
        samplingInterval = setInterval(() => {
            if (!isPlaying) {
                stopContinuousSampling();
                return;
            }

            try {
                const framePoints = sampleCurrentFrame(svgElement, elements, samples);

                if (framePoints.length === 0) return;

                // Draw preview with raw points
                drawPreview(framePoints, bbox);

                // Normalize points
                const normalizedPoints = framePoints.map(([x, y]) => [
                    ((x - centerX) / scale) * 2,
                    -((y - centerY) / scale) * 2
                ]);

                // Update waveform with current frame
                audioEngine.restoreDefaultFrequency();
                audioEngine.createWaveform(normalizedPoints);
            } catch (error) {
                console.error('Error sampling animation frame:', error);
            }
        }, frameDuration);
    }

    // Stop continuous sampling
    function stopContinuousSampling() {
        if (samplingInterval) {
            clearInterval(samplingInterval);
            samplingInterval = null;
        }
    }


    async function validateInput() {
        const data = svgInput.trim();

        if (!data) {
            validationError = '';
            isValid = true;
            return false;
        }

        try {
            const inputType = detectInputType(data);
            if (inputType === 'path') {
                parseSVGPath(data, numSamples, true);
                // Update preview for path data
                const { points, bbox } = extractPathPoints(data, numSamples);
                drawPreview(points, bbox);
            } else {
                parseSVGMarkupStatic(data, numSamples);
            }
            validationError = '';
            isValid = true;
            return true;
        } catch (error) {
            validationError = error.message || 'Invalid SVG';
            isValid = false;
            return false;
        }
    }

    async function drawSVG() {
        if (!isPlaying) {
            stopContinuousSampling();
            return;
        }

        const data = svgInput.trim();
        if (!data) return;

        const inputType = detectInputType(data);

        // If full SVG markup, always use continuous sampling for CSS animations
        if (inputType === 'full') {
            startContinuousSampling(data, numSamples);
            return;
        }

        // For path data, stop continuous sampling
        stopContinuousSampling();

        // Restore Settings tab default frequency
        audioEngine.restoreDefaultFrequency();

        try {
            const valid = await validateInput();
            if (valid) {
                const points = parseSVGPath(data, numSamples, true);
                audioEngine.createWaveform(points);
            }
        } catch (error) {
            console.error('Error drawing SVG:', error);
            validationError = error.message || 'Error drawing SVG';
            isValid = false;
        }
    }

    function handleTextareaInput(event) {
        // Switch to "custom" when user manually edits
        selectedExample = 'custom';

        // Debounce validation
        if (validationTimeout) {
            clearTimeout(validationTimeout);
        }
        validationTimeout = setTimeout(() => {
            validateInput();
        }, 300);

        // Debounce auto-apply
        if (applyTimeout) {
            clearTimeout(applyTimeout);
        }
        applyTimeout = setTimeout(() => {
            if (isPlaying && isValid) {
                drawSVG();
            }
        }, 800);
    }

    function handleSelectChange(event) {
        if (selectedExample === 'custom') {
            // Don't change textarea content for custom
            return;
        }

        const example = svgExamples.find(ex => ex.id === selectedExample);

        if (example) {
            svgInput = example.path;

            // Adjust sample points based on complexity
            if (example.complex) {
                numSamples = 400;
            } else {
                numSamples = 200;
            }

            validateInput();

            if (isPlaying && isValid) {
                drawSVG();
            }
        }
    }

    onMount(() => {
        // Initialize canvas context
        if (previewCanvas) {
            previewCtx = previewCanvas.getContext('2d');
        }

        // Load initial example
        handleSelectChange();

        // Cleanup on unmount
        return () => {
            stopContinuousSampling();
        };
    });

    // Stop continuous sampling when playback stops
    $effect(() => {
        if (!isPlaying) {
            stopContinuousSampling();
        }
    });
</script>

<div class="svg-controls">
    <div class="header">
        <canvas
            bind:this={previewCanvas}
            width="150"
            height="150"
            class="preview-canvas"
        ></canvas>

        <select bind:value={selectedExample} onchange={handleSelectChange}>
            <option value="custom">Custom...</option>
            {#each svgExamples as example}
                <option value={example.id}>{example.label}</option>
            {/each}
        </select>
    </div>

    <pre
        contenteditable="plaintext-only"
        bind:textContent={svgInput}
        oninput={handleTextareaInput}
        data-placeholder="Paste SVG path data or full SVG markup here.

Path data example:
M 10,10 L 90,90 L 10,90 Z

Full SVG example:
<svg viewBox='0 0 100 100'>
  <circle cx='50' cy='50' r='40'/>
</svg>"
    ></pre>
</div>

<!-- Hidden container for rendering and extracting SVG -->
<div bind:this={svgContainer} style="position: fixed; left: 0; top: 0; width: 500px; height: 500px; opacity: 0; pointer-events: none; z-index: -9999;"></div>

<style>
    .svg-controls {
        display: grid;
        grid-template-rows: auto 1fr;
        height: 100%;
    }

    .header {
        padding: 20px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
    }

    select {
        border: 2px solid #ccc;
    }

    .preview-canvas {
        width: 150px;
        height: 150px;
    }

    pre[contenteditable] {
        padding: 20px;
        margin: 0;

        font-family: monospace;
        font-size: 13px;
        color: #666;
        line-height: 1.6;

        overflow-x: auto;
        overflow-y: auto;
        white-space: pre-wrap;

        outline: none;
    }

    pre[contenteditable]:empty:before {
        content: attr(data-placeholder);
        color: #999;
        pointer-events: none;
    }
</style>

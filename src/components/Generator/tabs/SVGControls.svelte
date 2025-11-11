<script>
    import { parseSVGPath } from '../../../utils/shapes.js';
    import { svgExamples, complexShapes } from '../../../utils/svgExamples.js';
    import { onMount } from 'svelte';

    let { audioEngine, isPlaying } = $props();

    let inputMode = $state('path'); // 'path' or 'full'
    let svgPath = $state('');
    let svgMarkup = $state('');
    let numSamples = $state(200);
    let selectedExample = $state('star');
    let validationError = $state('');
    let isValid = $state(true);
    let validationTimeout = null;
    let applyTimeout = null;
    let svgContainer;

    // Animation settings
    let enableAnimation = $state(true); // Enabled by default
    let animationFPS = $state(30);
    let samplingInterval = null;

    // Extract points from an SVG element using browser APIs
    function extractPointsFromElement(element, samples) {
        const points = [];

        // Check if element is an SVGGeometryElement (has getTotalLength)
        if (typeof element.getTotalLength === 'function') {
            const totalLength = element.getTotalLength();

            // Get the SVG root
            const svg = element.ownerSVGElement;

            // Get transformation matrix relative to SVG (not viewport)
            // This avoids including the container's -9999px offset
            let matrix = null;
            if (svg) {
                const elementCTM = element.getCTM();
                const svgCTM = svg.getCTM();

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
        }

        return points;
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


    async function validatePath() {
        const data = inputMode === 'path' ? svgPath.trim() : svgMarkup.trim();

        if (!data) {
            validationError = '';
            isValid = true;
            return false;
        }

        try {
            if (inputMode === 'path') {
                parseSVGPath(data, numSamples, true);
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

        // If full SVG mode with animation enabled, use continuous sampling
        if (inputMode === 'full' && enableAnimation) {
            const markup = svgMarkup.trim();
            if (markup) {
                startContinuousSampling(markup, numSamples);
            }
            return;
        }

        // Stop any continuous sampling if not in animation mode
        stopContinuousSampling();

        // Restore Settings tab default frequency
        audioEngine.restoreDefaultFrequency();

        try {
            const valid = await validatePath();
            if (valid) {
                let points;
                if (inputMode === 'path') {
                    points = parseSVGPath(svgPath.trim(), numSamples, true);
                } else {
                    points = parseSVGMarkupStatic(svgMarkup.trim(), numSamples);
                }
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
            validatePath();
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

        const pathData = svgExamples[selectedExample];

        if (pathData) {
            svgPath = pathData;
            inputMode = 'path'; // Switch to path mode for examples

            // Adjust sample points based on complexity
            if (complexShapes.includes(selectedExample)) {
                numSamples = 400;
            } else {
                numSamples = 200;
            }

            validatePath();

            if (isPlaying && isValid) {
                drawSVG();
            }
        }
    }

    function handleModeChange() {
        validatePath();
    }

    onMount(() => {
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

<div class="control-group">
    <div style="display: flex; gap: 10px; margin-bottom: 10px;">
        <label>
            <input type="radio" bind:group={inputMode} value="path" onchange={handleModeChange} />
            Path Data
        </label>
        <label>
            <input type="radio" bind:group={inputMode} value="full" onchange={handleModeChange} />
            Full SVG Markup
        </label>
    </div>

    {#if inputMode === 'path'}
        <select bind:value={selectedExample} onchange={handleSelectChange}>
            <option value="custom">Custom...</option>
            <option value="star">Star</option>
            <option value="html5">HTML5 Logo</option>
            <option value="heart_svg">Heart (SVG)</option>
            <option value="lightning">Lightning Bolt</option>
            <option value="music">Music Note</option>
            <option value="rocket">Rocket</option>
            <option value="house">House</option>
            <option value="smiley">Smiley Face</option>
            <option value="infinity">Infinity Symbol</option>
            <option value="peace">Peace Sign</option>
            <option value="beyondtellerrand">Beyond Tellerrand</option>
        </select>
        <textarea
            bind:value={svgPath}
            oninput={handleTextareaInput}
            rows="8"
            style="margin-top: 10px; {isValid ? '' : 'border: 2px solid #c62828;'}"
            placeholder="Paste SVG path data here, e.g.:
M 10,10 L 90,90 L 10,90 Z

Or try a simple example:
M 0,0 L 50,50 L 0,100 L -50,50 Z"
        ></textarea>
    {:else}
        <textarea
            bind:value={svgMarkup}
            oninput={handleTextareaInput}
            rows="12"
            style="margin-top: 10px; {isValid ? '' : 'border: 2px solid #c62828;'}"
            placeholder="Paste full SVG markup here, e.g.:
<svg viewBox='0 0 100 100'>
  <circle cx='50' cy='50' r='40'/>
  <rect x='30' y='30' width='40' height='40'/>
</svg>"
        ></textarea>
    {/if}

    {#if validationError}
        <div style="color: #c62828; font-size: 12px; margin-top: 5px;">
            ⚠️ {validationError}
        </div>
    {/if}

    {#if inputMode === 'full'}
        <div style="margin-top: 15px; padding: 10px; background: #f5f5f5; border-radius: 4px;">
            <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
                <input type="checkbox" bind:checked={enableAnimation} onchange={drawSVG} />
                <strong>Enable CSS Animation</strong>
            </label>

            {#if enableAnimation}
                <div style="margin-top: 10px;">
                    <label for="animFPS">FPS:</label>
                    <input type="number" id="animFPS" bind:value={animationFPS} min="10" max="60" step="5" style="width: 100%;" onchange={drawSVG}>
                </div>
                <div class="value-display" style="margin-top: 8px; font-size: 11px;">
                    Continuously sampling animation at {animationFPS} FPS in real-time
                </div>
            {/if}
        </div>
    {/if}

    <div style="margin-top: 10px;">
        <label for="svgSamples">Sample Points {inputMode === 'full' && enableAnimation ? 'per Frame' : ''}:</label>
        <input type="number" id="svgSamples" bind:value={numSamples} min="50" max="1000" step="50" style="width: 5em;">
    </div>
    <div class="value-display" style="margin-top: 10px;">
        {#if inputMode === 'path'}
            💡 Tip: Export paths from Inkscape, Illustrator, or use online SVG editors. Complex paths work best with more sample points.
        {:else if enableAnimation}
            💡 Tip: CSS animations using @keyframes are sampled in real-time, perfect for infinite loops. The waveform updates live at the specified FPS.
        {:else}
            💡 Tip: Paste complete SVG with styling. All shapes (paths, circles, rects, polygons) will be traced automatically.
        {/if}
    </div>
</div>

<!-- Hidden container for rendering and extracting SVG -->
<div bind:this={svgContainer} style="position: fixed; left: 0; top: 0; width: 500px; height: 500px; opacity: 0; pointer-events: none; z-index: -9999;"></div>

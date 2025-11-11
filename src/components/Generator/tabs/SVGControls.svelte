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
    let enableAnimation = $state(false);
    let animationFPS = $state(30);
    let animationDuration = $state(2.0); // seconds

    // Extract points from an SVG element using browser APIs
    function extractPointsFromElement(element, samples) {
        const points = [];

        // Check if element is an SVGGeometryElement (has getTotalLength)
        if (typeof element.getTotalLength === 'function') {
            const totalLength = element.getTotalLength();

            for (let i = 0; i <= samples; i++) {
                const distance = (i / samples) * totalLength;
                const point = element.getPointAtLength(distance);
                points.push([point.x, point.y]);
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

    // Parse SVG markup with CSS animation support
    async function parseSVGMarkupAnimated(markup, samplesPerFrame, fps, duration) {
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

        // Get all animations using Web Animations API
        const animations = [];
        elements.forEach(element => {
            const elementAnimations = element.getAnimations();
            animations.push(...elementAnimations);
        });

        // Pause all animations so we can control time manually
        animations.forEach(anim => {
            anim.pause();
        });

        const frameCount = Math.ceil(fps * duration);
        const frameDuration = 1000 / fps; // milliseconds
        let allFramePoints = [];

        // Sample at each frame
        for (let frame = 0; frame < frameCount; frame++) {
            const currentTime = frame * frameDuration;

            // Set all animations to this time point
            animations.forEach(anim => {
                anim.currentTime = currentTime;
            });

            // Force style recalculation
            svgElement.getBoundingClientRect();

            // Extract points from all elements at this time
            let framePoints = [];
            elements.forEach((element) => {
                const elementPoints = extractPointsFromElement(element, Math.floor(samplesPerFrame / elements.length));
                if (elementPoints.length > 0) {
                    framePoints = framePoints.concat(elementPoints);
                }
            });

            allFramePoints = allFramePoints.concat(framePoints);
        }

        if (allFramePoints.length === 0) {
            throw new Error('Could not extract points from animated SVG');
        }

        // Get overall bounding box for normalization (use first frame)
        animations.forEach(anim => anim.currentTime = 0);
        svgElement.getBoundingClientRect();

        const bbox = svgElement.getBBox();
        const centerX = bbox.x + bbox.width / 2;
        const centerY = bbox.y + bbox.height / 2;
        const scale = Math.max(bbox.width, bbox.height);

        // Normalize to -1 to 1 range
        const normalizedPoints = allFramePoints.map(([x, y]) => [
            ((x - centerX) / scale) * 2,
            -((y - centerY) / scale) * 2  // Flip Y for oscilloscope coordinates
        ]);

        return normalizedPoints;
    }

    // Wrapper function that chooses between static and animated parsing
    async function parseSVGMarkup(markup, samples) {
        if (enableAnimation) {
            return await parseSVGMarkupAnimated(markup, samples, animationFPS, animationDuration);
        } else {
            return parseSVGMarkupStatic(markup, samples);
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
                await parseSVGMarkup(data, numSamples);
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
        if (!isPlaying) return;

        // Restore Settings tab default frequency
        audioEngine.restoreDefaultFrequency();

        try {
            const valid = await validatePath();
            if (valid) {
                let points;
                if (inputMode === 'path') {
                    points = parseSVGPath(svgPath.trim(), numSamples, true);
                } else {
                    points = await parseSVGMarkup(svgMarkup.trim(), numSamples);
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
                <input type="checkbox" bind:checked={enableAnimation} />
                <strong>Enable CSS Animation</strong>
            </label>

            {#if enableAnimation}
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
                    <div>
                        <label for="animFPS">FPS:</label>
                        <input type="number" id="animFPS" bind:value={animationFPS} min="10" max="60" step="5" style="width: 100%;">
                    </div>
                    <div>
                        <label for="animDuration">Duration (s):</label>
                        <input type="number" id="animDuration" bind:value={animationDuration} min="0.5" max="10" step="0.5" style="width: 100%;">
                    </div>
                </div>
                <div class="value-display" style="margin-top: 8px; font-size: 11px;">
                    Animation will be sampled at {animationFPS} FPS over {animationDuration}s ({Math.ceil(animationFPS * animationDuration)} frames)
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
        {:else if !enableAnimation}
            💡 Tip: Paste complete SVG with styling. All shapes (paths, circles, rects, polygons) will be traced automatically.
        {:else}
            💡 Tip: CSS animations using @keyframes and animation property are supported. The animation will be sampled at specified FPS and duration.
        {/if}
    </div>
</div>

<!-- Hidden container for rendering and extracting SVG -->
<div bind:this={svgContainer} style="position: absolute; left: -9999px; top: -9999px; width: 500px; height: 500px;"></div>

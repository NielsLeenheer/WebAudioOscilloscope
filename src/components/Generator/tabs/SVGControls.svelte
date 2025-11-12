<script>
    import { parseSVGPath } from '../../../utils/shapes.js';
    import { svgExamples } from '../../../utils/svgExamples/index.js';
    import { onMount } from 'svelte';
    import Preview from '../../Common/Preview.svelte';
    import {
        normalizePoints,
        extractPathPoints,
        parseSVGMarkupStatic,
        createContinuousSampler
    } from '../../../utils/svgSampler.js';

    let { audioEngine, isPlaying, animationFPS = $bindable(30), numSamples = $bindable(200) } = $props();

    let svgInput = $state('');
    let selectedExample = $state('star');
    let validationError = $state('');
    let isValid = $state(true);
    let validationTimeout = null;
    let applyTimeout = null;
    let svgContainer;
    let normalizedPoints = $state([]);

    // Animation sampler
    let sampler = null;

    // Auto-detect if input is full SVG markup or just path data
    function detectInputType(input) {
        const trimmed = input.trim();
        return trimmed.includes('<svg') ? 'full' : 'path';
    }

    // Start continuous sampling of animations
    function startContinuousSampling(markup, samples) {
        // Stop any existing sampling
        stopContinuousSampling();

        if (!svgContainer) return;

        try {
            sampler = createContinuousSampler(
                markup,
                samples,
                svgContainer,
                animationFPS,
                (normalized) => {
                    normalizedPoints = normalized;
                    // Update waveform with current frame
                    audioEngine.restoreDefaultFrequency();
                    audioEngine.createWaveform(normalized);
                },
                () => isPlaying
            );
        } catch (error) {
            console.error('Error starting continuous sampling:', error);
        }
    }

    // Stop continuous sampling
    function stopContinuousSampling() {
        if (sampler) {
            sampler.stop();
            sampler = null;
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
                normalizedPoints = normalizePoints(points, bbox);
            } else {
                normalizedPoints = parseSVGMarkupStatic(data, numSamples, svgContainer);
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
            if (valid && normalizedPoints.length > 0) {
                audioEngine.createWaveform(normalizedPoints);
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
        <Preview points={normalizedPoints} width={150} height={150} />

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

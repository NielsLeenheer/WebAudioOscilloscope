<script>
    import { get } from 'svelte/store';
    import { parseSVGPath } from '../../../utils/shapes.js';
    import { svgExamples } from '../../../utils/svgExamples/index.js';
    import { onMount } from 'svelte';
    import Preview from '../../Common/Preview.svelte';
    import CodeEditor from '../../Common/CodeEditor.svelte';
    import {
        normalizePoints,
        extractPathPoints,
        parseSVGMarkupStatic,
        createContinuousSampler
    } from '../../../utils/svgSampler.js';

    let { audioEngine, animationFPS = $bindable(30), numSamples = $bindable(200), svgInput = $bindable(''), selectedExample = $bindable('star') } = $props();
    let isPlaying = audioEngine.isPlaying;
    let validationError = $state('');
    let isValid = $state(true);
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

        try {
            sampler = createContinuousSampler(
                markup,
                samples,
                animationFPS,
                (normalized) => {
                    normalizedPoints = normalized;
                    // Update waveform with current frame
                    audioEngine.restoreDefaultFrequency();
                    audioEngine.createWaveform(normalized);
                },
                () => get(audioEngine.isPlaying)
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


    function validateInput(value) {
        const data = value.trim();

        if (!data) {
            validationError = '';
            isValid = true;
            return;
        }

        try {
            const inputType = detectInputType(data);
            if (inputType === 'path') {
                parseSVGPath(data, numSamples, true);
                // Update preview for path data
                const { segments, bbox } = extractPathPoints(data, numSamples);
                // Normalize all segments together
                normalizedPoints = segments.map(segment => normalizePoints(segment, bbox));
            } else {
                normalizedPoints = parseSVGMarkupStatic(data, numSamples);
            }
            validationError = '';
            isValid = true;
        } catch (error) {
            validationError = error.message || 'Invalid SVG';
            isValid = false;
        }
    }

    function applyInput(value) {
        if (!get(audioEngine.isPlaying) || !isValid) return;

        const data = value.trim();
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
            if (normalizedPoints.length > 0) {
                audioEngine.createWaveform(normalizedPoints);
            }
        } catch (error) {
            console.error('Error applying SVG:', error);
        }
    }

    function handleEditorInput(event) {
        // Switch to "custom" when user manually edits
        selectedExample = 'custom';
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

            validateInput(svgInput);

            if (get(audioEngine.isPlaying) && isValid) {
                applyInput(svgInput);
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
        if (!$isPlaying) {
            stopContinuousSampling();
        }
    });

    // Validate input when it changes externally (e.g., from Draw tab copy)
    $effect(() => {
        if (selectedExample === 'custom' && svgInput) {
            validateInput(svgInput);
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

    <CodeEditor
        bind:value={svgInput}
        bind:validationError
        bind:isValid
        oninput={handleEditorInput}
        onvalidate={validateInput}
        onapply={applyInput}
        autoapply={true}
        placeholder="Paste SVG path data or full SVG markup here.

Path data example:
M 10,10 L 90,90 L 10,90 Z

Full SVG example:
<svg viewBox='0 0 100 100'>
  <circle cx='50' cy='50' r='40'/>
</svg>"
    />
</div>

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
</style>

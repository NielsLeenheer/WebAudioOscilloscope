<script>
    import { parseSVGPath } from '../utils/shapes.js';
    import { svgExamples, complexShapes } from '../utils/svgExamples.js';
    import { onMount } from 'svelte';

    let { audioEngine, isPlaying } = $props();

    let svgPath = $state('');
    let numSamples = $state(200);
    let selectedExample = $state('star');
    let validationError = $state('');
    let isValid = $state(true);

    function validatePath() {
        const pathData = svgPath.trim();

        if (!pathData) {
            validationError = '';
            isValid = true;
            return false;
        }

        try {
            parseSVGPath(pathData, numSamples, true);
            validationError = '';
            isValid = true;
            return true;
        } catch (error) {
            validationError = error.message;
            isValid = false;
            return false;
        }
    }

    function drawSVGPath() {
        if (!isPlaying) return;

        if (validatePath()) {
            const points = parseSVGPath(svgPath.trim(), numSamples, true);
            audioEngine.createWaveform(points);
        }
    }

    function handleTextareaInput(event) {
        // Switch to "custom" when user manually edits
        selectedExample = 'custom';
        validatePath();
    }

    function handleSelectChange(event) {
        if (selectedExample === 'custom') {
            // Don't change textarea content for custom
            return;
        }

        const pathData = svgExamples[selectedExample];

        if (pathData) {
            svgPath = pathData;

            // Adjust sample points based on complexity
            if (complexShapes.includes(selectedExample)) {
                numSamples = 400;
            } else {
                numSamples = 200;
            }

            validatePath();

            if (isPlaying && isValid) {
                drawSVGPath();
            }
        }
    }

    onMount(() => {
        // Load initial example
        handleSelectChange();
    });
</script>

<div class="control-group">
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
        rows="4"
        style="margin-top: 10px; {isValid ? '' : 'border: 2px solid #c62828;'}"
        placeholder="Paste SVG path data here, e.g.:
M 10,10 L 90,90 L 10,90 Z

Or try a simple example:
M 0,0 L 50,50 L 0,100 L -50,50 Z"
    ></textarea>
    {#if validationError}
        <div style="color: #c62828; font-size: 12px; margin-top: 5px;">
            ⚠️ {validationError}
        </div>
    {/if}
    {#if selectedExample === 'custom' && svgPath.trim() && isValid}
        <button onclick={() => drawSVGPath()} style="margin-top: 10px;">Apply Custom Path</button>
    {/if}
    <div style="margin-top: 10px;">
        <label for="svgSamples">Sample Points:</label>
        <input type="number" id="svgSamples" bind:value={numSamples} min="50" max="1000" step="50" style="width: 5em;">
    </div>
    <div class="value-display" style="margin-top: 10px;">
        💡 Tip: Export paths from Inkscape, Illustrator, or use online SVG editors. Complex paths work best with more sample points.
    </div>
</div>

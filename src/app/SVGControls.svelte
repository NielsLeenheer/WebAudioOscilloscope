<script>
    import { parseSVGPath } from '../utils/shapes.js';
    import { svgExamples, complexShapes } from '../utils/svgExamples.js';

    let { audioEngine, isPlaying } = $props();

    let svgPath = $state('');
    let numSamples = $state(200);
    let selectedExample = $state('star'); // Default to first item
    let showApplyButton = $state(false);
    let programmaticChange = false; // Flag to track programmatic vs user changes

    function drawSVGPath() {
        if (!isPlaying) return;

        const pathData = svgPath.trim();

        if (!pathData) {
            alert('Please enter an SVG path');
            return;
        }

        try {
            const points = parseSVGPath(pathData, numSamples, true); // Always auto-center
            audioEngine.createWaveform(points);
            showApplyButton = false; // Hide button after applying
        } catch (error) {
            alert('Error parsing SVG path: ' + error.message);
            console.error(error);
        }
    }

    function handleTextareaInput(event) {
        // Only show button for actual user input (not programmatic changes)
        if (!programmaticChange) {
            showApplyButton = true;
        }
    }

    // Watch for selection changes and auto-load
    function handleSelectChange() {
        if (selectedExample) {
            const pathData = svgExamples[selectedExample];

            if (pathData) {
                programmaticChange = true; // Set flag before updating
                svgPath = pathData;

                // Adjust sample points based on complexity
                if (complexShapes.includes(selectedExample)) {
                    numSamples = 400;
                } else {
                    numSamples = 200;
                }

                showApplyButton = false;

                if (isPlaying) {
                    drawSVGPath();
                }

                // Reset flag after DOM update
                setTimeout(() => {
                    programmaticChange = false;
                }, 0);
            }
        }
    }

    // Run on mount to load initial example
    $effect(() => {
        handleSelectChange();
    });
</script>

<div class="control-group">
    <select bind:value={selectedExample} onchange={handleSelectChange}>
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
        style="margin-top: 10px;"
        placeholder="Paste SVG path data here, e.g.:
M 10,10 L 90,90 L 10,90 Z

Or try a simple example:
M 0,0 L 50,50 L 0,100 L -50,50 Z"
    ></textarea>
    {#if showApplyButton}
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

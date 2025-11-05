<script>
    import { parseSVGPath } from '../utils/shapes.js';
    import { svgExamples, complexShapes } from '../utils/svgExamples.js';

    let { audioEngine, isPlaying } = $props();

    let svgPath = $state('');
    let numSamples = $state(200);
    let autoCenter = $state(true);
    let selectedExample = $state('star'); // Default to first item
    let lastLoadedPath = $state(''); // Track the last path loaded from examples
    let showApplyButton = $state(false);

    function drawSVGPath() {
        if (!isPlaying) return;

        const pathData = svgPath.trim();

        if (!pathData) {
            alert('Please enter an SVG path');
            return;
        }

        try {
            const points = parseSVGPath(pathData, numSamples, autoCenter);
            audioEngine.createWaveform(points);
            lastLoadedPath = pathData; // Update last loaded path
            showApplyButton = false; // Hide button after applying
        } catch (error) {
            alert('Error parsing SVG path: ' + error.message);
            console.error(error);
        }
    }

    // Watch for selection changes and auto-load
    $effect(() => {
        if (selectedExample) {
            const pathData = svgExamples[selectedExample];

            if (pathData) {
                svgPath = pathData;
                lastLoadedPath = pathData;

                // Adjust sample points based on complexity
                if (complexShapes.includes(selectedExample)) {
                    numSamples = 400;
                } else {
                    numSamples = 200;
                }

                drawSVGPath();
            }
        }
    });

    // Watch for manual edits to textarea
    $effect(() => {
        // Show button if path has been manually edited
        if (svgPath && svgPath.trim() !== lastLoadedPath.trim()) {
            showApplyButton = true;
        } else {
            showApplyButton = false;
        }
    });
</script>

<div class="control-group">
    <select bind:value={selectedExample}>
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
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
        <div>
            <label for="svgSamples">Sample Points:</label>
            <input type="number" id="svgSamples" bind:value={numSamples} min="50" max="1000" step="50">
        </div>
        <div style="display: flex; align-items: center;">
            <label style="display: flex; align-items: center; margin: 0;">
                <input type="checkbox" bind:checked={autoCenter} style="margin-right: 8px; width: auto;">
                Auto-center & scale
            </label>
        </div>
    </div>
    <div class="value-display" style="margin-top: 10px;">
        💡 Tip: Export paths from Inkscape, Illustrator, or use online SVG editors. Complex paths work best with more sample points.
    </div>
</div>

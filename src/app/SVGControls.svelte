<script>
    import { parseSVGPath } from '../utils/shapes.js';
    import { svgExamples, complexShapes } from '../utils/svgExamples.js';

    let { audioEngine, isPlaying } = $props();

    let svgPath = $state('');
    let numSamples = $state(200);
    let autoCenter = $state(true);
    let selectedExample = $state('');

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
        } catch (error) {
            alert('Error parsing SVG path: ' + error.message);
            console.error(error);
        }
    }

    function loadExample() {
        if (!selectedExample) {
            alert('Please select an example from the dropdown');
            return;
        }

        const pathData = svgExamples[selectedExample];

        if (!pathData) {
            alert('Example not found: ' + selectedExample);
            return;
        }

        svgPath = pathData;

        // Adjust sample points based on complexity
        if (complexShapes.includes(selectedExample)) {
            numSamples = 400;
        } else {
            numSamples = 200;
        }

        drawSVGPath();
    }
</script>

<div class="control-group">
    <label>SVG Path Input:</label>
    <textarea
        bind:value={svgPath}
        rows="4"
        placeholder="Paste SVG path data here, e.g.:
M 10,10 L 90,90 L 10,90 Z

Or try a simple example:
M 0,0 L 50,50 L 0,100 L -50,50 Z"
    ></textarea>
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
    <button onclick={() => drawSVGPath()} style="margin-top: 10px;">Draw SVG Path</button>
    <div style="margin-top: 10px;">
        <label for="svgExamples">Load Example:</label>
        <select id="svgExamples" bind:value={selectedExample} style="width: 100%; padding: 8px; background: #fff; color: #333; border: 1px solid #ddd; border-radius: 6px; margin-top: 5px;">
            <option value="">-- Select an example --</option>
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
        <button onclick={() => loadExample()} style="margin-top: 5px; background: #f5f5f5;">Load Selected</button>
    </div>
    <div class="value-display" style="margin-top: 10px;">
        💡 Tip: Export paths from Inkscape, Illustrator, or use online SVG editors. Complex paths work best with more sample points.
    </div>
</div>

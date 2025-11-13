<script>
    import { get } from 'svelte/store';
    import Button from '../../Common/Button.svelte';
    import PathEditor from '../../Common/PathEditor.svelte';
    import ImageUpload from '../../Common/ImageUpload.svelte';
    import EraseIcon from '../../../assets/icons/erase.svg?raw';
    import MoveIcon from '../../../assets/icons/move.svg?raw';

    let { audioEngine, activeTab = $bindable('draw'), svgInput = $bindable(''), svgSelectedExample = $bindable('star') } = $props();
    let isPlaying = audioEngine.isPlaying;

    let pathEditor;
    let backgroundImage = $state(null);
    let backgroundOpacity = $state(30);
    let currentNormalizedPoints = $state(null);

    // Auto-update scope whenever path changes and playing
    $effect(() => {
        if ($isPlaying && currentNormalizedPoints) {
            updateScope();
        }
    });

    function handlePathChange(normalizedPoints) {
        currentNormalizedPoints = normalizedPoints;
        if (get(audioEngine.isPlaying) && normalizedPoints) {
            updateScope();
        }
    }

    function updateScope() {
        if (!currentNormalizedPoints) return;

        // Restore Settings tab default frequency
        audioEngine.restoreDefaultFrequency();

        // Use the normalized points from PathEditor
        audioEngine.createWaveform(currentNormalizedPoints);
    }

    function clearCanvas() {
        if (pathEditor) {
            pathEditor.clear();
        }

        // Clear the oscilloscope output
        audioEngine.restoreDefaultFrequency();
        audioEngine.createWaveform([]);
    }

    function exportSVG() {
        if (!pathEditor || !pathEditor.hasPath()) {
            alert('No path to export');
            return;
        }

        const svg = pathEditor.exportSVG();
        if (svg) {
            const blob = new Blob([svg], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'path.svg';
            a.click();
            URL.revokeObjectURL(url);
        }
    }

    function copyToSVG() {
        if (!pathEditor || !pathEditor.hasPath()) {
            alert('No path to copy');
            return;
        }

        const svg = pathEditor.exportSVG();
        if (svg) {
            // Extract the d attribute from the path element
            const pathMatch = svg.match(/<path[^>]+d="([^"]+)"/);
            if (pathMatch && pathMatch[1]) {
                svgSelectedExample = 'custom';
                svgInput = pathMatch[1];
                activeTab = 'svg';
            }
        }
    }
</script>

<div class="control-group">
    <div style="display: flex; justify-content: center; gap: 10px; margin: 15px 0;">
        <Button variant="secondary" onclick={clearCanvas}>
            {@html EraseIcon}
            Clear
        </Button>
        <Button variant="secondary" onclick={copyToSVG}>
            {@html MoveIcon}
            Copy to SVG
        </Button>
    </div>

    <div style="display: flex; justify-content: center; margin: 20px 0;">
        <ImageUpload bind:image={backgroundImage} bind:opacity={backgroundOpacity}>
            <PathEditor
                bind:this={pathEditor}
                bind:backgroundImage
                bind:backgroundOpacity
                onPathChange={handlePathChange}
            />
        </ImageUpload>
    </div>
</div>

<style>

    .control-group {
        background: none;
        margin-top: 0px;
        padding: 10px;
    }

</style>
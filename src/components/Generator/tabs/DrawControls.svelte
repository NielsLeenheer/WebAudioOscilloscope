<script>
    import Button from '../../Common/Button.svelte';
    import PathEditor from '../../Common/PathEditor.svelte';
    import ImageUpload from '../../Common/ImageUpload.svelte';
    import EraseIcon from '../../../assets/icons/erase.svg?raw';

    let { audioEngine, isPlaying } = $props();

    let pathEditor;
    let backgroundImage = $state(null);
    let backgroundOpacity = $state(30);
    let currentNormalizedPoints = $state(null);

    // Auto-update scope whenever path changes and playing
    $effect(() => {
        if (isPlaying && currentNormalizedPoints) {
            updateScope();
        }
    });

    function handlePathChange(normalizedPoints) {
        currentNormalizedPoints = normalizedPoints;
        if (isPlaying && normalizedPoints) {
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
</script>

<div class="control-group">
    <div style="display: flex; justify-content: center; margin: 15px 0;">
        <Button variant="secondary" onclick={clearCanvas}>
            {@html EraseIcon}
            Clear
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
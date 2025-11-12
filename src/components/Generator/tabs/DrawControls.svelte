<script>
    import Button from '../../Common/Button.svelte';
    import PathEditor from '../../Common/PathEditor.svelte';
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

    function handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();

        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    backgroundImage = img;
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
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

    <div
        style="display: flex; justify-content: center; margin: 20px 0;"
        ondragover={handleDragOver}
        ondrop={handleDrop}
    >
        <PathEditor
            bind:this={pathEditor}
            bind:backgroundImage
            bind:backgroundOpacity
            onPathChange={handlePathChange}
        />
    </div>

    {#if backgroundImage}
        <div style="margin-top: 15px;">
            <label for="backgroundOpacity">Background Image Opacity: <span>{backgroundOpacity}</span>%</label>
            <input
                type="range"
                id="backgroundOpacity"
                min="0"
                max="100"
                bind:value={backgroundOpacity}
                step="5"
            >
        </div>
    {/if}
</div>

<style>

    .control-group {
        background: none;
        margin-top: 0px;
        padding: 10px;
    }

</style>
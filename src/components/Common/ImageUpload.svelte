<script>
    let {
        image = $bindable(null),
        opacity = $bindable(30),
        showOpacitySlider = true,
        opacityLabel = "Background Image Opacity",
        opacityMin = 0,
        opacityMax = 100,
        opacityStep = 5,
        acceptedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml'],
        children
    } = $props();

    let isDragging = $state(false);
    let fileInput;

    function handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        isDragging = true;
    }

    function handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        // Only set isDragging to false if leaving the drop zone itself, not child elements
        if (e.target === e.currentTarget) {
            isDragging = false;
        }
    }

    function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        isDragging = false;

        const file = e.dataTransfer.files[0];
        loadImageFile(file);
    }

    function handleFileSelect(e) {
        const file = e.target.files[0];
        loadImageFile(file);
    }

    function loadImageFile(file) {
        if (!file) return;

        // Check if file type is accepted
        if (!acceptedTypes.includes(file.type)) {
            alert(`File type not supported. Please upload one of: ${acceptedTypes.join(', ')}`);
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                image = img;
            };
            img.onerror = () => {
                alert('Failed to load image');
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }

    function triggerFileInput() {
        fileInput?.click();
    }

    function clearImage() {
        image = null;
        if (fileInput) {
            fileInput.value = '';
        }
    }
</script>

<div class="image-upload-container">
    <div
        class="drop-zone"
        class:dragging={isDragging}
        ondragover={handleDragOver}
        ondragleave={handleDragLeave}
        ondrop={handleDrop}
        role="button"
        tabindex="0"
    >
        {#if isDragging}
            <div class="drag-overlay">
                <div class="drag-message">Drop image here</div>
            </div>
        {/if}

        {@render children?.()}
    </div>

    <input
        bind:this={fileInput}
        type="file"
        accept={acceptedTypes.join(',')}
        onchange={handleFileSelect}
        style="display: none;"
    />

    {#if image && showOpacitySlider}
        <div class="opacity-controls">
            <div class="opacity-header">
                <label for="imageOpacity">{opacityLabel}: <span>{opacity}%</span></label>
                <button class="clear-button" onclick={clearImage} type="button">✕ Clear</button>
            </div>
            <input
                type="range"
                id="imageOpacity"
                min={opacityMin}
                max={opacityMax}
                bind:value={opacity}
                step={opacityStep}
            />
        </div>
    {/if}
</div>

<style>
    .image-upload-container {
        display: flex;
        flex-direction: column;
        gap: 15px;
    }

    .drop-zone {
        position: relative;
        display: inline-block;
        transition: opacity 0.2s;
    }

    .drop-zone.dragging {
        opacity: 0.5;
    }

    .drag-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(25, 118, 210, 0.1);
        border: 3px dashed #1976d2;
        border-radius: 8px;
        pointer-events: none;
        z-index: 10;
    }

    .drag-message {
        background: #1976d2;
        color: white;
        padding: 12px 24px;
        border-radius: 4px;
        font-size: 16px;
        font-weight: 500;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    .opacity-controls {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .opacity-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .opacity-controls label {
        font-size: 14px;
        color: #333;
    }

    .opacity-controls label span {
        font-weight: 600;
    }

    .opacity-controls input[type="range"] {
        width: 100%;
    }

    .clear-button {
        background: #f44336;
        color: white;
        border: none;
        padding: 4px 12px;
        border-radius: 4px;
        font-size: 12px;
        cursor: pointer;
        transition: background 0.2s;
    }

    .clear-button:hover {
        background: #d32f2f;
    }

    .clear-button:active {
        background: #c62828;
    }
</style>

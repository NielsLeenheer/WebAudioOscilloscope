<script>
    import ToggleSwitch from '../Common/ToggleSwitch.svelte';

    let {
        debugMode = $bindable(),
        rendererType = $bindable(),
        availableRenderers = [],
        pendingRendererType = null,
        onReloadRequested = () => {},
        timeSegment = $bindable(),
        dotOpacity = $bindable(),
        dotSizeVariation = $bindable(),
        sampleDotOpacity = $bindable(),
        coilStrength = $bindable(),
        beamInertia = $bindable(),
        fieldDamping = $bindable(),
        persistence = $bindable(),
        signalNoise = $bindable(),
        velocityDimming = $bindable(),
        decay = $bindable()
    } = $props();

    let dialog;
    let isDragging = $state(false);
    let dragStartX = $state(0);
    let dragStartY = $state(0);
    let dialogX = $state(0);
    let dialogY = $state(0);

    export function open() {
        if (dialog) {
            dialog.show();
        }
    }

    function close() {
        if (dialog) {
            dialog.close();
        }
    }

    function startDrag(e) {
        isDragging = true;
        dragStartX = e.clientX - dialogX;
        dragStartY = e.clientY - dialogY;
        e.preventDefault();
    }

    function drag(e) {
        if (!isDragging || !dialog) return;

        // Calculate new position
        let newX = e.clientX - dragStartX;
        let newY = e.clientY - dragStartY;

        // Get dialog dimensions and current position
        const dialogRect = dialog.getBoundingClientRect();

        // Get viewport dimensions
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Constrain to right half of viewport (oscilloscope area)
        // The oscilloscope starts at 50% of viewport width

        // Left boundary: dialog's left edge can touch the middle of viewport (start of oscilloscope)
        const minX = viewportWidth / 2 - dialogRect.left + dialogX;

        // Right boundary: dialog's right edge can touch the right edge of viewport
        const maxX = viewportWidth - dialogRect.right + dialogX;

        // Top boundary: dialog's top edge can touch the top of viewport
        const minY = -dialogRect.top + dialogY;

        // Bottom boundary: dialog's bottom edge can touch the bottom of viewport
        const maxY = viewportHeight - dialogRect.bottom + dialogY;

        // Apply constraints
        dialogX = Math.max(minX, Math.min(maxX, newX));
        dialogY = Math.max(minY, Math.min(maxY, newY));
    }

    function stopDrag() {
        isDragging = false;
    }
</script>

<svelte:window onmousemove={drag} onmouseup={stopDrag} />

<dialog bind:this={dialog} class="physics-dialog" style="transform: translate({dialogX}px, {dialogY}px)">
    <div class="dialog-header" onmousedown={startDrag}>
        <h3>Physics Controls</h3>
        <button class="close-button" onclick={close} onmousedown={(e) => e.stopPropagation()}>✕</button>
    </div>
    <div class="sliders">
        <div class="slider-control">
            <label class="clickable" onclick={() => signalNoise = 0.003}>Noise</label>
            <input type="range" min="0" max="0.2" step="0.001" bind:value={signalNoise} />
            <span class="value">{signalNoise.toFixed(3)}</span>
        </div>
        <div class="slider-control">
            <label class="clickable" onclick={() => coilStrength = 0.60}>Drive Gain</label>
            <input type="range" min="0.01" max="5.0" step="0.01" bind:value={coilStrength} />
            <span class="value">{coilStrength.toFixed(2)}</span>
        </div>
        <div class="slider-control">
            <label class="clickable" onclick={() => beamInertia = 0.10}>Coil Induct</label>
            <input type="range" min="0.01" max="5.0" step="0.01" bind:value={beamInertia} />
            <span class="value">{beamInertia.toFixed(2)}</span>
        </div>
        <div class="slider-control">
            <label class="clickable" onclick={() => fieldDamping = 0.30}>Circuit Resist</label>
            <input type="range" min="0.1" max="0.99" step="0.01" bind:value={fieldDamping} />
            <span class="value">{fieldDamping.toFixed(2)}</span>
        </div>
        <div class="mode-separator"></div>
        <div class="slider-control">
            <label class="clickable" onclick={() => persistence = 0.100}>Persistence</label>
            <input type="range" min="0.0" max="0.95" step="0.005" bind:value={persistence} />
            <span class="value">{persistence.toFixed(3)}</span>
        </div>
        <div class="slider-control">
            <label class="clickable" onclick={() => velocityDimming = 1.0}>Dimming</label>
            <input type="range" min="0" max="1" step="0.01" bind:value={velocityDimming} />
            <span class="value">{velocityDimming.toFixed(2)}</span>
        </div>
        <div class="slider-control">
            <label class="clickable" onclick={() => decay = 512}>Decay</label>
            <input type="range" min="128" max="16384" step="128" bind:value={decay} />
            <span class="value">{decay}</span>
        </div>
        <div class="mode-separator"></div>
        <ToggleSwitch bind:checked={debugMode} label="Debug?" />
        {#if debugMode}
            <div class="renderer-control">
                <label>Renderer</label>
                <select bind:value={rendererType} class="renderer-select">
                    {#each availableRenderers as renderer}
                        <option value={renderer.type} disabled={!renderer.available}>
                            {renderer.name}{renderer.available ? '' : ' (unavailable)'}
                        </option>
                    {/each}
                </select>
            </div>
            {#if pendingRendererType}
                <div class="reload-notice">
                    <span>Switching to {pendingRendererType === 'webgpu' ? 'WebGPU' : 'Canvas 2D'} requires reload</span>
                    <button class="reload-button" onclick={() => onReloadRequested(pendingRendererType)}>
                        Reload Now
                    </button>
                </div>
            {/if}
            <div class="slider-control">
                <label class="clickable" onclick={() => timeSegment = 0.010}>Time Segment</label>
                <input type="range" min="0.001" max="0.050" step="0.001" bind:value={timeSegment} />
                <span class="value">{timeSegment.toFixed(3)}</span>
            </div>
            <div class="slider-control">
                <label class="clickable" onclick={() => dotOpacity = 0.5}>Interpolation</label>
                <input type="range" min="0.0" max="1.0" step="0.01" bind:value={dotOpacity} />
                <span class="value">{dotOpacity.toFixed(2)}</span>
            </div>
            <div class="slider-control">
                <label class="clickable" onclick={() => sampleDotOpacity = 0.0}>Sample Dots</label>
                <input type="range" min="0.0" max="1.0" step="0.01" bind:value={sampleDotOpacity} />
                <span class="value">{sampleDotOpacity.toFixed(2)}</span>
            </div>
            <div class="slider-control">
                <label class="clickable" onclick={() => dotSizeVariation = 1.0}>Angle</label>
                <input type="range" min="1" max="10" step="0.1" bind:value={dotSizeVariation} />
                <span class="value">{dotSizeVariation.toFixed(1)}</span>
            </div>
        {/if}
    </div>
</dialog>

<style>
    .physics-dialog {
        position: fixed;
        top: 20px;
        right: 20px;
        left: auto;
        bottom: auto;
        margin: 0;
        padding: 0;
        background: rgba(26, 26, 26, 0.2);
        border: 1px solid rgba(51, 51, 51, 0.2);
        border-radius: 4px;
        color: #4CAF50;
        min-width: 300px;
        max-width: 400px;
        backdrop-filter: blur(10px);
        transform: none;
        box-shadow: 0px 0px 4px #1c5e20;
        z-index: 1100; /* Above ViewSelector (z-index: 1000) */
    }

    .physics-dialog::backdrop {
        background: transparent;
    }

    .dialog-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 15px;
        border-bottom: 1px solid #333;
        cursor: move;
        user-select: none;
    }

    .dialog-header h3 {
        margin: 0;
        font-family: system-ui;
        font-size: 13px;
        font-weight: 600;
        color: #4CAF50;
    }

    .close-button {
        background: transparent;
        border: none;
        color: #888;
        font-size: 20px;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.2s;
    }

    .close-button:hover {
        color: #4CAF50;
    }

    .sliders {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 15px;
    }

    .mode-separator {
        height: 1px;
        background: #333;
        margin: 10px 0;
    }

    .slider-control {
        display: grid;
        grid-template-columns: 80px 1fr 50px;
        gap: 10px;
        align-items: center;
        transition: opacity 0.2s;
    }

    .slider-control label {
        color: #4CAF50;
        font-family: system-ui;
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
    }

    .slider-control label.clickable {
        cursor: pointer;
        transition: color 0.2s;
    }

    .slider-control label.clickable:hover {
        color: #5db761;
        text-decoration: underline;
    }

    .slider-control .value {
        color: #4CAF50;
        font-family: monospace;
        font-size: 12px;
        font-weight: 600;
        text-align: right;
    }

    .slider-control input[type="range"] {
        width: 100%;
        height: 4px;
        background: #333;
        border-radius: 2px;
        outline: none;
        -webkit-appearance: none;
    }

    .slider-control input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 16px;
        height: 16px;
        background: #4CAF50;
        border-radius: 50%;
        cursor: pointer;
    }

    .slider-control input[type="range"]::-moz-range-thumb {
        width: 16px;
        height: 16px;
        background: #4CAF50;
        border-radius: 50%;
        cursor: pointer;
        border: none;
    }

    .renderer-control {
        display: grid;
        grid-template-columns: 80px 1fr;
        gap: 10px;
        align-items: center;
        margin-bottom: 5px;
    }

    .renderer-control label {
        color: #4CAF50;
        font-family: system-ui;
        font-size: 12px;
        font-weight: 600;
    }

    .renderer-select {
        width: 100%;
        padding: 6px 10px;
        background: #333;
        border: 1px solid #444;
        border-radius: 4px;
        color: #4CAF50;
        font-family: system-ui;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        outline: none;
    }

    .renderer-select:hover {
        border-color: #4CAF50;
    }

    .renderer-select:focus {
        border-color: #4CAF50;
        box-shadow: 0 0 0 1px rgba(76, 175, 80, 0.3);
    }

    .renderer-select option {
        background: #222;
        color: #4CAF50;
    }

    .renderer-select option:disabled {
        color: #666;
    }

    .reload-notice {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        background: rgba(255, 152, 0, 0.15);
        border: 1px solid rgba(255, 152, 0, 0.3);
        border-radius: 4px;
        margin-bottom: 5px;
    }

    .reload-notice span {
        flex: 1;
        color: #ff9800;
        font-family: system-ui;
        font-size: 11px;
    }

    .reload-button {
        padding: 4px 10px;
        background: #ff9800;
        border: none;
        border-radius: 3px;
        color: #000;
        font-family: system-ui;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
    }

    .reload-button:hover {
        background: #ffb74d;
    }

    .checkbox-group {
        grid-template-columns: 104px auto 1fr;
        margin-top: 8px;
    }

    .checkbox-group input[type="checkbox"] {
        width: 18px;
        height: 18px;
        cursor: pointer;
        margin: 6px 0;
    }

    .checkbox-group label {
        cursor: pointer;
        user-select: none;
        color: #4CAF50;
        font-family: system-ui;
        font-size: 12px;
        font-weight: 600;
    }

    .checkbox-group .value-display {
        grid-column: 2 / 4;
        font-size: 11px;
        color: #999;
        font-style: italic;
        margin-top: 0;
    }
</style>

<script>
    import { onMount, onDestroy } from 'svelte';
    import Preview from '../../Common/Preview.svelte';
    import Card from '../../Common/Card.svelte';
    import Button from '../../Common/Button.svelte';
    import ResetIcon from '../../../assets/icons/reset-position.svg?raw';
    import { createDoomRenderer } from '../../../utils/doom/doomGenerator.js';
    import wadUrl from '../../../assets/doom1.wad?url';

    let { audioEngine, frameProcessor, isActive = false, maxRenderDistance = $bindable(1000), depthPreset = $bindable(3), edgeSampleInterval = $bindable(1), doomShowDebug = false } = $props();

    // Track state for use in event handlers (plain object - closures can read mutated properties)
    const handlerState = {
        active: false,
        renderer: null
    };

    $effect(() => {
        handlerState.active = isActive;
    });

    // DOOM state (for Svelte reactivity)
    let doomRenderer = $state(null);
    let availableMaps = $state([]);
    let selectedMap = $state('E1M1');
    let loading = $state(true);
    let error = $state(null);

    // Preview
    let previewPoints = $state([]);
    let animationInterval = null;
    let previewInterval = null;

    // Key press state for button visual feedback (reactive)
    let keyPressed = $state({ up: false, down: false, left: false, right: false });

    // Listen for processed preview updates (e.g. settings changes that re-process cached frame)
    $effect(() => {
        if (isActive) {
            frameProcessor.onPreviewUpdate = () => {
                if (frameProcessor.processedPreview) {
                    previewPoints = frameProcessor.processedPreview;
                }
            };
            return () => {
                frameProcessor.onPreviewUpdate = null;
            };
        }
    });

    // Debug stats - individual $state variables (no self-reference = no loops)
    // Initialize DOOM on mount
    onMount(async () => {
        try {
            const renderer = await createDoomRenderer(wadUrl, selectedMap);
            doomRenderer = renderer;
            handlerState.renderer = renderer;  // Also store for event handlers
            availableMaps = doomRenderer.getAvailableMaps();
            selectedMap = doomRenderer.getCurrentMap();
            loading = false;

            // Setup keyboard controls
            window.addEventListener('keydown', handleKeyDown);
            window.addEventListener('keyup', handleKeyUp);

            // Start preview animation
            startPreviewAnimation();
        } catch (e) {
            console.error('Failed to load DOOM:', e);
            error = e.message;
            loading = false;
        }
    });

    onDestroy(() => {
        stopAnimation();
        stopPreviewAnimation();
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        // Clean up worker
        if (doomRenderer && doomRenderer.destroy) {
            doomRenderer.destroy();
        }
    });

    // Handle keyboard input
    function handleKeyDown(e) {
        if (!handlerState.active || !handlerState.renderer) return;

        switch (e.key) {
            case 'ArrowUp':
            case 'w':
            case 'W':
                handlerState.renderer.keys.up = true;
                keyPressed.up = true;
                e.preventDefault();
                break;
            case 'ArrowDown':
            case 's':
            case 'S':
                handlerState.renderer.keys.down = true;
                keyPressed.down = true;
                e.preventDefault();
                break;
            case 'ArrowLeft':
            case 'a':
            case 'A':
                handlerState.renderer.keys.left = true;
                keyPressed.left = true;
                e.preventDefault();
                break;
            case 'ArrowRight':
            case 'd':
            case 'D':
                handlerState.renderer.keys.right = true;
                keyPressed.right = true;
                e.preventDefault();
                break;
        }
    }

    function handleKeyUp(e) {
        if (!handlerState.renderer) return;

        switch (e.key) {
            case 'ArrowUp':
            case 'w':
            case 'W':
                handlerState.renderer.keys.up = false;
                keyPressed.up = false;
                break;
            case 'ArrowDown':
            case 's':
            case 'S':
                handlerState.renderer.keys.down = false;
                keyPressed.down = false;
                break;
            case 'ArrowLeft':
            case 'a':
            case 'A':
                handlerState.renderer.keys.left = false;
                keyPressed.left = false;
                break;
            case 'ArrowRight':
            case 'd':
            case 'D':
                handlerState.renderer.keys.right = false;
                keyPressed.right = false;
                break;
        }
    }

    // Start/stop animation when tab becomes active
    $effect(() => {
        if (isActive && doomRenderer) {
            startAnimation();
        } else {
            stopAnimation();
        }
    });

    function startAnimation() {
        if (animationInterval) return;

        const fps = 30;
        let lastTime = performance.now();

        animationInterval = setInterval(() => {
            if (!doomRenderer) {
                stopAnimation();
                return;
            }

            const now = performance.now();
            const deltaTime = (now - lastTime) / 1000;
            lastTime = now;

            // Update camera position
            doomRenderer.update(deltaTime);

            // Get rendered points
            const points = doomRenderer.getPoints();

            if (points.length > 0) {
                frameProcessor.processFrame(points);

                // Share points with preview (use processed output when available)
                previewPoints = frameProcessor.processedPreview ?? points;
            }
        }, 1000 / fps);
    }

    function stopAnimation() {
        if (animationInterval) {
            clearInterval(animationInterval);
            animationInterval = null;
        }
    }

    function startPreviewAnimation() {
        const previewFPS = 30;

        previewInterval = setInterval(() => {
            // Animation loop handles updates, points, preview, and stats.
            // This loop reads the latest processed preview for display.
            if (handlerState.renderer && handlerState.active) {
                if (frameProcessor.processedPreview) {
                    previewPoints = frameProcessor.processedPreview;
                }
            }
        }, 1000 / previewFPS);
    }

    function stopPreviewAnimation() {
        if (previewInterval) {
            clearInterval(previewInterval);
            previewInterval = null;
        }
    }

    // Handle map change
    function handleMapChange() {
        if (doomRenderer && selectedMap) {
            try {
                doomRenderer.loadMap(selectedMap);
                previewPoints = doomRenderer.getPoints();
            } catch (e) {
                console.error('Failed to load map:', e);
            }
        }
    }

    // Reset to start position
    function handleReset() {
        if (doomRenderer) {
            doomRenderer.reset();
            previewPoints = doomRenderer.getPoints();
        }
    }

    // Depth buffer resolution presets (used for settings mapping)
    const depthBufferPresets = [
        { label: '80x50 (fastest)', width: 80, height: 50 },
        { label: '160x100 (fast)', width: 160, height: 100 },
        { label: '320x200 (balanced)', width: 320, height: 200 },
        { label: '640x400 (quality)', width: 640, height: 400 }
    ];

    // Debug settings
    let debugDisableDepthTest = $state(false);
    let debugDisableBackfaceCull = $state(false);
    let debugCollision = $state(false);
    let debugHeight = $state(false);
    let debugDisableDedupe = $state(false);
    let debugDisableOptimize = $state(false);
    let dedupeThreshold = $state(25);  // 25 = 0.040 unit tolerance

    function updateRendererSettings() {
        if (doomRenderer && doomRenderer.setRendererSettings) {
            const preset = depthBufferPresets[depthPreset];
            doomRenderer.setRendererSettings({
                maxRenderDistance,
                depthBufferWidth: preset.width,
                depthBufferHeight: preset.height,
                edgeSampleInterval,
                renderFloorsCeilings: true,
                debugDisableDepthTest,
                debugDisableBackfaceCull
            });
        }
    }

    // Update settings when controls change
    $effect(() => {
        // Track all settings to trigger effect
        const _ = [maxRenderDistance, depthPreset, edgeSampleInterval, debugDisableDepthTest, debugDisableBackfaceCull];
        updateRendererSettings();
    });

    // Update collision debug when toggle changes
    $effect(() => {
        if (doomRenderer?.setDebugCollision) {
            doomRenderer.setDebugCollision(debugCollision);
        }
    });

    // Update height debug when toggle changes
    $effect(() => {
        if (doomRenderer?.setDebugHeight) {
            doomRenderer.setDebugHeight(debugHeight);
        }
    });

    // Update dedupe/optimize/renderMode settings when toggles change
    $effect(() => {
        if (doomRenderer?.setOptions) {
            doomRenderer.setOptions({
                deduplicateLines: !debugDisableDedupe,
                optimizeOrder: !debugDisableOptimize,
                dedupeThreshold
            });
        }
    });
</script>

<div class="doom-container">
    {#if loading}
        <div class="loading">
            <p>Loading DOOM...</p>
        </div>
    {:else if error}
        <div class="error">
            <p>Error: {error}</p>
        </div>
    {:else}
        <div class="header">
            <div class="header-controls">
                <select class="map-select" bind:value={selectedMap} onchange={handleMapChange}>
                    {#each availableMaps as map}
                        <option value={map}>Map {map}</option>
                    {/each}
                </select>
            </div>

            <Preview points={previewPoints} width={400} height={400} />
        </div>

        <div class="nav-grid">
            <div class="nav-row">
                <div class="nav-cell"></div>
                <button
                    class="nav-button"
                    class:pressed={keyPressed.up}
                    onmousedown={() => handlerState.renderer && (handlerState.renderer.keys.up = true)}
                    onmouseup={() => handlerState.renderer && (handlerState.renderer.keys.up = false)}
                    onmouseleave={() => handlerState.renderer && (handlerState.renderer.keys.up = false)}
                    ontouchstart={() => handlerState.renderer && (handlerState.renderer.keys.up = true)}
                    ontouchend={() => handlerState.renderer && (handlerState.renderer.keys.up = false)}
                >▲</button>
                <div class="nav-cell"></div>
            </div>
            <div class="nav-row">
                <button
                    class="nav-button"
                    class:pressed={keyPressed.left}
                    onmousedown={() => handlerState.renderer && (handlerState.renderer.keys.left = true)}
                    onmouseup={() => handlerState.renderer && (handlerState.renderer.keys.left = false)}
                    onmouseleave={() => handlerState.renderer && (handlerState.renderer.keys.left = false)}
                    ontouchstart={() => handlerState.renderer && (handlerState.renderer.keys.left = true)}
                    ontouchend={() => handlerState.renderer && (handlerState.renderer.keys.left = false)}
                >◀</button>
                <button
                    class="nav-button"
                    class:pressed={keyPressed.down}
                    onmousedown={() => handlerState.renderer && (handlerState.renderer.keys.down = true)}
                    onmouseup={() => handlerState.renderer && (handlerState.renderer.keys.down = false)}
                    onmouseleave={() => handlerState.renderer && (handlerState.renderer.keys.down = false)}
                    ontouchstart={() => handlerState.renderer && (handlerState.renderer.keys.down = true)}
                    ontouchend={() => handlerState.renderer && (handlerState.renderer.keys.down = false)}
                >▼</button>
                <button
                    class="nav-button"
                    class:pressed={keyPressed.right}
                    onmousedown={() => handlerState.renderer && (handlerState.renderer.keys.right = true)}
                    onmouseup={() => handlerState.renderer && (handlerState.renderer.keys.right = false)}
                    onmouseleave={() => handlerState.renderer && (handlerState.renderer.keys.right = false)}
                    ontouchstart={() => handlerState.renderer && (handlerState.renderer.keys.right = true)}
                    ontouchend={() => handlerState.renderer && (handlerState.renderer.keys.right = false)}
                >▶</button>
            </div>
        </div>

        <div class="reset-row">
            <Button variant="secondary" onclick={handleReset}>{@html ResetIcon}Reset</Button>
        </div>

        {#if doomShowDebug}
        <Card title="Debug">
            <div class="settings-grid">
                <label class="checkbox-row">
                    <input type="checkbox" bind:checked={debugDisableDepthTest} />
                    <span>Disable depth testing</span>
                    <span class="hint">Show all edges</span>
                </label>
                <label class="checkbox-row">
                    <input type="checkbox" bind:checked={debugDisableBackfaceCull} />
                    <span>Disable backface culling</span>
                    <span class="hint">Show back-facing polygons</span>
                </label>
                <label class="checkbox-row">
                    <input type="checkbox" bind:checked={debugCollision} />
                    <span>Log collisions</span>
                    <span class="hint">Wall/step blocking</span>
                </label>
                <label class="checkbox-row">
                    <input type="checkbox" bind:checked={debugHeight} />
                    <span>Log height changes</span>
                    <span class="hint">Steps up/down</span>
                </label>
                <label class="checkbox-row">
                    <input type="checkbox" bind:checked={debugDisableDedupe} />
                    <span>Disable line deduplication</span>
                    <span class="hint">Show duplicate edges</span>
                </label>
                {#if !debugDisableDedupe}
                    <div class="slider-row">
                        <span class="slider-label">Dedupe threshold</span>
                        <input
                            type="range"
                            min="1"
                            max="1000"
                            step="1"
                            bind:value={dedupeThreshold}
                        />
                        <span class="slider-value">{(1 / dedupeThreshold).toFixed(3)}</span>
                        <span class="hint">Tolerance (lower = stricter)</span>
                    </div>
                {/if}
                <label class="checkbox-row">
                    <input type="checkbox" bind:checked={debugDisableOptimize} />
                    <span>Disable path optimization</span>
                    <span class="hint">No beam jump minimize</span>
                </label>
                <button class="debug-button" onclick={() => doomRenderer?.triggerDebugCapture()}>
                    Capture Debug Frame
                </button>
            </div>
        </Card>
        {/if}

    {/if}
</div>

<style>
    .doom-container {
        padding: 24px 40px;
        display: flex;
        flex-direction: column;
        gap: 20px;
    }

    .header {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
    }

    .header-controls {
        display: flex;
        gap: 12px;
        align-items: center;
    }

    .map-select {
        border: 2px solid #ccc;
    }

    .loading, .error {
        text-align: center;
        padding: 40px;
    }

    .error {
        color: #d32f2f;
    }

    .reset-row {
        display: flex;
        justify-content: center;
    }

    .nav-grid {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        margin: 28px 0 10px;
    }

    .nav-row {
        display: flex;
        gap: 6px;
    }

    .nav-cell {
        width: 48px;
        height: 48px;
    }

    .nav-button {
        display: grid;
        inset: 0;

        box-shadow: inset 0 -4px 0 0 #bbb;
        padding-bottom: 4px;

        width: 48px;
        height: 48px;
        border-radius: 6px;
        background: #eee;
        font-size: 20px;
        color: #888;
        cursor: pointer;
        transition: all 0.1s;
        user-select: none;
        -webkit-user-select: none;
        touch-action: manipulation;
    }

    .nav-button:active,
    .nav-button.pressed {
        margin-top: 3px;
        height: 45px;
        box-shadow: inset 0 -1px 0 0 #ccc;
        padding-bottom: 1px;
    }

    .nav-button:focus {
        outline: none;
    }

    .settings-grid {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .checkbox-row {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        padding-top: 4px;
    }

    .checkbox-row input[type="checkbox"] {
        width: 16px;
        height: 16px;
        cursor: pointer;
    }

    .checkbox-row span:first-of-type {
        font-size: 13px;
        color: #333;
    }

    .checkbox-row .hint {
        font-size: 11px;
        color: #888;
        text-align: right;
    }

    .slider-row {
        display: grid;
        grid-template-columns: auto 1fr auto auto;
        align-items: center;
        gap: 8px;
        padding: 4px 0 4px 24px;
    }

    .slider-row .slider-label {
        font-size: 12px;
        color: #666;
    }

    .slider-row input[type="range"] {
        width: 100%;
    }

    .slider-row .slider-value {
        font-size: 12px;
        color: #333;
        min-width: 40px;
        text-align: right;
        font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
    }

    .slider-row .hint {
        font-size: 11px;
        color: #888;
    }

    .debug-button {
        margin-top: 8px;
        padding: 8px 12px;
        border: 1px solid #ddd;
        border-radius: 6px;
        background: #f5f5f5;
        font-size: 12px;
        font-family: inherit;
        cursor: pointer;
        transition: background 0.2s;
    }

    .debug-button:hover {
        background: #e0e0e0;
    }
</style>

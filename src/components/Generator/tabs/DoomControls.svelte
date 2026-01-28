<script>
    import { onMount, onDestroy } from 'svelte';
    import { get } from 'svelte/store';
    import Preview from '../../Common/Preview.svelte';
    import Card from '../../Common/Card.svelte';
    import Button from '../../Common/Button.svelte';
    import ResetIcon from '../../../assets/icons/reset-position.svg?raw';
    import { createDoomRenderer } from '../../../utils/doom/doomGenerator.js';
    import wadUrl from '../../../assets/doom1.wad?url';

    let { audioEngine, isActive = false, renderMode = 'frequency', pointSpacing = 0.02, maxRenderDistance = $bindable(1000), depthPreset = $bindable(3), edgeSampleInterval = $bindable(1), doomShowDebug = false } = $props();
    let isPlaying = audioEngine.isPlaying;

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

    // Debug stats - individual $state variables (no self-reference = no loops)
    let currentLineCount = $state(0);
    let currentPointCount = $state(0);
    let currentPathLength = $state(0);
    const SAMPLE_RATE = 48000; // Assumed audio sample rate

    // Derived: effective audio/trace FPS based on render mode
    let audioFps = $derived(() => {
        if (renderMode === 'frequency') {
            return audioEngine.baseFrequency || 100;
        } else if (renderMode === 'points') {
            // Use effective (resampled) point count for accurate FPS calculation
            const ptCount = effectivePointCount();
            if (ptCount <= 0) return 0;
            return SAMPLE_RATE / ptCount;
        }
        return 0;
    });

    // Helper to calculate geometric path length from points
    function calculatePathLength(points) {
        if (!points || points.length === 0) return 0;

        let totalLength = 0;
        const segments = Array.isArray(points[0]) && Array.isArray(points[0][0])
            ? points
            : [points];

        for (const segment of segments) {
            for (let i = 1; i < segment.length; i++) {
                const dx = segment[i][0] - segment[i - 1][0];
                const dy = segment[i][1] - segment[i - 1][1];
                totalLength += Math.sqrt(dx * dx + dy * dy);
            }
        }
        return totalLength;
    }

    // Calculate resampled point count (matching AudioEngine's resampleSegment logic)
    function calculateResampledPointCount(pathLength, spacing) {
        if (pathLength <= 0 || spacing <= 0) return 0;
        // Each segment adds approximately pathLength/spacing points, plus start/end points
        // This matches the behavior of AudioEngine.resampleSegment()
        return Math.ceil(pathLength / spacing) + 1;
    }

    // Effective point count for stats - uses resampled count in 'points' mode
    let effectivePointCount = $derived(() => {
        if (renderMode === 'points' && currentPathLength > 0) {
            return calculateResampledPointCount(currentPathLength, pointSpacing);
        }
        return currentPointCount;
    });

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

    // Start/stop animation when tab becomes active and audio is playing
    $effect(() => {
        if ($isPlaying && isActive && doomRenderer) {
            startAnimation();
        } else {
            stopAnimation();
        }
    });

    function startAnimation() {
        if (animationInterval) return;

        // Clear any existing clock interval
        audioEngine.clearClockInterval();
        audioEngine.restoreDefaultFrequency();

        // Mark as continuous generator (don't store frames for refresh)
        audioEngine.setContinuousGenerator(true);

        const fps = 30;
        let lastTime = performance.now();

        animationInterval = setInterval(() => {
            if (!get(audioEngine.isPlaying) || !doomRenderer) {
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
                audioEngine.createWaveform(points);

                // Update stats
                currentLineCount = Array.isArray(points[0]) && Array.isArray(points[0][0])
                    ? points.length
                    : 1;
                currentPointCount = Array.isArray(points[0]) && Array.isArray(points[0][0])
                    ? points.reduce((sum, seg) => sum + seg.length, 0)
                    : points.length;
                currentPathLength = calculatePathLength(points);
            }
        }, 1000 / fps);
    }

    function stopAnimation() {
        if (animationInterval) {
            clearInterval(animationInterval);
            animationInterval = null;
        }
        // Reset continuous generator flag when stopping
        audioEngine.setContinuousGenerator(false);
    }

    function startPreviewAnimation() {
        const previewFPS = 30;
        const previewDelta = 1 / previewFPS;

        previewInterval = setInterval(() => {
            if (handlerState.renderer && handlerState.active) {
                // Only update camera for preview if not playing audio
                if (!get(audioEngine.isPlaying)) {
                    handlerState.renderer.update(previewDelta);
                }
                const points = handlerState.renderer.getPoints();
                previewPoints = points;

                // Update stats for preview (only when not streaming)
                if (!get(audioEngine.isPlaying) && points.length > 0) {
                    currentLineCount = Array.isArray(points[0]) && Array.isArray(points[0][0])
                        ? points.length
                        : 1;
                    currentPointCount = Array.isArray(points[0]) && Array.isArray(points[0][0])
                        ? points.reduce((sum, seg) => sum + seg.length, 0)
                        : points.length;
                    currentPathLength = calculatePathLength(points);
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
                dedupeThreshold,
                renderMode
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
                <Button variant="secondary" onclick={handleReset}>{@html ResetIcon}Reset</Button>
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

        <div class="stats-bar">
            <div class="stat">
                <span class="stat-label">Segments</span>
                <span class="stat-value">{currentLineCount}</span>
            </div>
            <div class="stat">
                <span class="stat-label">Points</span>
                <span class="stat-value">{effectivePointCount()}</span>
            </div>
            <div class="stat">
                <span class="stat-label">Audio FPS</span>
                <span class="stat-value">{audioFps().toFixed(1)}</span>
            </div>
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

    .stats-bar {
        display: flex;
        justify-content: center;
        gap: 24px;
        padding: 8px 16px;
        background: #f5f5f5;
        border-radius: 8px;
        font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
        width: fit-content;
        align-self: center;
        box-sizing: border-box;
    }

    .stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
    }

    .stat-label {
        font-size: 9px;
        color: #888;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .stat-value {
        font-size: 16px;
        font-weight: 600;
        color: #333;
    }

    .stat-value.active {
        color: #4caf50;
    }

    .loading, .error {
        text-align: center;
        padding: 40px;
    }

    .error {
        color: #d32f2f;
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

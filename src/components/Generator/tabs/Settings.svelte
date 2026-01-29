<script>
    import Card from '../../Common/Card.svelte';
    import TabBar from '../../Common/TabBar.svelte';

    let { audioEngine, activeTab, statSegments = 0, statPoints = 0, svgAnimationFPS = $bindable(30), svgSamplePoints = $bindable(200), svgDoubleDraw = $bindable(false), renderMode = $bindable('frequency'), pointSpacing = $bindable(0.02), resampleMode = $bindable('proportional'), optimizeOrder = $bindable(true), trackBeamPosition = $bindable(true), frequency = $bindable(100), rotation = $bindable(0), doomMaxRenderDistance = $bindable(1000), doomDepthPreset = $bindable(3), doomEdgeSampleInterval = $bindable(1), doomShowDebug = $bindable(false), dinoShowDebug = $bindable(false), dinoSceneScale = $bindable(1.25), dinoSimplifySprites = $bindable(true) } = $props();

    // Render mode tabs
    const renderModeTabs = [
        { id: 'frequency', label: 'Fixed' },
        { id: 'points', label: 'Variable' }
    ];

    // Resample mode tabs
    const resampleModeTabs = [
        { id: 'off', label: 'Off' },
        { id: 'uniform', label: 'Uniform' },
        { id: 'proportional', label: 'Proportional' }
    ];

    // Dino scene scale tabs
    const dinoScaleTabs = [
        { id: 0.75, label: '75%' },
        { id: 1.0, label: '100%' },
        { id: 1.25, label: '125%' }
    ];

    let volume = $state(30);

    const SAMPLE_RATE = 48000;

    // Audio FPS display
    let audioFpsDisplay = $derived.by(() => {
        if (renderMode === 'frequency') {
            return Number(frequency).toFixed(1);
        }
        if (statPoints <= 0) return '0.0';
        return (SAMPLE_RATE / statPoints).toFixed(1);
    });

    // Waves tab has its own frequency system, so disable frame rate controls
    let isWavesTab = $derived(activeTab === 'waves');

    // SVG settings only apply to draw and svg tabs
    let isSvgTab = $derived(activeTab === 'draw' || activeTab === 'svg');

    // Doom settings only apply to doom tab
    let isDoomTab = $derived(activeTab === 'doom');

    // Dino settings only apply to dino tab
    let isDinoTab = $derived(activeTab === 'dino');

    // Depth buffer resolution presets
    const depthBufferPresets = [
        { label: '80x50 (fastest)', width: 80, height: 50 },
        { label: '160x100 (fast)', width: 160, height: 100 },
        { label: '320x200 (balanced)', width: 320, height: 200 },
        { label: '640x400 (quality)', width: 640, height: 400 }
    ];

    function updateFrequency(value) {
        frequency = value;
    }

    function updateVolume(value) {
        volume = value;
        audioEngine.setVolume(value);
    }

    function updateRotation(value) {
        rotation = value;
    }

    function updateRenderMode(mode) {
        renderMode = mode;
    }

    function updatePointSpacing(value) {
        pointSpacing = value;
    }
</script>

<div class="settings-container">
    {#if !isWavesTab}
        <div class="stats-bar">
            <div class="stat">
                <span class="stat-label">Segments</span>
                <span class="stat-value">{statSegments}</span>
            </div>
            <div class="stat">
                <span class="stat-label">Points</span>
                <span class="stat-value">{statPoints}</span>
            </div>
            <div class="stat">
                <span class="stat-label">Audio FPS</span>
                <span class="stat-value">{audioFpsDisplay}</span>
            </div>
        </div>
    {/if}

    <Card title="Output">
        <div class="card-controls">
            <div class="control-group tab-group" class:disabled={isWavesTab}>
                <label>Frame Rate</label>
                <div class="tabbar-wrapper">
                    <TabBar
                        tabs={renderModeTabs}
                        activeTab={renderMode}
                        onTabChange={(mode) => !isWavesTab && updateRenderMode(mode)}
                    />
                </div>
                <span></span>
            </div>

            {#if renderMode === 'frequency'}
                <div class="control-group" class:disabled={isWavesTab}>
                    <label for="frequency" class="clickable" onclick={() => !isWavesTab && updateFrequency(100)}>Frequency</label>
                    <input
                        type="range"
                        id="frequency"
                        min="20"
                        max="500"
                        value={frequency}
                        step="1"
                        disabled={isWavesTab}
                        oninput={(e) => updateFrequency(e.target.value)}
                    >
                    <span class="value">{frequency} Hz</span>
                    <div class="value-display">Unstable image, more details ⭤ Stable, less details</div>
                </div>
            {:else if renderMode === 'points'}
                <div class="control-group" class:disabled={isWavesTab}>
                    <label for="pointSpacing" class="clickable" onclick={() => !isWavesTab && updatePointSpacing(0.02)}>Point Spacing</label>
                    <input
                        type="range"
                        id="pointSpacing"
                        min="0.005"
                        max="0.1"
                        value={pointSpacing}
                        step="0.005"
                        disabled={isWavesTab}
                        oninput={(e) => updatePointSpacing(e.target.value)}
                    >
                    <span class="value">{pointSpacing}</span>
                    <div class="value-display">Unstable image, more details ⭤ Stable, less details</div>
                </div>
            {/if}

            <div class="control-group">
                <label for="rotation" class="clickable" onclick={() => updateRotation(0)}>Rotation</label>
                <input
                    type="range"
                    id="rotation"
                    min="0"
                    max="360"
                    value={rotation}
                    step="1"
                    oninput={(e) => updateRotation(e.target.value)}
                >
                <span class="value">{rotation}°</span>
            </div>

            <div class="control-group">
                <label for="volume" class="clickable" onclick={() => updateVolume(30)}>Volume</label>
                <input
                    type="range"
                    id="volume"
                    min="0"
                    max="100"
                    value={volume}
                    step="1"
                    oninput={(e) => updateVolume(e.target.value)}
                >
                <span class="value">{volume}%</span>
            </div>
        </div>
    </Card>

    {#if !isWavesTab}
        <Card title="Processing">
            <div class="card-controls">
                <div class="control-group tab-group">
                    <label>Resample</label>
                    <div class="tabbar-wrapper">
                        <TabBar
                            tabs={resampleModeTabs}
                            activeTab={resampleMode}
                            onTabChange={(mode) => resampleMode = mode}
                        />
                    </div>
                    <span></span>
                </div>

                <div class="control-group checkbox-group">
                    <label for="optimizeOrder">Optimize Order</label>
                    <input
                        type="checkbox"
                        id="optimizeOrder"
                        bind:checked={optimizeOrder}
                    >
                </div>

                {#if optimizeOrder}
                    <div class="control-group checkbox-group">
                        <label for="trackBeamPosition">Track Beam</label>
                        <input
                            type="checkbox"
                            id="trackBeamPosition"
                            bind:checked={trackBeamPosition}
                        >
                    </div>
                {/if}
            </div>
        </Card>
    {/if}

    {#if isSvgTab}
        <Card title="SVG">
            <div class="card-controls">
                <div class="control-group">
                    <label for="svgSamplePoints" class="clickable" onclick={() => svgSamplePoints = 200}>Sample Points</label>
                    <input
                        type="range"
                        id="svgSamplePoints"
                        min="50"
                        max="1000"
                        bind:value={svgSamplePoints}
                        step="50"
                    >
                    <span class="value">{svgSamplePoints}</span>
                </div>

                <div class="control-group">
                    <label for="svgAnimationFPS" class="clickable" onclick={() => svgAnimationFPS = 30}>Sampling rate</label>
                    <input
                        type="range"
                        id="svgAnimationFPS"
                        min="10"
                        max="60"
                        bind:value={svgAnimationFPS}
                        step="5"
                    >
                    <span class="value">{svgAnimationFPS} FPS</span>
                </div>

                <div class="control-group checkbox-group">
                    <label for="svgDoubleDraw">Double draw</label>
                    <input
                        type="checkbox"
                        id="svgDoubleDraw"
                        bind:checked={svgDoubleDraw}
                    >
                </div>
            </div>
        </Card>
    {/if}

    {#if isDoomTab}
        <Card title="Doom">
            <div class="card-controls">
                <div class="control-group">
                    <label for="doomMaxRenderDistance" class="clickable" onclick={() => doomMaxRenderDistance = 1000}>Max Distance</label>
                    <input
                        type="range"
                        id="doomMaxRenderDistance"
                        min="0"
                        max="5000"
                        bind:value={doomMaxRenderDistance}
                        step="100"
                    >
                    <span class="value">{doomMaxRenderDistance === 0 ? 'Off' : doomMaxRenderDistance}</span>
                </div>

                <div class="control-group">
                    <label for="doomDepthPreset" class="clickable" onclick={() => doomDepthPreset = 3}>Depth Buffer</label>
                    <select id="doomDepthPreset" bind:value={doomDepthPreset}>
                        {#each depthBufferPresets as preset, i}
                            <option value={i}>{preset.label}</option>
                        {/each}
                    </select>
                </div>

                <div class="control-group">
                    <label for="doomEdgeSampleInterval" class="clickable" onclick={() => doomEdgeSampleInterval = 1}>Edge Sampling</label>
                    <input
                        type="range"
                        id="doomEdgeSampleInterval"
                        min="1"
                        max="8"
                        bind:value={doomEdgeSampleInterval}
                        step="0.5"
                    >
                    <span class="value">{doomEdgeSampleInterval}px</span>
                </div>

                <div class="control-group checkbox-group">
                    <label for="doomShowDebug">Show Debug</label>
                    <input
                        type="checkbox"
                        id="doomShowDebug"
                        bind:checked={doomShowDebug}
                    >
                    <span></span>
                </div>
            </div>
        </Card>
    {/if}

    {#if isDinoTab}
        <Card title="Dino">
            <div class="card-controls">
                <div class="control-group tab-group">
                    <label>Scale</label>
                    <div class="tabbar-wrapper">
                        <TabBar
                            tabs={dinoScaleTabs}
                            activeTab={dinoSceneScale}
                            onTabChange={(scale) => dinoSceneScale = scale}
                        />
                    </div>
                </div>

                <div class="control-group checkbox-group">
                    <label for="dinoSimplifySprites">Simplified</label>
                    <input
                        type="checkbox"
                        id="dinoSimplifySprites"
                        bind:checked={dinoSimplifySprites}
                    >
                </div>

                <div class="control-group checkbox-group">
                    <label for="dinoShowDebug">Show Debug</label>
                    <input
                        type="checkbox"
                        id="dinoShowDebug"
                        bind:checked={dinoShowDebug}
                    >
                </div>
            </div>
        </Card>
    {/if}
</div>

<style>
    .settings-container {
        display: flex;
        flex-direction: column;
        width: 450px;
        gap: 15px;
    }

    .stats-bar {
        display: flex;
        justify-content: center;
        gap: 24px;
        padding: 10px 16px;
        background: #f5f5f5;
        border-radius: 8px;
        font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
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

    .card-controls {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .control-group {
        display: grid;
        grid-template-columns: 112px 1fr 50px;
        align-items: center;
        gap: 0 12px;
        margin: 0;
        padding: 0;
    }

    .control-group label {
        font-size: 11px;
        font-weight: 600;
        color: #666;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        white-space: nowrap;
        text-align: right;
        margin: 0;
        padding: 0;
    }

    .control-group label.clickable {
        cursor: pointer;
        user-select: none;
    }

    .control-group label.clickable:hover {
        color: #333;
    }

    .control-group .value {
        font-size: 9pt;
        color: #666;
        white-space: nowrap;
        text-align: left;
    }

    .control-group input[type="range"] {
        width: 100%;
    }

    .control-group select {
        border: 1px solid #ccc;
        position: relative;
        top: 12px;        
        margin-bottom: 20px;
    }

    .value-display {
        grid-column: 2 / 4;
        font-size: 11px;
        color: #999;
        font-style: italic;
        margin-top: 0;
    }

    .checkbox-group {
        grid-template-columns: 112px auto 1fr;
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
    }

    .checkbox-group .value-display {
        grid-column: 2 / 4;
    }

    .tab-group {
        grid-template-columns: 112px 1fr auto;
    }

    .tabbar-wrapper {
        display: flex;
        position: relative;
        top: 8px;
        margin-bottom: 16px;
    }

    .tabbar-wrapper :global(.tab-bar) {
        background: #e8e8e8;
    }

    .tabbar-wrapper :global(.tab) {
        padding: 6px 16px;
        min-height: 32px;
        font-size: 12px;
    }

    .control-group.disabled label {
        color: #bbb;
        cursor: default;
    }

    .control-group.disabled .value {
        color: #bbb;
    }

    .control-group.disabled .tabbar-wrapper {
        opacity: 0.5;
        pointer-events: none;
    }

    .control-group.disabled input[type="range"] {
        opacity: 0.4;
        cursor: default;
    }
</style>

<script>
    import { untrack } from 'svelte';
    import { Icon } from 'svelte-icon';
    import rotateIcon from '../../assets/icons/glyph/rotate.svg?raw';
    import resizeIcon from '../../assets/icons/glyph/resize.svg?raw';
    import keystoneVIcon from '../../assets/icons/glyph/keystone-vertical.svg?raw';
    import keystoneHIcon from '../../assets/icons/glyph/keystone-horizontal.svg?raw';
    import barrelHIcon from '../../assets/icons/glyph/barrel-horizontal.svg?raw';
    import barrelVIcon from '../../assets/icons/glyph/barrel-vertical.svg?raw';
    import moveHIcon from '../../assets/icons/glyph/move-horizontal.svg?raw';
    import moveVIcon from '../../assets/icons/glyph/move-vertical.svg?raw';
    import ToggleSwitch from '../Common/ToggleSwitch.svelte';

    let {
        laserRenderer,
        laserMode = 'scope',
        onModeChange = () => {},
        onDisconnect = () => {}
    } = $props();

    // Dragging
    let panel;
    let isDragging = $state(false);
    let dragStartX = $state(0);
    let dragStartY = $state(0);
    let panelX = $state(0);
    let panelY = $state(0);

    function startDrag(e) {
        isDragging = true;
        dragStartX = e.clientX - panelX;
        dragStartY = e.clientY - panelY;
        e.preventDefault();
    }

    function drag(e) {
        if (!isDragging || !panel) return;
        let newX = e.clientX - dragStartX;
        let newY = e.clientY - dragStartY;
        const rect = panel.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const minX = -rect.left + panelX;
        const maxX = vw - rect.right + panelX;
        const minY = -rect.top + panelY;
        const maxY = vh - rect.bottom + panelY;
        panelX = Math.max(minX, Math.min(maxX, newX));
        panelY = Math.max(minY, Math.min(maxY, newY));
    }

    function stopDrag() {
        isDragging = false;
    }

    // Settings (synced from renderer)
    let pps = $state(30000);
    let targetFps = $state(30);
    let intensity = $state(1.0);
    let colorR = $state(0);
    let colorG = $state(255);
    let colorB = $state(0);
    let invertX = $state(true);
    let invertY = $state(true);
    let swapXY = $state(false);
    const safetyBorder = 0.05;
    let blankingPoints = $state(15);
    let blankingDwell = $state(5);
    let cornerDwell = $state(3);

    // Calibration: intuitive parameters (center = no transform)
    let calRotate = $state(0);      // degrees, center=0
    let calScale = $state(1.0);     // multiplier, center=1.0
    let calTopBottom = $state(0);   // -1..1, center=0, positive=top wider
    let calLeftRight = $state(0);   // -1..1, center=0, positive=left wider
    let pincushionH = $state(0);    // -1..1, horizontal barrel/pincushion
    let pincushionV = $state(0);    // -1..1, vertical barrel/pincushion
    let offsetX = $state(0);        // -1..1, horizontal shift
    let offsetY = $state(0);        // -1..1, vertical shift

    // Section toggles (only one at a time)
    let showSection = $state(null); // null | 'calibration' | 'debug'

    function toggleSection(section) {
        showSection = showSection === section ? null : section;
    }

    // Debug stats polling (renderer objects aren't reactive)
    let debugStats = $state({ pps: '-', targetFps: '-', targetPts: '-', inputPts: '-', outputPts: '-' });
    $effect(() => {
        if (showSection !== 'debug') return;
        const iv = setInterval(() => {
            if (!laserRenderer) return;
            const s = laserRenderer.settings;
            const st = laserRenderer.stats;
            debugStats = {
                pps: s.pps,
                targetFps: s.targetFps ?? 30,
                targetPts: Math.floor(s.pps / (s.targetFps || 30)),
                inputPts: st.inputPoints ?? '-',
                outputPts: st.pointsPerFrame ?? '-'
            };
        }, 250);
        return () => clearInterval(iv);
    });

    // Manual calibration mode
    let manualCal = $state(false);
    let manualCorners = $state({
        topLeft: { x: 0, y: 0 },
        topRight: { x: 1, y: 0 },
        bottomLeft: { x: 0, y: 1 },
        bottomRight: { x: 1, y: 1 }
    });
    let draggingCorner = $state(null);

    function startCornerDrag(cornerName, e) {
        if (!manualCal) {
            // Auto-enable manual mode, initialize from current sliders
            manualCal = true;
            manualCorners = computeCorners(calRotate, calScale, calTopBottom, calLeftRight);
            saveToStorage();
        }
        draggingCorner = cornerName;
        e.preventDefault();
        e.stopPropagation();
    }

    function dragCorner(e) {
        if (!draggingCorner) return;
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        // Map pixel position to viewBox coordinates (-20 to 120), then to 0..1 range
        const vbX = ((e.clientX - rect.left) / rect.width) * 140 - 20;
        const vbY = ((e.clientY - rect.top) / rect.height) * 140 - 20;
        let x = vbX / 100;
        let y = vbY / 100;
        // Reverse the preview transforms (swap, then inversions)
        if (swapXY) [x, y] = [y, x];
        if (invertX) x = 1 - x;
        if (invertY) y = 1 - y;
        manualCorners = { ...manualCorners, [draggingCorner]: { x, y } };
        applyManualCalibration();
    }

    function stopCornerDrag() {
        draggingCorner = null;
    }

    function applyManualCalibration() {
        if (!laserRenderer) return;
        laserRenderer.calibration.setCorners(manualCorners);
        laserRenderer.calibrationParams = null;
        saveToStorage();
    }

    function resetManualCal() {
        manualCal = false;
        applyCalibration();
        saveToStorage();
    }

    // Reactive preview corners (with axis inversions and swap applied)
    let previewCorners = $derived.by(() => {
        const raw = manualCal ? manualCorners : computeCorners(calRotate, calScale, calTopBottom, calLeftRight);
        const transform = (p) => {
            let x = p.x, y = p.y;
            if (invertX) x = 1 - x;
            if (invertY) y = 1 - y;
            if (swapXY) [x, y] = [y, x];
            return { x, y };
        };
        return {
            topLeft: transform(raw.topLeft),
            topRight: transform(raw.topRight),
            bottomLeft: transform(raw.bottomLeft),
            bottomRight: transform(raw.bottomRight)
        };
    });

    // Generate distorted outline path (barrel distortion applied to quad edges)
    let previewPath = $derived.by(() => {
        const c = previewCorners;
        const edges = [
            [c.topLeft, c.topRight],
            [c.topRight, c.bottomRight],
            [c.bottomRight, c.bottomLeft],
            [c.bottomLeft, c.topLeft]
        ];
        const steps = 20;
        const points = [];
        for (const [from, to] of edges) {
            for (let i = 0; i < steps; i++) {
                const t = i / steps;
                let x = from.x + (to.x - from.x) * t;
                let y = from.y + (to.y - from.y) * t;
                // Apply barrel distortion in centered 0..1 space
                if (pincushionH !== 0 || pincushionV !== 0) {
                    const cx = x - 0.5, cy = y - 0.5;
                    const r2 = cx * cx + cy * cy;
                    x = 0.5 + cx * (1 + pincushionH * r2 * 0.4);
                    y = 0.5 + cy * (1 + pincushionV * r2 * 0.4);
                }
                points.push(`${x * 100},${y * 100}`);
            }
        }
        return 'M' + points.join(' L') + ' Z';
    });

    const STORAGE_KEY = 'laser-settings';

    function saveToStorage() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                pps, targetFps, intensity, colorR, colorG, colorB,
                invertX, invertY, swapXY,
                blankingPoints, blankingDwell, cornerDwell,
                calRotate, calScale, calTopBottom, calLeftRight,
                pincushionH, pincushionV,
                offsetX, offsetY,
                manualCal, manualCorners
            }));
        } catch (e) { /* ignore */ }
    }

    function loadFromStorage() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (!saved) return false;
            pps = saved.pps ?? pps;
            targetFps = saved.targetFps ?? targetFps;
            intensity = saved.intensity ?? intensity;
            colorR = saved.colorR ?? colorR;
            colorG = saved.colorG ?? colorG;
            colorB = saved.colorB ?? colorB;
            invertX = saved.invertX ?? invertX;
            invertY = saved.invertY ?? invertY;
            swapXY = saved.swapXY ?? swapXY;
            blankingPoints = saved.blankingPoints ?? blankingPoints;
            blankingDwell = saved.blankingDwell ?? blankingDwell;
            cornerDwell = saved.cornerDwell ?? cornerDwell;
            calRotate = saved.calRotate ?? calRotate;
            calScale = saved.calScale ?? calScale;
            calTopBottom = saved.calTopBottom ?? calTopBottom;
            calLeftRight = saved.calLeftRight ?? calLeftRight;
            pincushionH = saved.pincushionH ?? pincushionH;
            pincushionV = saved.pincushionV ?? pincushionV;
            offsetX = saved.offsetX ?? offsetX;
            offsetY = saved.offsetY ?? offsetY;
            manualCal = saved.manualCal ?? manualCal;
            if (saved.manualCorners) manualCorners = saved.manualCorners;
            return true;
        } catch (e) { return false; }
    }

    // Sync from renderer on mount, then apply saved settings
    let initialized = false;
    $effect(() => {
        if (laserRenderer && !initialized) {
            initialized = true;
            untrack(() => {
                if (loadFromStorage()) {
                    applySettings();
                    if (manualCal) {
                        applyManualCalibration();
                    } else {
                        applyCalibration();
                    }
                } else {
                    const s = laserRenderer.settings;
                    pps = s.pps;
                    intensity = s.intensity;
                    colorR = s.color.r;
                    colorG = s.color.g;
                    colorB = s.color.b;
                    invertX = s.invertX;
                    invertY = s.invertY;
                    swapXY = s.swapXY;
                    blankingPoints = s.blankingPoints;
                    blankingDwell = s.blankingDwell;
                    cornerDwell = s.cornerDwell;
                    pincushionH = s.pincushionH || 0;
                    pincushionV = s.pincushionV || 0;
                    offsetX = s.offsetX || 0;
                    offsetY = s.offsetY || 0;
                    if (laserRenderer.calibrationParams) {
                        calRotate = laserRenderer.calibrationParams.rotate;
                        calScale = laserRenderer.calibrationParams.scale;
                        calTopBottom = laserRenderer.calibrationParams.topBottom;
                        calLeftRight = laserRenderer.calibrationParams.leftRight;
                    }
                }
            });
        }
    });

    function applySettings() {
        if (!laserRenderer) return;
        laserRenderer.updateSettings({
            pps, targetFps, intensity,
            color: { r: colorR, g: colorG, b: colorB },
            invertX, invertY, swapXY, safetyBorder, pincushionH, pincushionV, offsetX, offsetY,
            blankingPoints, blankingDwell, cornerDwell
        });
        saveToStorage();
    }

    function applyCalibration() {
        if (!laserRenderer) return;
        const corners = computeCorners(calRotate, calScale, calTopBottom, calLeftRight);
        laserRenderer.calibration.setCorners(corners);
        laserRenderer.calibrationParams = {
            rotate: calRotate, scale: calScale,
            topBottom: calTopBottom, leftRight: calLeftRight
        };
        saveToStorage();
    }

    function resetCalibration() {
        calRotate = 0;
        calScale = 1.0;
        calTopBottom = 0;
        calLeftRight = 0;
        applyCalibration();
    }

    /**
     * Compute trapezoid corners from rotate, scale, top/bottom, left/right.
     * All transformations are relative to the center (0.5, 0.5).
     */
    function computeCorners(rotateDeg, scale, topBottom, leftRight) {
        const cx = 0.5, cy = 0.5;
        const rad = rotateDeg * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        // Base half-size scaled
        const h = 0.5 * scale;

        // Keystone: topBottom > 0 means top wider, bottom narrower
        // leftRight > 0 means left wider, right narrower
        const tb = topBottom * 0.3; // max 30% adjustment
        const lr = leftRight * 0.3;

        // Corner offsets before rotation (relative to center):
        // Top side width factor: 1 + tb, Bottom: 1 - tb
        // Left side height factor: 1 + lr, Right: 1 - lr
        const topW = h * (1 + tb);
        const botW = h * (1 - tb);
        const leftH = h * (1 + lr);
        const rightH = h * (1 - lr);

        // Corners in local space (before rotation)
        const raw = [
            { x: -topW, y: -leftH },    // top-left
            { x: topW, y: -rightH },     // top-right
            { x: -botW, y: leftH },      // bottom-left
            { x: botW, y: rightH }       // bottom-right
        ];

        // Apply rotation around center and shift to 0-1
        const rotated = raw.map(p => ({
            x: cx + p.x * cos - p.y * sin,
            y: cy + p.x * sin + p.y * cos
        }));

        return {
            topLeft: rotated[0],
            topRight: rotated[1],
            bottomLeft: rotated[2],
            bottomRight: rotated[3]
        };
    }

    const colorPresets = [
        { name: 'Green', r: 0, g: 255, b: 0, display: '#4CAF50' },
        { name: 'Red', r: 255, g: 0, b: 0 },
        { name: 'Blue', r: 0, g: 0, b: 255 },
        { name: 'Yellow', r: 255, g: 255, b: 0 },
        { name: 'Cyan', r: 0, g: 255, b: 255 },
        { name: 'Magenta', r: 255, g: 0, b: 255 },
        { name: 'White', r: 255, g: 255, b: 255 }
    ];
</script>

<svelte:window onmousemove={drag} onmouseup={stopDrag} />

<div bind:this={panel} class="laser-panel" style="transform: translate({panelX}px, {panelY}px)">
    <div class="panel-header" onmousedown={startDrag}>
        <h3>Laser</h3>
        <button class="close-button" onclick={onDisconnect} onmousedown={(e) => e.stopPropagation()}>✕</button>
    </div>
    <div class="sliders">
        <!-- Mode Toggle -->
        <div class="slider-control mode-control">
            <label>Mode</label>
            <div class="mode-selector">
                <button class="channel-btn" class:active={laserMode === 'scope'} onclick={() => onModeChange('scope')}>SCOPE</button>
                <button class="channel-btn" class:active={laserMode === 'generator'} onclick={() => onModeChange('generator')}>GNRTR</button>
                <button class="channel-btn" class:active={laserMode === 'calibration'} onclick={() => onModeChange('calibration')}>CALIBR</button>
            </div>
        </div>

        <div class="slider-control">
            <label class="clickable" onclick={() => { pps = 30000; applySettings(); }}>PPS</label>
            <input type="range" min="7000" max="65535" step="1000" bind:value={pps} oninput={applySettings} />
            <span class="value">{(pps / 1000).toFixed(0)}k</span>
        </div>

        <div class="slider-control">
            <label class="clickable" onclick={() => { targetFps = 30; applySettings(); }}>FPS</label>
            <input type="range" min="10" max="60" step="1" bind:value={targetFps} oninput={applySettings} />
            <span class="value">{targetFps}</span>
        </div>

        <div class="slider-control">
            <label class="clickable" onclick={() => { blankingPoints = 15; applySettings(); }}>Blanking</label>
            <input type="range" min="5" max="30" step="1" bind:value={blankingPoints} oninput={applySettings} />
            <span class="value">{blankingPoints}</span>
        </div>

        <div class="slider-control">
            <label class="clickable" onclick={() => { blankingDwell = 5; applySettings(); }}>Dwell</label>
            <input type="range" min="1" max="30" step="1" bind:value={blankingDwell} oninput={applySettings} />
            <span class="value">{blankingDwell}</span>
        </div>

        <div class="slider-control">
            <label class="clickable" onclick={() => { intensity = 1.0; applySettings(); }}>Power</label>
            <input type="range" min="0" max="1" step="0.05" bind:value={intensity} oninput={applySettings} />
            <span class="value">{Math.round(intensity * 100)}%</span>
        </div>

        <!-- Color -->
        <div class="slider-control color-control">
            <label>Color</label>
            <div class="color-presets">
                {#each colorPresets as preset}
                    <button
                        class="color-dot"
                        class:active={colorR === preset.r && colorG === preset.g && colorB === preset.b}
                        style="background: {preset.display || `rgb(${preset.r},${preset.g},${preset.b})`}"
                        title={preset.name}
                        onclick={() => { colorR = preset.r; colorG = preset.g; colorB = preset.b; applySettings(); }}
                    ></button>
                {/each}
            </div>
        </div>

        <div class="mode-separator"></div>

        <ToggleSwitch checked={showSection === 'calibration'} label="Calibration" onchange={() => toggleSection('calibration')} />

        {#if showSection === 'calibration'}
        <!-- Calibration preview -->
        <div class="cal-preview-section">
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <svg class="cal-preview" viewBox="-20 -20 140 140"
                onmousemove={dragCorner} onmouseup={stopCornerDrag} onmouseleave={stopCornerDrag}>
                <!-- Reference square -->
                <rect x="0" y="0" width="100" height="100" fill="none" stroke="#555" stroke-width="0.5" stroke-dasharray="3,3" />
                <!-- Calibrated quad with barrel distortion -->
                <path d={previewPath} fill="none" stroke="#1f5e22" stroke-width="1" />
                <!-- Corner dots -->
                {#each [['topLeft', previewCorners.topLeft], ['topRight', previewCorners.topRight], ['bottomLeft', previewCorners.bottomLeft], ['bottomRight', previewCorners.bottomRight]] as [name, c]}
                    <circle
                        cx={c.x * 100} cy={c.y * 100} r="3.4"
                        fill={draggingCorner === name ? '#fff' : '#4CAF50'}
                        class="corner-dot"
                        onmousedown={(e) => startCornerDrag(name, e)}
                    />
                {/each}
            </svg>
            {#if manualCal}
                <button class="reset-cal-btn" onclick={resetManualCal}>Reset</button>
            {/if}
        </div>

        <!-- Calibration sliders (disabled in manual mode) -->
        <div class="calibration-grid" class:disabled={manualCal}>
            <div class="cal-slider">
                <label class="clickable icon-label" onclick={() => { calRotate = 0; applyCalibration(); }} title="Rotate"><Icon data={rotateIcon} /></label>
                <input type="range" min="-45" max="45" step="0.5" bind:value={calRotate} oninput={applyCalibration} disabled={manualCal} />
                <span class="value">{Math.round(calRotate)}</span>
            </div>
            <div class="cal-slider">
                <label class="clickable icon-label" onclick={() => { calScale = 1.0; applyCalibration(); }} title="Scale"><Icon data={resizeIcon} /></label>
                <input type="range" min="0.3" max="1.5" step="0.01" bind:value={calScale} oninput={applyCalibration} disabled={manualCal} />
                <span class="value">{Math.round(calScale * 10)}</span>
            </div>
            <div class="cal-slider">
                <label class="clickable icon-label" onclick={() => { calTopBottom = 0; applyCalibration(); }} title="Vertical keystone"><Icon data={keystoneVIcon} /></label>
                <input type="range" min="-1" max="1" step="0.01" bind:value={calTopBottom} oninput={applyCalibration} disabled={manualCal} />
                <span class="value">{Math.round(calTopBottom * 10)}</span>
            </div>
            <div class="cal-slider">
                <label class="clickable icon-label" onclick={() => { calLeftRight = 0; applyCalibration(); }} title="Horizontal keystone"><Icon data={keystoneHIcon} /></label>
                <input type="range" min="-1" max="1" step="0.01" bind:value={calLeftRight} oninput={applyCalibration} disabled={manualCal} />
                <span class="value">{Math.round(calLeftRight * 10)}</span>
            </div>
        </div>

        <!-- Barrel/offset sliders (always enabled) -->
        <div class="calibration-grid">
            <div class="cal-slider">
                <label class="clickable icon-label" onclick={() => { pincushionH = 0; applySettings(); }} title="Horizontal barrel"><Icon data={barrelHIcon} /></label>
                <input type="range" min="-1" max="1" step="0.01" bind:value={pincushionH} oninput={applySettings} />
                <span class="value">{Math.round(pincushionH * 10)}</span>
            </div>
            <div class="cal-slider">
                <label class="clickable icon-label" onclick={() => { pincushionV = 0; applySettings(); }} title="Vertical barrel"><Icon data={barrelVIcon} /></label>
                <input type="range" min="-1" max="1" step="0.01" bind:value={pincushionV} oninput={applySettings} />
                <span class="value">{Math.round(pincushionV * 10)}</span>
            </div>
            <div class="cal-slider">
                <label class="clickable icon-label" onclick={() => { offsetX = 0; applySettings(); }} title="Horizontal shift"><Icon data={moveHIcon} /></label>
                <input type="range" min="-1" max="1" step="0.01" bind:value={offsetX} oninput={applySettings} />
                <span class="value">{Math.round(offsetX * 10)}</span>
            </div>
            <div class="cal-slider">
                <label class="clickable icon-label" onclick={() => { offsetY = 0; applySettings(); }} title="Vertical shift"><Icon data={moveVIcon} /></label>
                <input type="range" min="-1" max="1" step="0.01" bind:value={offsetY} oninput={applySettings} />
                <span class="value">{Math.round(offsetY * 10)}</span>
            </div>
        </div>

        <div class="slider-control flip-control">
            <div class="flip-options">
                <label class="checkbox"><input type="checkbox" bind:checked={invertX} onchange={applySettings} /> X</label>
                <label class="checkbox"><input type="checkbox" bind:checked={invertY} onchange={applySettings} /> Y</label>
                <label class="checkbox"><input type="checkbox" bind:checked={swapXY} onchange={applySettings} /> Swap</label>
            </div>
        </div>
        {/if}

        <div class="mode-separator"></div>

        <ToggleSwitch checked={showSection === 'debug'} label="Debug" onchange={() => toggleSection('debug')} />

        {#if showSection === 'debug'}
        <div class="debug-section">
            <div class="debug-row"><span class="debug-label">PPS</span><span class="debug-value">{debugStats.pps}</span></div>
            <div class="debug-row"><span class="debug-label">Target FPS</span><span class="debug-value">{debugStats.targetFps}</span></div>
            <div class="debug-row"><span class="debug-label">Target pts</span><span class="debug-value">{debugStats.targetPts}</span></div>
            <div class="debug-row"><span class="debug-label">Input pts</span><span class="debug-value">{debugStats.inputPts}</span></div>
            <div class="debug-row"><span class="debug-label">Output pts</span><span class="debug-value">{debugStats.outputPts}</span></div>
            <div class="debug-row"><span class="debug-label">Blanking</span><span class="debug-value">{blankingPoints}</span></div>
            <div class="debug-row"><span class="debug-label">Dwell</span><span class="debug-value">{blankingDwell}</span></div>
            <div class="debug-row"><span class="debug-label">Corner dwell</span><span class="debug-value">{cornerDwell}</span></div>
            <div class="debug-row"><span class="debug-label">Safety border</span><span class="debug-value">{(safetyBorder * 100).toFixed(0)}%</span></div>
            <div class="debug-row"><span class="debug-label">Mode</span><span class="debug-value">{laserMode}</span></div>
            <div class="debug-row"><span class="debug-label">Manual cal</span><span class="debug-value">{manualCal ? 'yes' : 'no'}</span></div>
        </div>
        {/if}
    </div>
</div>

<style>
    .laser-panel {
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
        width: 300px;
        backdrop-filter: blur(10px);
        box-shadow: 0px 0px 4px #1c5e20;
        z-index: 1100;
    }

    .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 15px;
        border-bottom: 1px solid #333;
        cursor: move;
        user-select: none;
    }

    .panel-header h3 {
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
        background: transparent;
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

    .debug-section {
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-size: 11px;
        padding: 4px 0;
    }

    .debug-row {
        display: flex;
        justify-content: space-between;
        padding: 1px 4px;
    }

    .debug-label {
        color: #888;
    }

    .debug-value {
        color: #4CAF50;
        font-family: monospace;
    }

    .slider-control {
        display: grid;
        grid-template-columns: 80px 1fr 50px;
        gap: 10px;
        align-items: center;
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

    .slider-control label.icon-label {
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .slider-control label.icon-label:hover {
        text-decoration: none;
    }

    .slider-control label.icon-label :global(svg) {
        height: 18px;
        width: 18px;
        fill: currentColor;
    }

    /* Calibration preview */
    .cal-preview-section {
        display: flex;
        flex-direction: column;
        gap: 6px;
        position: relative;
    }

    .reset-cal-btn {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: transparent;
        border: 1px solid #444;
        color: #888;
        font-family: system-ui;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        padding: 2px 8px;
        border-radius: 4px;
        transition: all 0.2s;
        z-index: 1;
    }

    .reset-cal-btn:hover {
        background: transparent;
        border-color: #4CAF50;
        color: #4CAF50;
    }

    .cal-preview {
        width: 100%;
        aspect-ratio: 1;
        margin: 0 auto;
        border-radius: 4px;
    }

    .cal-preview circle.corner-dot {
        cursor: grab;
    }

    .cal-preview circle.corner-dot:active {
        cursor: grabbing;
    }

    /* Calibration 2x2 grid */
    .calibration-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px 8px;
        margin-bottom: 10px;
        transition: opacity 0.2s;
    }

    .calibration-grid.disabled {
        opacity: 0.35;
        pointer-events: none;
    }

    .cal-slider {
        display: grid;
        grid-template-columns: 26px 1fr 22px;
        gap: 2px;
        align-items: center;
        max-width: 120px;
    }

    .cal-slider label {
        color: #4CAF50;
        font-family: system-ui;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: color 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .cal-slider label:hover {
        color: #5db761;
    }

    .cal-slider label :global(svg) {
        height: 20px;
        width: 20px;
        fill: currentColor;
    }

    .cal-slider input[type="range"] {
        width: 100%;
        height: 4px;
        background: #333;
        border-radius: 2px;
        outline: none;
        -webkit-appearance: none;
    }

    .cal-slider input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 14px;
        height: 14px;
        background: #4CAF50;
        border-radius: 50%;
        cursor: pointer;
    }

    .cal-slider input[type="range"]::-moz-range-thumb {
        width: 14px;
        height: 14px;
        background: #4CAF50;
        border-radius: 50%;
        cursor: pointer;
        border: none;
    }

    .cal-slider .value {
        color: #4CAF50;
        font-family: monospace;
        font-size: 11px;
        font-weight: 600;
        text-align: right;
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

    /* Mode selector - A/B tab bar style */
    .mode-control {
        grid-template-columns: 80px 1fr;
    }

    .mode-selector {
        display: flex;
        background: #2d2d2d;
        border-radius: 5px;
        height: 24px;
        align-items: center;
    }

    .channel-btn {
        width: 50%;
        background: transparent;
        color: #666;
        border: none;
        border-radius: 5px;
        font-family: system-ui;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        line-height: 1;
        height: 100%;
        padding: 0;
        justify-content: center;
    }

    .channel-btn:hover {
        background: rgba(76, 175, 80, 0.15);
        color: #4CAF50;
    }

    .channel-btn.active {
        background: #4CAF50;
        color: #1a1a1a;
    }

    /* Color presets */
    .color-control {
        grid-template-columns: 80px 1fr;
    }

    .color-presets {
        display: flex;
        gap: 6px;
    }

    .color-dot {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        border: none;
        cursor: pointer;
        padding: 0;
        transition: transform 0.1s, opacity 0.15s;
        opacity: 0.5;
        position: relative;
    }

    .color-dot:hover {
        transform: scale(1.15);
        opacity: 0.8;
    }

    .color-dot.active {
        opacity: 1;
    }

    .color-dot.active::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #1a1a1a;
    }

    /* Flip checkboxes */
    .flip-control {
        grid-template-columns: 1fr;
        justify-items: center;
    }

    .flip-options {
        display: flex;
        gap: 12px;
        justify-content: center;
    }

    .checkbox {
        display: flex;
        align-items: center;
        gap: 4px;
        color: #4CAF50;
        font-family: system-ui;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
    }

    .checkbox input {
        margin: 0;
        -webkit-appearance: none;
        appearance: none;
        width: 14px;
        height: 14px;
        border: 1.5px solid #555;
        border-radius: 3px;
        background: #2d2d2d;
        cursor: pointer;
        position: relative;
    }

    .checkbox input:checked {
        background: #4CAF50;
        border-color: #4CAF50;
    }

    .checkbox input:checked::after {
        content: '✓';
        position: absolute;
        top: -1px;
        left: 1px;
        font-size: 11px;
        color: #1a1a1a;
        font-weight: bold;
    }

    .checkbox input:hover {
        border-color: #4CAF50;
    }
</style>

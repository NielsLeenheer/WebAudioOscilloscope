<script>
    import Header from './Header.svelte';
    import Navigation from './Navigation.svelte';
    import WaveControls from './tabs/WaveControls.svelte';
    import ShapeControls from './tabs/ShapeControls.svelte';
    import ClockControls from './tabs/ClockControls.svelte';
    import TextControls from './tabs/TextControls.svelte';
    import DrawControls from './tabs/DrawControls.svelte';
    import SVGControls from './tabs/SVGControls.svelte';
    import DoomControls from './tabs/DoomControls.svelte';
    import Settings from './tabs/Settings.svelte';
    import Dialog from '../Common/Dialog.svelte';

    let { audioEngine, start, stop } = $props();
    let activeTab = $state('waves');

    // SVG settings shared between Settings tab and SVG tab
    let svgAnimationFPS = $state(30);
    let svgSamplePoints = $state(200);
    let svgDoubleDraw = $state(false);

    // Output settings shared between Settings tab and other tabs (for FPS calculation)
    let renderMode = $state('frequency');
    let pointSpacing = $state(0.02);

    // Doom render settings shared between Settings tab and Doom tab
    let doomMaxRenderDistance = $state(1000);
    let doomDepthPreset = $state(3);
    let doomEdgeSampleInterval = $state(1);
    let doomShowDebug = $state(false);

    // SVG input shared between Draw tab and SVG tab
    let svgInput = $state('');
    let svgSelectedExample = $state('star');

    // Settings dialog
    let settingsDialog = $state(null);

    function handleSettingsClick() {
        settingsDialog?.showModal();
    }
</script>

<div class="generator">
    <Header {audioEngine} {start} {stop} />
    <Navigation bind:activeTab onSettingsClick={handleSettingsClick} />
    <div class="content-area">
        <div class="tab-panel" class:active={activeTab === 'waves'}>
            <WaveControls {audioEngine} isActive={activeTab === 'waves'} />
        </div>
        <div class="tab-panel" class:active={activeTab === 'shapes'}>
            <ShapeControls {audioEngine} isActive={activeTab === 'shapes'} />
        </div>
        <div class="tab-panel" class:active={activeTab === 'clock'}>
            <ClockControls {audioEngine} isActive={activeTab === 'clock'} />
        </div>
        <div class="tab-panel" class:active={activeTab === 'text'}>
            <TextControls {audioEngine} isActive={activeTab === 'text'} />
        </div>
        <div class="tab-panel" class:active={activeTab === 'draw'}>
            <DrawControls {audioEngine} isActive={activeTab === 'draw'} bind:activeTab bind:svgInput bind:svgSelectedExample />
        </div>
        <div class="tab-panel" class:active={activeTab === 'svg'}>
            <SVGControls {audioEngine} isActive={activeTab === 'svg'} bind:animationFPS={svgAnimationFPS} bind:numSamples={svgSamplePoints} optimizeSegments={true} bind:doubleDraw={svgDoubleDraw} bind:svgInput bind:selectedExample={svgSelectedExample} />
        </div>
        <div class="tab-panel" class:active={activeTab === 'doom'}>
            <DoomControls {audioEngine} isActive={activeTab === 'doom'} {renderMode} {pointSpacing} bind:maxRenderDistance={doomMaxRenderDistance} bind:depthPreset={doomDepthPreset} bind:edgeSampleInterval={doomEdgeSampleInterval} {doomShowDebug} />
        </div>
    </div>

    <Dialog bind:dialogRef={settingsDialog} anchored={true} anchorId="settings-button">
        <Settings {audioEngine} {activeTab} bind:svgAnimationFPS bind:svgSamplePoints bind:svgDoubleDraw bind:renderMode bind:pointSpacing bind:doomMaxRenderDistance bind:doomDepthPreset bind:doomEdgeSampleInterval bind:doomShowDebug />
    </Dialog>
</div>

<style>
    .generator {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #fff;
    }

    .content-area {
        flex: 1;
        overflow: auto;
        position: relative;
    }

    .tab-panel {
        display: none;
        height: 100%;
    }

    .tab-panel.active {
        display: block;
    }

    /* Make settings dialog wider */
    .generator :global(.dialog.anchored) {
        min-width: 400px;
        max-width: 500px;
    }
</style>

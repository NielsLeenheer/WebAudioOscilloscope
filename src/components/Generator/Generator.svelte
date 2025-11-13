<script>
    import Header from './Header.svelte';
    import Navigation from './Navigation.svelte';
    import WaveControls from './tabs/WaveControls.svelte';
    import ShapeControls from './tabs/ShapeControls.svelte';
    import ClockControls from './tabs/ClockControls.svelte';
    import DrawControls from './tabs/DrawControls.svelte';
    import SVGControls from './tabs/SVGControls.svelte';
    import Settings from './tabs/Settings.svelte';
    import Dialog from '../Common/Dialog.svelte';

    let { audioEngine, start, stop } = $props();
    let activeTab = $state('waves');

    // SVG settings shared between Settings tab and SVG tab
    let svgAnimationFPS = $state(30);
    let svgSamplePoints = $state(200);

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
            <WaveControls {audioEngine} />
        </div>
        <div class="tab-panel" class:active={activeTab === 'shapes'}>
            <ShapeControls {audioEngine} />
        </div>
        <div class="tab-panel" class:active={activeTab === 'clock'}>
            <ClockControls {audioEngine} />
        </div>
        <div class="tab-panel" class:active={activeTab === 'draw'}>
            <DrawControls {audioEngine} bind:activeTab bind:svgInput bind:svgSelectedExample />
        </div>
        <div class="tab-panel" class:active={activeTab === 'svg'}>
            <SVGControls {audioEngine} bind:animationFPS={svgAnimationFPS} bind:numSamples={svgSamplePoints} bind:svgInput bind:selectedExample={svgSelectedExample} />
        </div>
    </div>

    <Dialog bind:dialogRef={settingsDialog} anchored={true} anchorId="settings-button">
        <Settings {audioEngine} bind:svgAnimationFPS bind:svgSamplePoints />
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

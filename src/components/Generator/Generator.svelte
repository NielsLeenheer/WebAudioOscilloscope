<script>
    import { onDestroy } from 'svelte';
    import Header from './Header.svelte';
    import Navigation from './Navigation.svelte';
    import WaveControls from './tabs/WaveControls.svelte';
    import ShapeControls from './tabs/ShapeControls.svelte';
    import ClockControls from './tabs/ClockControls.svelte';
    import TextControls from './tabs/TextControls.svelte';
    import SVGControls from './tabs/SVGControls.svelte';
    import DoomControls from './tabs/DoomControls.svelte';
    import DinoControls from './tabs/DinoControls.svelte';
    import Settings from './tabs/Settings.svelte';
    import Dialog from '../Common/Dialog.svelte';
    import { FrameProcessor } from '../../utils/FrameProcessor.js';

    let { audioEngine, start, stop } = $props();
    let activeTab = $state('waves');

    // SVG settings shared between Settings tab and SVG tab
    let svgAnimationFPS = $state(30);
    let svgSamplePoints = $state(200);
    let svgDoubleDraw = $state(false);

    // Output settings shared between Settings tab and other tabs (for FPS calculation)
    let renderMode = $state('frequency');
    let pointSpacing = $state(0.02);

    // Frame processing settings
    let resampleMode = $state('proportional');
    let optimizeOrder = $state(true);
    let trackBeamPosition = $state(true);

    // Output settings that also need to reach the frame processor
    let frequency = $state(100);
    let rotation = $state(0);

    // Doom render settings shared between Settings tab and Doom tab
    let doomMaxRenderDistance = $state(1000);
    let doomDepthPreset = $state(3);
    let doomEdgeSampleInterval = $state(1);
    let doomShowDebug = $state(false);

    // Dino settings shared between Settings tab and Dino tab
    let dinoShowDebug = $state(false);
    let dinoSceneScale = $state(1.25);
    let dinoSimplifySprites = $state(true);

    // Stats (updated from frame processor)
    let statSegments = $state(0);
    let statPoints = $state(0);

    // Settings dialog
    let settingsDialog = $state(null);

    // Frame processor (worker-based processing for all tabs except Waves)
    const frameProcessor = new FrameProcessor();

    // Route processed frames to audio engine and update stats
    frameProcessor.onFrameReady = (data) => {
        statSegments = frameProcessor.processedSegmentCount;
        statPoints = frameProcessor.processedPointCount;

        if (data.left && data.right) {
            audioEngine.playProcessedFrequencyFrame(data.left, data.right);
        } else if (data.interleaved) {
            audioEngine.playProcessedPointsFrame(data.interleaved);
        }
    };

    // Keep AudioEngine in sync with reactive frequency/rotation
    $effect(() => {
        audioEngine.setDefaultFrequency(frequency);
    });
    $effect(() => {
        audioEngine.setRotation(rotation);
    });

    // Reset beam position and clear stale preview on tab switch
    $effect(() => {
        activeTab; // track
        frameProcessor.resetBeamPosition();
        frameProcessor.processedPreview = null;
        frameProcessor.processedPointCount = 0;
    });

    // Sync settings to frame processor worker
    $effect(() => {
        frameProcessor.updateSettings({
            mode: renderMode,
            frequency,
            sampleRate: audioEngine.audioContext?.sampleRate || 48000,
            rotation,
            pointSpacing,
            resampleMode,
            optimizeOrder,
            trackBeamPosition
        });
    });

    onDestroy(() => {
        frameProcessor.destroy();
    });

    function handleSettingsClick() {
        settingsDialog?.showModal();
    }
</script>

<div class="generator">
    <Header {audioEngine} {start} {stop} onSettingsClick={handleSettingsClick} />
    <Navigation bind:activeTab />
    <div class="content-area">
        <div class="tab-panel" class:active={activeTab === 'waves'}>
            <WaveControls {audioEngine} isActive={activeTab === 'waves'} />
        </div>
        <div class="tab-panel" class:active={activeTab === 'shapes'}>
            <ShapeControls {audioEngine} {frameProcessor} isActive={activeTab === 'shapes'} />
        </div>
        <div class="tab-panel" class:active={activeTab === 'clock'}>
            <ClockControls {audioEngine} {frameProcessor} isActive={activeTab === 'clock'} />
        </div>
        <div class="tab-panel" class:active={activeTab === 'text'}>
            <TextControls {audioEngine} {frameProcessor} isActive={activeTab === 'text'} />
        </div>
        <div class="tab-panel" class:active={activeTab === 'svg'}>
            <SVGControls {audioEngine} {frameProcessor} isActive={activeTab === 'svg'} bind:animationFPS={svgAnimationFPS} bind:numSamples={svgSamplePoints} optimizeSegments={true} bind:doubleDraw={svgDoubleDraw} />
        </div>
        <div class="tab-panel" class:active={activeTab === 'doom'}>
            <DoomControls {audioEngine} {frameProcessor} isActive={activeTab === 'doom'} bind:maxRenderDistance={doomMaxRenderDistance} bind:depthPreset={doomDepthPreset} bind:edgeSampleInterval={doomEdgeSampleInterval} {doomShowDebug} />
        </div>
        <div class="tab-panel" class:active={activeTab === 'dino'}>
            <DinoControls {audioEngine} {frameProcessor} isActive={activeTab === 'dino'} {dinoShowDebug} bind:sceneScale={dinoSceneScale} bind:simplifySprites={dinoSimplifySprites} />
        </div>
    </div>

    <Dialog bind:dialogRef={settingsDialog} anchored={true} anchorId="settings-button">
        <Settings {audioEngine} {activeTab} {statSegments} {statPoints} bind:svgAnimationFPS bind:svgSamplePoints bind:svgDoubleDraw bind:renderMode bind:pointSpacing bind:resampleMode bind:optimizeOrder bind:trackBeamPosition bind:frequency bind:rotation bind:doomMaxRenderDistance bind:doomDepthPreset bind:doomEdgeSampleInterval bind:doomShowDebug bind:dinoShowDebug bind:dinoSceneScale bind:dinoSimplifySprites />
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

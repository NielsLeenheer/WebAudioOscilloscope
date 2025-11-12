<script>
    import Header from './Header.svelte';
    import Navigation from './Navigation.svelte';
    import WaveControls from './tabs/WaveControls.svelte';
    import ShapeControls from './tabs/ShapeControls.svelte';
    import ClockControls from './tabs/ClockControls.svelte';
    import DrawControls from './tabs/DrawControls.svelte';
    import SVGControls from './tabs/SVGControls.svelte';
    import Settings from './tabs/Settings.svelte';

    let { audioEngine, isPlaying, start, stop } = $props();
    let activeTab = $state('waves');

    // SVG settings shared between Settings tab and SVG tab
    let svgAnimationFPS = $state(30);
    let svgSamplePoints = $state(200);
</script>

<div class="generator">
    <Header {isPlaying} {start} {stop} />
    <Navigation bind:activeTab />
    <div class="content-area">
        {#if activeTab === 'waves'}
            <WaveControls {audioEngine} {isPlaying} />
        {:else if activeTab === 'shapes'}
            <ShapeControls {audioEngine} {isPlaying} isActive={activeTab === 'shapes'} />
        {:else if activeTab === 'clock'}
            <ClockControls {audioEngine} {isPlaying} isActive={activeTab === 'clock'} />
        {:else if activeTab === 'draw'}
            <DrawControls {audioEngine} {isPlaying} />
        {:else if activeTab === 'svg'}
            <SVGControls {audioEngine} {isPlaying} bind:animationFPS={svgAnimationFPS} bind:numSamples={svgSamplePoints} />
        {:else if activeTab === 'settings'}
            <Settings {audioEngine} bind:svgAnimationFPS bind:svgSamplePoints />
        {/if}
    </div>
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
    }
</style>

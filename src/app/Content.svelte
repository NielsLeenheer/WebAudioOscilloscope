<script>
    import Instructions from './Instructions.svelte';
    import ShapeControls from './ShapeControls.svelte';
    import ClockControls from './ClockControls.svelte';
    import DrawControls from './DrawControls.svelte';
    import SVGControls from './SVGControls.svelte';
    import Settings from './Settings.svelte';

    let { audioEngine, isPlaying, activeTab } = $props();
</script>

<div class="tab-content" class:active={activeTab === 'instructions'}>
    <Instructions />
</div>

<div class="tab-content" class:active={activeTab === 'shapes'}>
    <ShapeControls {audioEngine} {isPlaying} />
</div>

<div class="tab-content" class:active={activeTab === 'clock'}>
    <ClockControls {audioEngine} {isPlaying} />
</div>

<div class="tab-content" class:active={activeTab === 'draw'}>
    <DrawControls {audioEngine} {isPlaying} />
</div>

<div class="tab-content" class:active={activeTab === 'svg'}>
    <SVGControls {audioEngine} {isPlaying} />
</div>

<div class="tab-content" class:active={activeTab === 'settings'}>
    <Settings {audioEngine} />
</div>

<style>
    .tab-content {
        display: none;
    }

    .tab-content.active {
        display: block;
    }
</style>

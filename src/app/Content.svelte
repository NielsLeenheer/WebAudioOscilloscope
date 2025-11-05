<script>
    import Instructions from './Instructions.svelte';
    import ShapeControls from './ShapeControls.svelte';
    import ClockControls from './ClockControls.svelte';
    import DrawControls from './DrawControls.svelte';
    import SVGControls from './SVGControls.svelte';
    import Settings from './Settings.svelte';

    let { audioEngine, isPlaying } = $props();

    let activeTab = $state('instructions');
</script>

<div class="tabs">
    <button class="tab" class:active={activeTab === 'instructions'} onclick={() => activeTab = 'instructions'}>
        Instructions
    </button>
    <button class="tab" class:active={activeTab === 'shapes'} onclick={() => activeTab = 'shapes'}>
        Shapes
    </button>
    <button class="tab" class:active={activeTab === 'clock'} onclick={() => activeTab = 'clock'}>
        Clock
    </button>
    <button class="tab" class:active={activeTab === 'draw'} onclick={() => activeTab = 'draw'}>
        Draw
    </button>
    <button class="tab" class:active={activeTab === 'svg'} onclick={() => activeTab = 'svg'}>
        SVG Paths
    </button>
    <button class="tab" class:active={activeTab === 'settings'} onclick={() => activeTab = 'settings'}>
        Settings
    </button>
</div>

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

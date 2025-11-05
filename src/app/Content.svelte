<script>
    import ShapeControls from './ShapeControls.svelte';
    import ClockControls from './ClockControls.svelte';
    import DrawControls from './DrawControls.svelte';
    import SVGControls from './SVGControls.svelte';
    import Settings from './Settings.svelte';

    let { audioEngine, isPlaying } = $props();

    let activeTab = $state('shapes');
</script>

<div class="info">
    <strong>Setup Instructions:</strong>
    <ol>
        <li>Connect your computer's audio output to the oscilloscope</li>
        <li>Left channel → X input (CH1)</li>
        <li>Right channel → Y input (CH2)</li>
        <li>Set oscilloscope to X/Y mode</li>
        <li>Adjust time/div and volt/div for best view</li>
    </ol>
</div>

<div class="warning">
    ⚠️ <strong>Warning:</strong> Start with low volume and adjust gradually. Protect your hearing and equipment!
</div>

<div class="status" class:active={isPlaying} class:inactive={!isPlaying}>
    Audio Context: {isPlaying ? 'Active' : 'Inactive'}
</div>

<div class="tabs">
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

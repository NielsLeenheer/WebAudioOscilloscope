<script>
    import { Icon } from 'svelte-icon';
    import Instructions from './Instructions.svelte';
    import ShapeControls from './ShapeControls.svelte';
    import ClockControls from './ClockControls.svelte';
    import DrawControls from './DrawControls.svelte';
    import SVGControls from './SVGControls.svelte';
    import Settings from './Settings.svelte';

    import instructionsIcon from '../assets/icons/instructions.svg?raw';
    import shapesIcon from '../assets/icons/shapes.svg?raw';
    import clockIcon from '../assets/icons/clock.svg?raw';
    import drawIcon from '../assets/icons/draw.svg?raw';
    import pathsIcon from '../assets/icons/paths.svg?raw';
    import settingsIcon from '../assets/icons/settings.svg?raw';

    let { audioEngine, isPlaying } = $props();

    let activeTab = $state('instructions');
</script>

<div class="tabs-wrapper">
    <nav>
        <label>
            <input type="radio" name="tab" value="instructions" bind:group={activeTab}>
            <Icon data={instructionsIcon} />
            Instructions
        </label>

        <label>
            <input type="radio" name="tab" value="shapes" bind:group={activeTab}>
            <Icon data={shapesIcon} />
            Shapes
        </label>

        <label>
            <input type="radio" name="tab" value="clock" bind:group={activeTab}>
            <Icon data={clockIcon} />
            Clock
        </label>

        <label>
            <input type="radio" name="tab" value="draw" bind:group={activeTab}>
            <Icon data={drawIcon} />
            Draw
        </label>

        <label>
            <input type="radio" name="tab" value="svg" bind:group={activeTab}>
            <Icon data={pathsIcon} />
            SVG Paths
        </label>

        <label>
            <input type="radio" name="tab" value="settings" bind:group={activeTab}>
            <Icon data={settingsIcon} />
            Settings
        </label>
    </nav>
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

<style>
    .tabs-wrapper {
        display: flex;
        flex-wrap: wrap;
        align-content: start;
        justify-content: end;
        margin-left: auto;
        padding-right: 10px;
    }

    nav {
        border: none;
        border-radius: 6px;
        background: #eaeaea;
        font-family: system-ui;
        font-size: 10pt;
        margin: 15px 0 0 15px;
        display: flex;
        height: 32px;
        align-items: stretch;
        user-select: none;
    }

    label {
        display: flex;
        align-items: center;
        padding: 0px 9px;
        cursor: pointer;
    }
    label:first-child {
        border-radius: 6px 0 0 6px;
    }
    label:last-child {
        border-radius: 0 6px 6px 0;
    }
    label:has(:focus-visible) {
        outline: -webkit-focus-ring-color auto 1px;
    }
    label:has(input:checked) {
        background: #d5d5d5;
    }

    label :global(svg) {
        width: 1.5em;
        height: 1.5em;
        margin-right: 4px;
    }

    input {
        position: absolute;
        opacity: 0;
    }
</style>

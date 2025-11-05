<script>
    import { Icon } from 'svelte-icon';

    import instructionsIcon from '../assets/icons/instructions.svg?raw';
    import shapesIcon from '../assets/icons/shapes.svg?raw';
    import clockIcon from '../assets/icons/clock.svg?raw';
    import drawIcon from '../assets/icons/draw.svg?raw';
    import pathsIcon from '../assets/icons/paths.svg?raw';
    import settingsIcon from '../assets/icons/settings.svg?raw';
    import previewIcon from '../assets/icons/preview.svg?raw';

    let { activeTab = $bindable(), showPreview = $bindable() } = $props();
</script>

<div class="navigation">
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

    <button id="preview" onclick={() => { showPreview = !showPreview }} class:active={showPreview}>
        <Icon data={previewIcon} />
        Preview
    </button>
</div>

<style>
    .navigation {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 20px;
        background: #fafafa;
        border-bottom: 1px solid #ddd;
        padding-top: 15px;
        padding-bottom: 15px;
    }

    nav {
        border: none;
        border-radius: 6px;
        background: #eaeaea;
        font-family: system-ui;
        font-size: 10pt;
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

    button#preview {
        background-color: #fff;
        color: #333;
        border: none;
        border-radius: 6px;
        height: 32px;
        padding: 0 12px;
        font-family: system-ui;
        font-size: 10pt;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        place-items: center;
        user-select: none;
    }

    button#preview :global(svg) {
        width: 1.5em;
        height: 1.5em;
        margin-right: 4px;
    }

    button#preview.active {
        background-color: #d5d5d5;
    }

    button#preview:hover:not(:disabled) {
        background: #f5f5f5;
    }

    button#preview.active:hover {
        background: #c8c8c8;
    }
</style>

<script>
    import { Icon } from 'svelte-icon';

    import shapesIcon from '../../assets/icons/shapes.svg?raw';
    import clockIcon from '../../assets/icons/clock.svg?raw';
    import drawIcon from '../../assets/icons/draw.svg?raw';
    import pathsIcon from '../../assets/icons/paths.svg?raw';
    import settingsIcon from '../../assets/icons/settings.svg?raw';

    let { activeTab = $bindable() } = $props();
</script>

<div class="navigation">
    <nav>
        <label>
            <input type="radio" name="tab" value="shapes" bind:group={activeTab}>
            <Icon data={shapesIcon} />
            Waves
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

<style>
    .navigation {
        display: flex;
        align-items: center;
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
</style>

<script>
    import { Icon } from 'svelte-icon';

    import audioIcon from '../../assets/icons/audio.svg?raw';
    import shapesIcon from '../../assets/icons/shapes.svg?raw';
    import clockIcon from '../../assets/icons/clock.svg?raw';
    import textIcon from '../../assets/icons/text.svg?raw';
    import pathsIcon from '../../assets/icons/paths.svg?raw';
    import doomIcon from '../../assets/icons/doom.svg?raw';
    import dinoIcon from '../../assets/icons/dino.svg?raw';
    let { activeTab = $bindable() } = $props();
</script>

<div class="navigation">
    <nav>
        <label>
            <input type="radio" name="tab" value="waves" bind:group={activeTab}>
            <Icon data={audioIcon} />
            Waves
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
            <input type="radio" name="tab" value="text" bind:group={activeTab}>
            <Icon data={textIcon} />
            Text
        </label>

        <label>
            <input type="radio" name="tab" value="svg" bind:group={activeTab}>
            <Icon data={pathsIcon} />
            SVG
        </label>

        <label>
            <input type="radio" name="tab" value="doom" bind:group={activeTab}>
            <Icon data={doomIcon} />
            Doom
        </label>

        <label>
            <input type="radio" name="tab" value="dino" bind:group={activeTab}>
            <Icon data={dinoIcon} />
            Dino
        </label>

    </nav>
</div>

<style>
    .navigation {
        display: flex;
        align-items: center;
        padding: 0 20px;
        background: #f5f5f5;
        border-bottom: 1px solid #ddd;
        padding-top: 15px;
        padding-bottom: 15px;
    }

    nav {
        width: 100%;
        border: none;
        font-family: system-ui;
        font-size: 10pt;
        display: flex;
        height: 32px;
        align-items: stretch;
        user-select: none;
        gap: 6px;
    }

    label {
        display: flex;
        align-items: center;
        padding: 0px 8px;
        border-radius: 6px;
        cursor: pointer;
    }
    label:has(:focus-visible) {
        outline: -webkit-focus-ring-color auto 1px;
    }
    label:has(input:checked) {
        background: #fff;
    }

    label :global(svg) {
        width: 1.8em;
        height: 1.8em;
        margin-right: 4px;
    }

    input {
        position: absolute;
        opacity: 0;
    }

</style>

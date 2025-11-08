<script>
    import { Icon } from 'svelte-icon';
    import microphoneIcon from '../assets/icons/glyph/microphone.svg?raw';
    import generatorIcon from '../assets/icons/glyph/generator.svg?raw';


    let { inputSource = $bindable(), mode = $bindable() } = $props();
</script>

<div class="input-selector">
    <nav>
        <label>
            <input type="radio" name="input" value="generated" bind:group={inputSource}>
            <Icon data={generatorIcon} />
            Generator
        </label>

        <label>
            <input type="radio" name="input" value="microphone" bind:group={inputSource}>
            <Icon data={microphoneIcon} />
            Microphone
        </label>
    </nav>

    <div class="mode-selector">
        <label>
            <input type="radio" name="mode" value="a" bind:group={mode}>
            A
        </label>
        <label>
            <input type="radio" name="mode" value="b" bind:group={mode}>
            B
        </label>
        <label>
            <input type="radio" name="mode" value="ab" bind:group={mode}>
            A/B
        </label>
        <label>
            <input type="radio" name="mode" value="xy" bind:group={mode}>
            X/Y
        </label>
    </div>
</div>

<style>
    .input-selector {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 20px;
        background: #1a1a1a;
        border-bottom: 1px solid #333;
        padding-top: 15px;
        padding-bottom: 15px;
    }

    nav,
    .mode-selector {
        border: none;
        border-radius: 6px;
        background: #2d2d2d;
        font-family: system-ui;
        font-size: 10pt;
        display: flex;
        height: 32px;
        align-items: stretch;
        user-select: none;
    }

    nav label,
    .mode-selector label {
        display: flex;
        align-items: center;
        padding: 0px 12px;
        cursor: pointer;
        color: #888;
        transition: all 0.2s;
    }

    nav label:first-child,
    .mode-selector label:first-child {
        border-radius: 6px 0 0 6px;
    }

    nav label:last-child,
    .mode-selector label:last-child {
        border-radius: 0 6px 6px 0;
    }

    nav label:has(:focus-visible),
    .mode-selector label:has(:focus-visible) {
        outline: 2px solid #4CAF50;
    }

    nav label:has(input:checked),
    .mode-selector label:has(input:checked) {
        background: #1b5e20;
        color: #4CAF50;
    }

    nav label:hover:not(:has(input:checked)),
    .mode-selector label:hover:not(:has(input:checked)) {
        background: #333;
        color: #aaa;
    }

    nav label :global(svg) {
        width: 1.5em;
        height: 1.5em;
        margin-right: 6px;
    }

    input {
        position: absolute;
        opacity: 0;
    }
</style>

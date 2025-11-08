<script>
    let { mode = $bindable() } = $props();
</script>

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

<style>
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

    label {
        display: flex;
        align-items: center;
        padding: 0px 12px;
        cursor: pointer;
        color: #888;
        transition: all 0.2s;
    }

    label:first-child {
        border-radius: 6px 0 0 6px;
    }

    label:last-child {
        border-radius: 0 6px 6px 0;
    }

    label:has(:focus-visible) {
        outline: 2px solid #4CAF50;
    }

    label:has(input:checked) {
        background: #1b5e20;
        color: #4CAF50;
    }

    label:hover:not(:has(input:checked)) {
        background: #333;
        color: #aaa;
    }

    input {
        position: absolute;
        opacity: 0;
    }
</style>

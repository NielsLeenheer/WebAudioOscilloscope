<script>
    /**
     * ViewSelector component - switches between Oscilloscope and Webcam views
     * Placed at top-right of the application window
     */
    let { currentView = $bindable('oscilloscope') } = $props();
</script>

<div class="view-selector">
    <label>
        <input type="radio" name="view" value="oscilloscope" bind:group={currentView}>
        <span>Oscilloscope</span>
    </label>

    <label>
        <input type="radio" name="view" value="webcam" bind:group={currentView}>
        <span>Webcam</span>
    </label>
</div>

<style>
    .view-selector {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 1000;
        border: none;
        border-radius: 6px;
        background: #2d2d2d;
        font-family: system-ui;
        font-size: 10pt;
        display: flex;
        height: 32px;
        align-items: stretch;
        user-select: none;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
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

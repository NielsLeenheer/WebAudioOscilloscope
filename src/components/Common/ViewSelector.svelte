<script>
    /**
     * ViewSelector component - toggles between Oscilloscope and Webcam views
     * Placed at top-right of the application window
     */
    let { currentView = $bindable('oscilloscope') } = $props();

    function toggleView() {
        currentView = currentView === 'oscilloscope' ? 'webcam' : 'oscilloscope';
    }
</script>

<button class="view-selector" onclick={toggleView}>
    {currentView === 'oscilloscope' ? 'Switch to Webcam' : 'Switch to Oscilloscope'}
</button>

<style>
    .view-selector {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 1000;
        border: 1px solid #333;
        border-radius: 6px;
        background: #2d2d2d;
        color: #4CAF50;
        font-family: system-ui;
        font-size: 10pt;
        font-weight: 500;
        padding: 8px 16px;
        height: 32px;
        display: flex;
        align-items: center;
        cursor: pointer;
        user-select: none;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        transition: all 0.2s;
    }

    .view-selector:hover {
        background: #333;
        border-color: #4CAF50;
    }

    .view-selector:active {
        background: #1b5e20;
    }

    .view-selector:focus-visible {
        outline: 2px solid #4CAF50;
    }
</style>

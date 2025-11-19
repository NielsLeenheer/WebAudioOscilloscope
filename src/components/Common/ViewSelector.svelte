<script>
    import { Icon } from 'svelte-icon';
    import webcamIcon from '../../assets/icons/glyph/webcam.svg?raw';

    /**
     * ViewSelector component - toggles between Oscilloscope and Webcam views
     * Placed at top-right of the application window
     */
    let { currentView = $bindable('oscilloscope') } = $props();

    function toggleView() {
        currentView = currentView === 'oscilloscope' ? 'webcam' : 'oscilloscope';
    }
</script>

<button
    class="view-selector"
    class:active={currentView === 'webcam'}
    onclick={toggleView}
>
    <Icon data={webcamIcon} />
    {currentView === 'oscilloscope' ? 'WEBCAM' : 'OSCILLOSCOPE'}
</button>

<style>
    .view-selector {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 1000;
        border-radius: 6px;
        height: 36px;
        padding: 0 16px;
        font-family: system-ui;
        font-size: 11pt;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        user-select: none;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        transition: all 0.2s;
        background-color: #2d2d2d;
        color: #888;
        border: 1px solid #333;
    }

    .view-selector.active {
        background-color: #1b5e20;
        color: #4CAF50;
        border: 1px solid #2d5e30;
    }

    .view-selector :global(svg) {
        height: 18px;
        width: 18px;
        stroke-width: 0;
    }
</style>

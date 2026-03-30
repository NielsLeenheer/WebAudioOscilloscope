<script>
    import { Icon } from 'svelte-icon';
    import webcamIcon from '../../assets/icons/glyph/webcam.svg?raw';
    import laserIcon from '../../assets/icons/glyph/laser.svg?raw';

    /**
     * ViewSelector component - toggles between Oscilloscope and Webcam views
     * Also includes Laser controls button
     * Placed at top-right of the application window
     */
    let { 
        currentView = $bindable('oscilloscope'),
        laserConnected = false,
        onLaserClick = () => {}
    } = $props();

    function toggleView() {
        currentView = currentView === 'oscilloscope' ? 'webcam' : 'oscilloscope';
    }
</script>

<div class="button-group">
    <button
        class="toolbar-button laser-button"
        class:connected={laserConnected}
        onclick={onLaserClick}
        title={laserConnected ? "Disconnect Laser" : "Connect Laser"}
    >
        <Icon data={laserIcon} />
    </button>
    <button
        class="toolbar-button"
        class:active={currentView === 'webcam'}
        onclick={toggleView}
        title="Webcam Input"
    >
        <Icon data={webcamIcon} />
    </button>
</div>

<style>
    .button-group {
        position: fixed;
        top: 15px;
        right: 20px;
        z-index: 1000;
        display: flex;
        gap: 8px;
    }

    .toolbar-button {
        border-radius: 6px;
        height: 36px;
        width: 36px;
        padding: 0;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        user-select: none;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        transition: all 0.2s;
        background-color: #2d2d2d;
        color: #888;
        border: 1px solid #333;
    }

    .toolbar-button:hover {
        background-color: #1d1d1d;
    }
    
    .toolbar-button.active {
        background-color: #1b5e20;
        color: #4CAF50;
        border-color: #2d5e30;
    }

    .toolbar-button :global(svg) {
        height: 18px;
        width: 18px;
        stroke-width: 0;
    }

    .laser-button.connected {
        background-color: #1b5e20;
        color: #4CAF50;
        border-color: #2d5e30;
    }

</style>

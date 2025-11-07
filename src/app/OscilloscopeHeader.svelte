<script>
    import { Icon } from 'svelte-icon';
    import powerIcon from '../assets/icons/power.svg?raw';
    let { isPowered = $bindable() } = $props();

    function togglePower() {
        isPowered = !isPowered;
    }
</script>

<header>
    <button id="power" class:powered={isPowered} onclick={togglePower}>
        <Icon data={powerIcon} />
        {isPowered ? 'POWER ON' : 'POWER OFF'}
    </button>

    <h1>Oscilloscope</h1>
</header>

<style>
    header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 15px 20px;
        background: #1a1a1a;
        border-bottom: 1px solid #333;
    }

    button {
        background-color: #2d2d2d;
        color: #888;
        /* border: 2px solid #444; */
        border-radius: 6px;
        height: 36px;
        padding: 0 16px;
        font-family: system-ui;
        font-size: 11pt;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: all 0.2s;
    }

    button:hover {
        background-color: #333;
        border-color: #555;
    }

    button.powered {
        background-color: #1b5e20;
        color: #4CAF50;
        border-color: #4CAF50;
    }

    button.powered:hover {
        background-color: #2e7d32;
    }

    .power-icon {
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .power-icon svg {
        width: 100%;
        height: 100%;
    }

    h1 {
        margin: 0;
        color: #555;
        font-size: 1.5em;
        margin-left: 0.5em;
    }
</style>

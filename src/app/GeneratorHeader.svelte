<script>
    import { Icon } from 'svelte-icon';
    import powerIcon from '../assets/icons/power.svg?raw';
    import audioPlayingGif from '../assets/audio-playing.gif';

    let { isPlaying, start, stop } = $props();
</script>

<header>
    {#if !isPlaying}
    <button id="start" onclick={() => start()}>
        <Icon data={powerIcon} />
        POWER ON
    </button>
    {:else}
    <button id="stop" onclick={() => stop()}>
        <Icon data={powerIcon} />
        POWER OFF
    </button>
    {/if}

    <h1>Generator</h1>

    {#if isPlaying}
    <img src={audioPlayingGif} alt="Audio playing" class="audio-playing" />
    {/if}
</header>

<style>
    header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 15px 20px;
        background: #fafafa;
        border-bottom: 1px solid #ddd;
    }

    button {
        background-color: #fff;
        color: #333;
        border: 1px solid #ccc;
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
        transition: all 0.2s;
    }

    button#start {
        background-color: #bbdefb;
        color: #1976d2;
        border: none;
    }

    button#stop {
        background-color: #1976d2;
        color: #bbdefb;
        border: none;
    }

    button :global(svg) {
        height: 18px;
        width: 18px;
        stroke-width: 0;
    }

    .audio-playing {
        height: 24px;
        margin-left: 8px;
        mix-blend-mode: multiply;
    }

    h1 {
        margin: 0;
        color: #aaa;
        font-size: 1.5em;
        margin-left: 0.5em;
    }

</style>

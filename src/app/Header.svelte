<script>
    import { Icon } from 'svelte-icon';
    import connectIcon from '../assets/icons/connect.svg?raw';
    import disconnectIcon from '../assets/icons/disconnect.svg?raw';
    import audioPlayingGif from '../assets/audio-playing.gif';

    let { isPlaying, start, stop } = $props();
</script>

<header>
    {#if !isPlaying}
    <button id="start" onclick={() => start()}>
        <Icon data={connectIcon} />
        Start Audio
    </button>
    {:else}
    <button id="stop" onclick={() => stop()}>
        <Icon data={disconnectIcon} />
        Stop Audio
    </button>
    {/if}

    {#if isPlaying}
    <img src={audioPlayingGif} alt="Audio playing" class="audio-playing" />
    {/if}
</header>

<style>
    header {
        display: flex;
        align-items: center;
    }

    button {
        background-color: #bbdefb;
        color: #1976d2;
    }

    button :global(svg) {
        height: 75%;
        margin-right: 3px;
        stroke-width: 0;
    }

    button#stop {
        background-color: #ffcdd2;
        color: #c62828;
    }

    .audio-playing {
        height: 24px;
        margin-left: 8px;
        mix-blend-mode: multiply;
    }
</style>

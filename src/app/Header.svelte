<script>
    let { isPlaying, start, stop } = $props();
</script>

<header>
    <h1 style="margin: auto 0; font-size: 18px; color: #333; font-family: system-ui;">Web Audio Oscilloscope</h1>

    {#if !isPlaying}
    <button id="start" onclick={() => start()} style="background-color: #bbdefb; color: #1976d2;">
        Start Audio
    </button>
    {:else}
    <button id="stop" onclick={() => stop()} style="background-color: #ffcdd2; color: #c62828;">
        Stop Audio
    </button>
    {/if}
</header>

<style>
    h1 {
        margin: auto 0;
        font-size: 18px;
        color: #333;
        font-family: system-ui;
    }

    button#start,
    button#stop {
        margin-right: 15px;
    }
</style>

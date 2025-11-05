<script>
    let { isPlaying, start, stop } = $props();
</script>

<header>
    {#if !isPlaying}
    <button id="start" onclick={() => start()} style="background-color: #bbdefb; color: #1976d2;">
        Start Audio
    </button>
    {:else}
    <button id="stop" onclick={() => stop()} style="background-color: #ffcdd2; color: #c62828;">
        Stop Audio
    </button>
    {/if}

    <div class="status-dot" class:active={isPlaying}></div>
</header>

<style>
    header {
        display: flex;
        align-items: center;
    }

    button#start,
    button#stop {
        margin-right: 12px;
    }

    .status-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background-color: #f44336;
        margin: auto 0 auto 0;
    }

    .status-dot.active {
        background-color: #4caf50;
    }
</style>

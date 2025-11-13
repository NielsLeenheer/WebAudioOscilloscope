<script>
    import PowerButton from '../Common/PowerButton.svelte';
    import audioPlayingGif from '../../assets/audio-playing.gif';

    let { audioEngine, start, stop } = $props();
    let isPlaying = audioEngine.isPlaying;
</script>

<header>
    <PowerButton
        variant="light"
        isPowered={$isPlaying}
        onclick={$isPlaying ? stop : start}
    />

    <h1>Generator</h1>

    {#if $isPlaying}
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

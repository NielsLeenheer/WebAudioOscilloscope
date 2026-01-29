<script>
    import { Icon } from 'svelte-icon';
    import PowerButton from '../Common/PowerButton.svelte';
    import audioPlayingGif from '../../assets/audio-playing.gif';
    import settingsIcon from '../../assets/icons/settings.svg?raw';

    let { audioEngine, start, stop, onSettingsClick } = $props();
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

    <button class="settings-button" onclick={onSettingsClick} style="anchor-name: --settings-button">
        <Icon data={settingsIcon} />
    </button>
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

    .settings-button {
        display: flex;
        align-items: center;
        padding: 4px 8px;
        border-radius: 6px;
        cursor: pointer;
        background: none;
        border: none;
        margin-left: auto;
    }

    .settings-button:hover {
        background: rgba(0, 0, 0, 0.05);
    }

    .settings-button :global(svg) {
        width: 1.8em;
        height: 1.8em;
    }
</style>

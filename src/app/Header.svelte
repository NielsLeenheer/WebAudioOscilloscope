<script>
    import { Icon } from 'svelte-icon';
    import connectIcon from '../assets/icons/connect.svg?raw';
    import disconnectIcon from '../assets/icons/disconnect.svg?raw';
    import audioPlayingGif from '../assets/audio-playing.gif';

    let { isPlaying, start, stop, startGenerated, startMicrophone, inputSource } = $props();

    const microphoneIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
<path fill="#9fa8da" d="M33,24c0,3.3-2.7,6-6,6h-6c-3.3,0-6-2.7-6-6V10c0-3.3,2.7-6,6-6h6c3.3,0,6,2.7,6,6V24z"></path><path fill="#3f51b5" d="M22 34H26V44H22z"></path><path fill="#303f9f" d="M35,43c0,0-6-2-11-2s-11,2-11,2v2h22V43z"></path><path fill="#5c6bc0" d="M15 10H23V12H15zM25 10H33V12H25zM25 14H33V16H25zM15 14H23V16H15zM25 18H33V20H25zM15 18H23V20H15zM15 22H23V24H15zM25 22H33V24H25z"></path><path fill="#3f51b5" d="M26,35h-4c-3.1,0-9-1.7-9-8v-9h2v9c0,5.9,6.7,6,7,6h4c0.3,0,7-0.1,7-6v-9h2v9C35,33.3,29.1,35,26,35z"></path>
</svg>`;
</script>

<header>
    {#if !isPlaying}
    <button id="start-generated" class="start-button" class:active={inputSource === 'generated'} onclick={() => startGenerated()}>
        <Icon data={connectIcon} />
        Generate audio
    </button>
    <button id="start-microphone" class="start-button" class:active={inputSource === 'microphone'} onclick={() => startMicrophone()}>
        <Icon data={microphoneIcon} />
        Listen for audio
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
        gap: 8px;
    }

    button.start-button {
        background-color: #e3f2fd;
        color: #1976d2;
        border: 2px solid transparent;
    }

    button.start-button:hover {
        background-color: #bbdefb;
    }

    button.start-button.active {
        background-color: #bbdefb;
        border-color: #1976d2;
    }

    button :global(svg) {
        height: 75%;
        margin-right: 3px;
        stroke-width: 0;
    }

    button#stop {
        background-color: #fff;
        color: #000;
    }

    .audio-playing {
        height: 24px;
        margin-left: 8px;
        mix-blend-mode: multiply;
    }
</style>

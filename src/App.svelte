<script>
    import Header from './app/Header.svelte';
    import Navigation from './app/Navigation.svelte';
    import Content from './app/Content.svelte';
    import PreviewPanel from './app/PreviewPanel.svelte';
    import { AudioEngine } from './utils/AudioEngine.js';

    let audioEngine = new AudioEngine();
    let isPlaying = $state(false);
    let activeTab = $state('instructions');
    let showPreview = $state(true);

    function start() {
        audioEngine.start();
        isPlaying = true;
    }

    function stop() {
        audioEngine.stop();
        isPlaying = false;
    }
</script>

<Header {isPlaying} {start} {stop} />
<Navigation bind:activeTab bind:showPreview />

<div id="main-content">
    <div class="content-left">
        <Content {audioEngine} {isPlaying} {activeTab} />
    </div>
    {#if showPreview}
    <div class="content-right">
        <PreviewPanel {audioEngine} {isPlaying} />
    </div>
    {/if}
</div>

<style>
    #main-content {
        display: flex;
        height: calc(100vh - 61px - 63px);
    }

    .content-left {
        flex: 1;
        overflow: auto;
    }

    .content-right {
        width: 440px;
        flex-shrink: 0;
    }
</style>

<script>
    import Header from './app/Header.svelte';
    import Content from './app/Content.svelte';
    import PreviewPanel from './app/PreviewPanel.svelte';
    import { AudioEngine } from './utils/AudioEngine.js';

    let audioEngine = new AudioEngine();
    let isPlaying = $state(false);
    let showPreview = $state(false);

    function start() {
        audioEngine.start();
        isPlaying = true;
    }

    function stop() {
        audioEngine.stop();
        isPlaying = false;
    }

    function togglePreview() {
        showPreview = !showPreview;
    }
</script>

<Header {isPlaying} {start} {stop} {showPreview} {togglePreview} />

<div id="content" class:with-preview={showPreview}>
    <div class="main-content">
        <Content {audioEngine} {isPlaying} />
    </div>
    {#if showPreview}
    <div class="preview-content">
        <PreviewPanel {audioEngine} {isPlaying} />
    </div>
    {/if}
</div>

<style>
    #content {
        display: flex;
        gap: 0;
    }

    .main-content {
        flex: 1;
        min-width: 0;
    }

    .preview-content {
        width: 440px;
        flex-shrink: 0;
    }
</style>

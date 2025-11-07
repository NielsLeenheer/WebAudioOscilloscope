<script>
    import Header from './app/Header.svelte';
    import Navigation from './app/Navigation.svelte';
    import Content from './app/Content.svelte';
    import PreviewPanel from './app/PreviewPanel.svelte';
    import { AudioEngine } from './utils/AudioEngine.js';

    let audioEngine = new AudioEngine();
    let isPlaying = $state(false);
    let activeTab = $state('instructions');
    let inputSource = $state('generated'); // 'generated' or 'microphone'

    function start() {
        audioEngine.start();
        isPlaying = true;
    }

    function stop() {
        audioEngine.stop();
        isPlaying = false;
    }

    function startGenerated() {
        inputSource = 'generated';
        start();
    }

    function startMicrophone() {
        inputSource = 'microphone';
        start();
    }
</script>

<Header {isPlaying} {start} {stop} {startGenerated} {startMicrophone} {inputSource} />
<Navigation bind:activeTab />

<div id="main-content">
    <div class="content-left">
        <Content {audioEngine} {isPlaying} {activeTab} />
    </div>
    <div class="content-right">
        <PreviewPanel {audioEngine} {isPlaying} {inputSource} />
    </div>
</div>

<style>
    #main-content {
        display: flex;
        height: calc(100vh - 61px - 63px);
    }

    .content-left {
        flex: 1;
        min-width: 0; /* Allow flex item to shrink below content size */
        overflow: auto;
    }

    .content-right {
        flex: 1;
        min-width: 0; /* Allow flex item to shrink below content size */
        overflow: auto;
    }
</style>

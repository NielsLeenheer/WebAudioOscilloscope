<script>
    import GeneratorHeader from './app/GeneratorHeader.svelte';
    import OscilloscopeHeader from './app/OscilloscopeHeader.svelte';
    import Navigation from './app/Navigation.svelte';
    import InputSelector from './app/InputSelector.svelte';
    import Content from './app/Content.svelte';
    import PreviewPanel from './app/PreviewPanel.svelte';
    import { AudioEngine } from './utils/AudioEngine.js';

    let audioEngine = new AudioEngine();
    let isPlaying = $state(false);
    let activeTab = $state('shapes');
    let inputSource = $state('generated'); // 'generated' or 'microphone'
    let isPowered = $state(false);
    let mode = $state('a'); // Display mode: 'a', 'b', 'ab', or 'xy'

    function start() {
        audioEngine.start();
        isPlaying = true;
    }

    function stop() {
        audioEngine.stop();
        isPlaying = false;
    }
</script>

<div id="app-container">
    <!-- Left Side: Generator -->
    <div class="left-side">
        <GeneratorHeader {isPlaying} {start} {stop} />
        <Navigation bind:activeTab />
        <div class="content-area">
            <Content {audioEngine} {isPlaying} {activeTab} />
        </div>
    </div>

    <!-- Right Side: Oscilloscope -->
    <div class="right-side">
        <OscilloscopeHeader bind:isPowered />
        <InputSelector bind:inputSource bind:mode />
        <div class="content-area">
            <PreviewPanel {audioEngine} {isPlaying} {inputSource} {isPowered} bind:mode />
        </div>
    </div>
</div>

<style>
    #app-container {
        display: flex;
        height: 100vh;
    }

    .left-side,
    .right-side {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .left-side {
        background: #fff;
    }

    .right-side {
        background: #0a0a0a;
    }

    .content-area {
        flex: 1;
        overflow: auto;
    }

    /* Dark scrollbar for right side */
    .right-side .content-area::-webkit-scrollbar {
        width: 12px;
    }

    .right-side .content-area::-webkit-scrollbar-track {
        background: #1a1a1a;
    }

    .right-side .content-area::-webkit-scrollbar-thumb {
        background: #333;
        border-radius: 6px;
    }

    .right-side .content-area::-webkit-scrollbar-thumb:hover {
        background: #444;
    }
</style>

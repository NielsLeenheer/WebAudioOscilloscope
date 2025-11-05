<script>
    import Header from './app/Header.svelte';
    import Content from './app/Content.svelte';
    import { AudioEngine } from './utils/AudioEngine.js';

    let audioEngine = new AudioEngine();
    let isPlaying = $state(false);

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

<div id="content">
    <Content {audioEngine} {isPlaying} />
</div>

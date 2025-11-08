<script>
    import Generator from './components/Generator/Generator.svelte';
    import Oscilloscope from './components/Oscilloscope/Oscilloscope.svelte';
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

<div id="app-container">
    <!-- Left Side: Generator -->
    <div class="left-side">
        <Generator {audioEngine} {isPlaying} {start} {stop} />
    </div>

    <!-- Right Side: Oscilloscope -->
    <div class="right-side">
        <Oscilloscope {audioEngine} {isPlaying} />
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
        overflow: hidden;
    }
</style>

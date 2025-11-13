<script>
    import Generator from './components/Generator/Generator.svelte';
    import Oscilloscope from './components/Oscilloscope/Oscilloscope.svelte';
    import { AudioEngine } from './utils/AudioEngine.js';

    let audioEngine = new AudioEngine();

    function start() {
        audioEngine.start();
    }

    function stop() {
        audioEngine.stop();
    }
</script>

<div id="app-container">
    <!-- Left Side: Generator -->
    <div class="left-side">
        <Generator {audioEngine} {start} {stop} />
    </div>

    <!-- Right Side: Oscilloscope -->
    <div class="right-side">
        <Oscilloscope generatorInput={audioEngine} />
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

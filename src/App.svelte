<script>
    import Generator from './components/Generator/Generator.svelte';
    import Oscilloscope from './components/Oscilloscope/Oscilloscope.svelte';
    import Webcam from './components/Webcam/Webcam.svelte';
    import ViewSelector from './components/Common/ViewSelector.svelte';
    import { AudioEngine } from './utils/AudioEngine.js';

    let audioEngine = new AudioEngine();
    let currentView = $state('oscilloscope');

    function start() {
        audioEngine.start();
    }

    function stop() {
        audioEngine.stop();
    }
</script>

<ViewSelector bind:currentView />

<div id="app-container">
    <!-- Left Side: Generator -->
    <div class="left-side">
        <Generator {audioEngine} {start} {stop} />
    </div>

    <!-- Right Side: Oscilloscope or Webcam -->
    <div class="right-side">
        {#if currentView === 'oscilloscope'}
            <Oscilloscope generatorInput={audioEngine} />
        {:else if currentView === 'webcam'}
            <Webcam />
        {/if}
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

<script>
    import { onDestroy } from 'svelte';
    import Header from './Header.svelte';
    import InputSelector from './InputSelector.svelte';
    import Display from './Display.svelte';
    import { MicrophoneInput } from '../../utils/microphoneInput.js';

    let { audioEngine, isPlaying } = $props();

    let isPowered = $state(false);
    let inputSource = $state('generated');
    let mode = $state('ab');
    let micInput = new MicrophoneInput();

    async function startMicrophoneInput() {
        try {
            await micInput.start({
                fftSize: 16384,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            });
        } catch (error) {
            console.error('Error accessing microphone:', error);
            alert('Could not access microphone. Please check permissions.');
            inputSource = 'generated';
        }
    }

    function stopMicrophoneInput() {
        micInput.stop();
    }

    onDestroy(() => {
        stopMicrophoneInput();
    });

    // React to input source changes
    $effect(() => {
        if (inputSource === 'microphone') {
            startMicrophoneInput();
        } else {
            stopMicrophoneInput();
        }
    });
</script>

<div class="oscilloscope">
    <Header bind:isPowered />
    <InputSelector bind:inputSource bind:mode />
    <Display {audioEngine} {isPlaying} {inputSource} {isPowered} {micInput} bind:mode />
</div>

<style>
    .oscilloscope {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #0d0d0d;
    }
</style>

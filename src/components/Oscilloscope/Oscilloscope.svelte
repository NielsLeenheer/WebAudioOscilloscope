<script>
    import Header from './Header.svelte';
    import InputSelector from './InputSelector.svelte';
    import Display from './Display.svelte';
    import Controls from './Controls.svelte';

    let { audioEngine, isPlaying } = $props();

    let isPowered = $state(false);
    let inputSource = $state('generated');
    let mode = $state('ab');
</script>

<div class="oscilloscope">
    <Header bind:isPowered />
    <InputSelector bind:inputSource bind:mode />
    <Display {audioEngine} {isPlaying} {inputSource} {isPowered} bind:mode />
</div>

<style>
    .oscilloscope {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #0d0d0d;
    }
</style>

<script>
    import Header from './Header.svelte';
    import Navigation from './Navigation.svelte';
    import ShapeControls from './tabs/ShapeControls.svelte';
    import ClockControls from './tabs/ClockControls.svelte';
    import DrawControls from './tabs/DrawControls.svelte';
    import SVGControls from './tabs/SVGControls.svelte';
    import Settings from './tabs/Settings.svelte';

    let { audioEngine, isPlaying, start, stop } = $props();
    let activeTab = $state('shapes');
</script>

<div class="generator">
    <Header {isPlaying} {start} {stop} />
    <Navigation bind:activeTab />
    <div class="content-area">
        {#if activeTab === 'shapes'}
            <ShapeControls {audioEngine} {isPlaying} />
        {:else if activeTab === 'clock'}
            <ClockControls {audioEngine} {isPlaying} />
        {:else if activeTab === 'draw'}
            <DrawControls {audioEngine} {isPlaying} />
        {:else if activeTab === 'svg'}
            <SVGControls {audioEngine} {isPlaying} />
        {:else if activeTab === 'settings'}
            <Settings {audioEngine} />
        {/if}
    </div>
</div>

<style>
    .generator {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #fff;
    }

    .content-area {
        flex: 1;
        overflow: auto;
    }
</style>

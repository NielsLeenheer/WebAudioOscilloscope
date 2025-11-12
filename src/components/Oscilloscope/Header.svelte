<script>
    import PowerButton from '../Common/PowerButton.svelte';
    let { isPowered = $bindable() } = $props();
</script>

<header>
    <PowerButton variant="dark" bind:isPowered />

    <h1>Oscilloscope</h1>
</header>

<style>
    header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 15px 20px;
        background: #1a1a1a;
        border-bottom: 1px solid #333;
    }

    h1 {
        margin: 0;
        color: #555;
        font-size: 1.5em;
        margin-left: 0.5em;
    }
</style>

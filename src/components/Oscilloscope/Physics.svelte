<script>
    import { Icon } from 'svelte-icon';
    import sineIcon from '../../assets/icons/glyph/sine.svg?raw';
    import PhysicsDialog from './PhysicsDialog.svelte';

    let {
        forceMultiplier = $bindable(),
        damping = $bindable(),
        mass = $bindable(),
        persistence = $bindable(),
        signalNoise = $bindable(),
        velocityDimming = $bindable(),
        decay = $bindable()
    } = $props();

    let physicsDialog;

    function openPhysicsDialog() {
        if (physicsDialog) {
            physicsDialog.open();
        }
    }
</script>

<button class="physics-button" onclick={openPhysicsDialog}>
    <Icon data={sineIcon} />
</button>

<PhysicsDialog
    bind:this={physicsDialog}
    bind:forceMultiplier
    bind:damping
    bind:mass
    bind:persistence
    bind:signalNoise
    bind:velocityDimming
    bind:decay
/>

<style>
    .physics-button {
        position: absolute;
        top: 20px;
        right: 20px;
        width: 24px;
        height: 24px;
        background: none;
        border: none;
        color: #4CAF50;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
        padding: 0;
    }

    .physics-button :global(svg) {
        width: 24px;
        height: 24px;
    }
</style>

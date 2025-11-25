<script>
    import { Icon } from 'svelte-icon';
    import sineIcon from '../../assets/icons/glyph/sine.svg?raw';
    import PhysicsDialog from './PhysicsDialog.svelte';

    let {
        simulationMode = $bindable(),
        renderingMode = $bindable(),
        debugMode = $bindable(),
        rendererType = $bindable(),
        availableRenderers = [],
        pendingRendererType = null,
        onReloadRequested = () => {},
        timeSegment = $bindable(),
        dotOpacity = $bindable(),
        dotSizeVariation = $bindable(),
        sampleDotOpacity = $bindable(),
        springForce = $bindable(),
        springDamping = $bindable(),
        springMass = $bindable(),
        coilStrength = $bindable(),
        beamInertia = $bindable(),
        fieldDamping = $bindable(),
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
    bind:simulationMode
    bind:renderingMode
    bind:debugMode
    bind:rendererType
    {availableRenderers}
    {pendingRendererType}
    {onReloadRequested}
    bind:timeSegment
    bind:dotOpacity
    bind:dotSizeVariation
    bind:sampleDotOpacity
    bind:springForce
    bind:springDamping
    bind:springMass
    bind:coilStrength
    bind:beamInertia
    bind:fieldDamping
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
        width: 32px;
        height: 32px;
        background: none;
        border: none;
        color: #4CAF50;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
        padding: 4px;
    }
    .physics-button:hover {
        background: #2d2d2d;
    }

    .physics-button :global(svg) {
        width: 24px;
        height: 24px;
    }
</style>

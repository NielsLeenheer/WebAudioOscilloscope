<script>
    import Controls from './Controls.svelte';
    import Physics from './Physics.svelte';
    import Grid from './Grid.svelte';
    import Visualiser from './Visualiser.svelte';

    let { isPowered, mode, inputSource, generatorInput, micInput } = $props();

    let visualiser;

    // Physics parameters (adjustable)
    let debugMode = $state(false); // Debug visualization toggle
    let rendererType = $state('canvas2d'); // Renderer type: 'canvas2d' or 'webgpu'
    let pendingRendererType = $state(null); // Renderer type that requires reload to apply
    let availableRenderers = $state([]); // Available renderer options from worker

    function handleRendererSwitchFailed(requestedType) {
        // Switch failed, need reload - show pending state in UI
        pendingRendererType = requestedType;
    }

    function reloadWithRenderer(newType) {
        // Store the desired renderer in sessionStorage and reload
        sessionStorage.setItem('pendingRendererType', newType);
        location.reload();
    }

    // On mount, check if we have a pending renderer type from reload
    import { onMount } from 'svelte';
    onMount(() => {
        const pending = sessionStorage.getItem('pendingRendererType');
        if (pending) {
            sessionStorage.removeItem('pendingRendererType');
            rendererType = pending;
        }
    });
    let timeSegment = $state(0.010); // Temporal resolution in milliseconds (debug parameter)
    let dotOpacity = $state(0.0); // Debug dot opacity for red dots/segment endpoints (0.0 to 1.0)
    let dotSizeVariation = $state(1.0); // Debug dot size variation based on angle (1 = all same, 10 = 10x variation)
    let sampleDotOpacity = $state(0.5); // Debug dot opacity for blue dots/sample points (0.0 to 1.0)

    // Electromagnetic model parameters
    let coilStrength = $state(0.60);
    let beamInertia = $state(0.10);
    let fieldDamping = $state(0.30);

    // Common parameters (shared by both modes)
    let persistence = $state(0.100); // Afterglow/fade effect (0=instant fade, 1=long trail)
    let signalNoise = $state(0.003); // Random noise added to audio signal (0-1)
    let beamPower = $state(0.75); // Beam power (affects opacity: high power = bright, low power = dim)
    let velocityDimming = $state(1.0); // How much fast movements dim (0=no dimming, 1=maximum dimming)
    let focus = $state(0.2); // Focus control (-1.0 to 1.0, 0.0 = perfect focus, abs value = blur amount)
    let decay = $state(512); // Maximum points to render (controls phosphor decay/overdraw)

    // Oscilloscope controls (exposed from Controls component)
    let triggerLevel = $state(0.0); // Trigger level: voltage threshold for triggering (-1.0 to 1.0)
    let triggerChannel = $state('a'); // Trigger channel: 'a' or 'b'
    let xPosition = $state(0.0); // X Position: horizontal offset (-1.0 to 1.0)

    // Calculated values from Controls component
    let timeDiv = $state(0); // Time division in microseconds (calculated by Controls)
    let amplDivA = $state(0); // Channel A amplification (calculated by Controls)
    let amplDivB = $state(0); // Channel B amplification (calculated by Controls)
    let positionA = $state(0); // Channel A position (managed by Controls)
    let positionB = $state(0); // Channel B position (managed by Controls)
</script>

<div class="display-panel">
    <Physics
        bind:debugMode
        bind:rendererType
        {availableRenderers}
        {pendingRendererType}
        onReloadRequested={reloadWithRenderer}
        bind:timeSegment
        bind:dotOpacity
        bind:dotSizeVariation
        bind:sampleDotOpacity
        bind:coilStrength
        bind:beamInertia
        bind:fieldDamping
        bind:persistence
        bind:signalNoise
        bind:velocityDimming
        bind:decay
    />
    <div class="visualiser-area">
        <div class="visualiser-container">
            <Visualiser
                bind:this={visualiser}
                {generatorInput}
                {inputSource}
                {isPowered}
                {mode}
                {debugMode}
                {rendererType}
                onRenderersAvailable={(renderers) => availableRenderers = renderers}
                onRendererSwitchFailed={handleRendererSwitchFailed}
                {timeSegment}
                {dotOpacity}
                {dotSizeVariation}
                {sampleDotOpacity}
                {coilStrength}
                {beamInertia}
                {fieldDamping}
                {persistence}
                {signalNoise}
                {beamPower}
                {velocityDimming}
                {decay}
                {timeDiv}
                {triggerLevel}
                {triggerChannel}
                {amplDivA}
                {positionA}
                {amplDivB}
                {positionB}
                {xPosition}
                {focus}
                {micInput}
            />
            <Grid />
        </div>
    </div>
    <Controls
        {mode}
        bind:beamPower
        bind:focus
        bind:xPosition
        bind:triggerLevel
        bind:triggerChannel
        bind:timeDiv
        bind:amplDivA
        bind:amplDivB
        bind:positionA
        bind:positionB
    />
</div>

<style>
    .display-panel {
        background: transparent;
        display: flex;
        flex-direction: column;
        height: 100%;
        box-sizing: border-box;
        position: relative;
    }

    .visualiser-area {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 0;
    }

    .visualiser-container {
        position: relative;
        display: flex;
        justify-content: center;
        align-items: center;
        background: #1a1f1a;
        border-radius: 50px;
        width: 400px;
        height: 400px;
        overflow: hidden; /* Clip the overscan area */
    }
</style>

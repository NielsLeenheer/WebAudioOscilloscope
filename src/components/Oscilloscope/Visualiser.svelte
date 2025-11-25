<script>
    import { onMount, onDestroy, tick } from 'svelte';

    let {
        generatorInput,
        inputSource,
        isPowered,
        mode,
        // Physics parameters
        debugMode,
        rendererType = 'canvas2d',
        onRenderersAvailable = () => {},
        timeSegment,
        dotOpacity,
        dotSizeVariation,
        sampleDotOpacity,
        coilStrength,
        beamInertia,
        fieldDamping,
        persistence,
        signalNoise,
        beamPower,
        velocityDimming,
        decay,
        // Scope settings
        timeDiv,
        triggerLevel,
        triggerChannel,
        amplDivA,
        positionA,
        amplDivB,
        positionB,
        xPosition,
        focus,
        // Microphone input helper (optional)
        micInput = null
    } = $props();

    let canvas;
    let animationId = null;
    let leftData = null;
    let rightData = null;
    let worker = null;
    let workerBusy = false;
    let lastFrameTime = 0;

    // Key to force canvas recreation when powering on with different renderer
    let canvasKey = $state(0);

    // Track previous power state to detect transitions
    let previousIsPowered = false;

    // High-DPI display support
    const devicePixelRatio = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    const LOGICAL_WIDTH = 600;   // Visual size in CSS pixels
    const LOGICAL_HEIGHT = 600;  // Visual size in CSS pixels
    const PHYSICAL_WIDTH = LOGICAL_WIDTH * devicePixelRatio;   // Backing store resolution
    const PHYSICAL_HEIGHT = LOGICAL_HEIGHT * devicePixelRatio; // Backing store resolution

    onDestroy(() => {
        destroyWorker();
    });

    function initWorker() {
        if (!canvas) return;

        // Set canvas backing store to physical pixels for high-DPI displays
        canvas.width = PHYSICAL_WIDTH;
        canvas.height = PHYSICAL_HEIGHT;

        // Initialize Web Worker with OffscreenCanvas
        worker = new Worker(new URL('../../workers/physics-worker.js', import.meta.url), { type: 'module' });

        // Listen for messages from worker
        worker.onmessage = (e) => {
            if (e.data.type === 'ready') {
                workerBusy = false;
            } else if (e.data.type === 'initialized') {
                // Worker initialized with renderer info
                onRenderersAvailable(e.data.data.availableRenderers);
            }
        };

        // Transfer canvas control to worker
        const offscreen = canvas.transferControlToOffscreen();
        worker.postMessage({
            type: 'init',
            data: {
                canvas: offscreen,
                devicePixelRatio: devicePixelRatio,
                logicalWidth: LOGICAL_WIDTH,
                logicalHeight: LOGICAL_HEIGHT,
                rendererType: rendererType
            }
        }, [offscreen]);
    }

    function destroyWorker() {
        stopVisualization();
        if (worker) {
            worker.terminate();
            worker = null;
        }
    }

    function startVisualization() {
        // Initialize data buffers
        const bufferLength = 16384; // Default FFT size

        const analysers = generatorInput.getAnalysers();
        if (analysers.left && analysers.right) {
            // Use actual FFT size if analysers exist
            const actualBufferLength = analysers.left.fftSize;
            leftData = new Float32Array(actualBufferLength);
            rightData = new Float32Array(actualBufferLength);
        } else {
            // Use default size if analysers don't exist yet
            leftData = new Float32Array(bufferLength);
            rightData = new Float32Array(bufferLength);
        }

        draw();
    }

    function stopVisualization() {
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
    }

    function draw(currentTime) {
        if (!isPowered) {
            stopVisualization();
            return;
        }

        animationId = requestAnimationFrame(draw);

        // Calculate frame delta time (in seconds)
        const deltaTime = lastFrameTime === 0 ? 1/60 : (currentTime - lastFrameTime) / 1000;
        lastFrameTime = currentTime;

        // Skip this frame if worker is still busy processing previous frame
        if (workerBusy) {
            return;
        }

        // Get analysers based on input source
        let analyserLeft, analyserRight;
        let hasValidInput = false;

        if (inputSource === 'microphone') {
            if (micInput && micInput.isActive()) {
                analyserLeft = micInput.getAnalyserLeft();
                analyserRight = micInput.getAnalyserRight();
                hasValidInput = true;
            }
        } else {
            // For generated input, always continue even if not playing
            const analysers = generatorInput.getAnalysers();
            if (analysers.left && analysers.right) {
                analyserLeft = analysers.left;
                analyserRight = analysers.right;
                hasValidInput = true;
            }
        }

        // Get time domain data from both channels (or zeros if not available)
        if (hasValidInput) {
            analyserLeft.getFloatTimeDomainData(leftData);
            analyserRight.getFloatTimeDomainData(rightData);
        } else {
            // Fill with zeros when no input (noise will be added in worker)
            if (!leftData) leftData = new Float32Array(16384);
            if (!rightData) rightData = new Float32Array(16384);
            leftData.fill(0);
            rightData.fill(0);
        }

        // Get sample rate from the appropriate AudioContext
        let sampleRate = 48000; // Default fallback
        if (inputSource === 'microphone' && micInput && micInput.isActive()) {
            const context = micInput.getAudioContext();
            if (context) {
                sampleRate = context.sampleRate;
            }
        } else if (generatorInput?.audioContext) {
            sampleRate = generatorInput.audioContext.sampleRate;
        }

        // Send data to worker for physics calculation AND rendering
        // Use full canvas size (600x600) to allow overscan
        const canvasWidth = 600;
        const canvasHeight = 600;
        // Visible screen area is 400x400 (clipped by CSS overflow: hidden)
        const visibleWidth = 400;
        const visibleHeight = 400;
        const centerX = canvasWidth / 2;
        const centerY = canvasHeight / 2;
        const scale = Math.min(canvasWidth, canvasHeight) / 2.5;

        // Scale for AMPL/DIV based on visible area and voltage calibration
        // Measured: Web Audio ±1.0 corresponds to ~3Vpp (±1.5V) at full volume
        const VOLTAGE_CALIBRATION = 1.5; // Web Audio ±1.0 = ±1.5V
        const VERTICAL_DIVISIONS = 10;    // Standard oscilloscope vertical divisions
        const pixelsPerDivision = visibleHeight / VERTICAL_DIVISIONS; // 40 pixels/division
        const visibleScale = pixelsPerDivision * VOLTAGE_CALIBRATION; // 60

        const basePower = 0.2 + (beamPower * 1.4); // Allow up to 3.0 max brightness

        if (worker) {
            workerBusy = true;
            worker.postMessage({
                type: 'render',
                data: {
                    leftData: Array.from(leftData),
                    rightData: Array.from(rightData),
                    centerX,
                    centerY,
                    scale,
                    visibleScale,
                    debugMode,
                    timeSegment,
                    dotOpacity,
                    dotSizeVariation,
                    sampleDotOpacity,
                    forceMultiplier: coilStrength,
                    damping: fieldDamping,
                    mass: beamInertia,
                    signalNoise,
                    basePower,
                    persistence,
                    velocityDimming,
                    decay,
                    mode,
                    timeDiv,
                    triggerLevel,
                    triggerChannel,
                    amplDivA,
                    positionA,
                    amplDivB,
                    positionB,
                    xPosition,
                    canvasWidth,
                    canvasHeight,
                    visibleWidth,
                    sampleRate,
                    deltaTime
                }
            });
        }
    }

    // Export methods for external control
    export function clear() {
        if (worker) {
            worker.postMessage({
                type: 'clear'
            });
        }
    }

    export function reset() {
        if (worker) {
            worker.postMessage({
                type: 'reset'
            });
        }
    }

    // React to isPowered changes - recreate canvas and worker on power on
    $effect(() => {
        // Only react to transitions to avoid infinite loops
        if (isPowered !== previousIsPowered) {
            previousIsPowered = isPowered;

            if (isPowered) {
                // Increment key to force canvas recreation, then init after DOM updates
                canvasKey++;
                tick().then(() => {
                    if (canvas && !worker) {
                        initWorker();
                        startVisualization();
                    }
                });
            } else {
                // Stop and destroy worker when powered off
                destroyWorker();
            }
        }
    });
</script>

{#key canvasKey}
<canvas
    bind:this={canvas}
    class="scope-canvas"
    style="filter: blur({Math.abs(focus) * 3}px);"
></canvas>
{/key}

<style>
    .scope-canvas {
        position: absolute;
        top: -100px;
        left: -100px;
        display: block;
        /* Visual size in CSS pixels (same on all displays) */
        width: 600px;
        height: 600px;
        /* Backing store resolution set programmatically based on devicePixelRatio */
        background: #1a1f1a;
        border-radius: 8px;
    }
</style>

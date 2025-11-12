<script>
    import { onMount, onDestroy } from 'svelte';

    let {
        audioEngine,
        inputSource,
        isPowered,
        mode,
        // Physics parameters
        forceMultiplier,
        damping,
        mass,
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
        // Microphone analysers (optional)
        micAnalyserLeft = null,
        micAnalyserRight = null,
        micAudioContext = null
    } = $props();

    let canvas;
    let animationId = null;
    let leftData = null;
    let rightData = null;
    let worker = null;
    let workerBusy = false;

    onMount(() => {
        // Initialize Web Worker with OffscreenCanvas
        worker = new Worker(new URL('../../workers/physics-worker.js', import.meta.url), { type: 'module' });

        // Listen for messages from worker
        worker.onmessage = (e) => {
            if (e.data.type === 'ready') {
                workerBusy = false;
            }
        };

        // Transfer canvas control to worker
        const offscreen = canvas.transferControlToOffscreen();
        worker.postMessage({
            type: 'init',
            data: { canvas: offscreen }
        }, [offscreen]);

        if (isPowered) {
            startVisualization();
        }
    });

    onDestroy(() => {
        stopVisualization();
        if (worker) {
            worker.terminate();
            worker = null;
        }
    });

    function startVisualization() {
        // Initialize data buffers
        const bufferLength = 16384; // Default FFT size

        const analysers = audioEngine.getAnalysers();
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

    function draw() {
        if (!isPowered) {
            stopVisualization();
            return;
        }

        animationId = requestAnimationFrame(draw);

        // Skip this frame if worker is still busy processing previous frame
        if (workerBusy) {
            return;
        }

        // Get analysers based on input source
        let analyserLeft, analyserRight;
        let hasValidInput = false;

        if (inputSource === 'microphone') {
            if (micAnalyserLeft && micAnalyserRight) {
                analyserLeft = micAnalyserLeft;
                analyserRight = micAnalyserRight;
                hasValidInput = true;
            }
        } else {
            // For generated input, always continue even if not playing
            const analysers = audioEngine.getAnalysers();
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
        if (inputSource === 'microphone' && micAudioContext) {
            sampleRate = micAudioContext.sampleRate;
        } else if (audioEngine?.audioContext) {
            sampleRate = audioEngine.audioContext.sampleRate;
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
                    forceMultiplier,
                    damping,
                    mass,
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
                    sampleRate
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

    // React to isPowered changes
    $effect(() => {
        if (isPowered) {
            // Start visualization when powered on
            startVisualization();
        } else {
            // Stop and reset when powered off
            stopVisualization();
            reset();
        }
    });

    // React to power changes - clear screen when powered off
    $effect(() => {
        if (!isPowered) {
            clear();
        }
    });
</script>

<canvas
    bind:this={canvas}
    width="600"
    height="600"
    class="scope-canvas"
    style="filter: blur({Math.abs(focus) * 3}px);"
></canvas>

<style>
    .scope-canvas {
        position: absolute;
        top: -100px;
        left: -100px;
        display: block;
        background: #1a1f1a;
        border-radius: 8px;
    }
</style>

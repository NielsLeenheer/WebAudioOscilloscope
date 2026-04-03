<script>
    import { onDestroy } from 'svelte';
    import Preview from '../../Common/Preview.svelte';
    import Card from '../../Common/Card.svelte';
    import { createECGGenerator, createRRGenerator, createRawECGRenderer } from '../../../utils/ecgGenerator.js';
    import { BluetoothHeartRate } from '../../../utils/bluetoothHeartRate.js';

    let { audioEngine, frameProcessor, isActive = false } = $props();

    let bpm = $state(null);
    let btStatus = $state('');
    let btConnected = $state(false);
    let previewPoints = $state(null);
    let btLog = $state([]);
    let running = $state(false);

    // Active ECG mode: 'simulated' | 'rr' | 'raw-ecg'
    let ecgMode = $state(null);

    // Three generators — one per mode
    const simGen = createECGGenerator({ bpm: 70, numPoints: 300, displaySeconds: 2.5 });
    const rrGen  = createRRGenerator({ numPoints: 300, displaySeconds: 2.5 });
    const rawGen = createRawECGRenderer({ numPoints: 300, displaySeconds: 2.5 });

    const bt = new BluetoothHeartRate();

    let animFrame = null;
    let sendInterval = null;
    let simPhase = 0;

    function addLog(msg) {
        btLog = [...btLog.slice(-29), msg];
    }

    // --- BLE callbacks ---

    // Resume animation if data arrives after a reconnect
    function ensureRunning() {
        if (!running && isActive) {
            btConnected = true;
            const caps = bt.capabilities;
            if (caps.rr) ecgMode = 'rr';
            else ecgMode = 'simulated';
            startAnimation();
        }
    }

    // Track which data types we've logged, so we only log once per connection
    let loggedHR = false;
    let loggedRR = false;
    let loggedECG = false;

    bt.onHeartRate = (newBPM) => {
        if (!loggedHR) {
            addLog('Receiving heart rate data...');
            loggedHR = true;
        }
        bpm = newBPM;
        simGen.updateBPM(newBPM);
        ensureRunning();
    };

    bt.onRRInterval = (rrMs) => {
        if (!loggedRR) {
            addLog('Receiving RR-interval data...');
            loggedRR = true;
        }
        rrGen.pushRR(rrMs);
        bpm = rrGen.bpm;
        ensureRunning();
    };

    bt.onECGData = (samples) => {
        if (!loggedECG) {
            addLog('Receiving ECG data at 130 Hz');
            loggedECG = true;
        }
        rawGen.pushSamples(samples);
        ensureRunning();
    };

    bt.onDisconnect = () => {
        addLog('Disconnected');
        loggedHR = false;
        loggedRR = false;
        loggedECG = false;
        btConnected = false;
        stopAnimation();
    };

    bt.onStatusChange = (status) => {
        btStatus = status;
    };

    // --- Simulated BPM with natural variation ---

    function getSimulatedBPM(timestamp) {
        const t = timestamp / 1000;
        // Two sine waves for irregular-looking variation around 70 BPM
        const variation = Math.sin(t * 0.23) * 4 + Math.sin(t * 0.71) * 2;
        return Math.round(70 + variation);
    }

    // --- Active generator ---

    function getActiveGen() {
        if (ecgMode === 'raw-ecg') return rawGen;
        if (ecgMode === 'rr') return rrGen;
        return simGen;
    }

    // Listen for processed preview updates
    $effect(() => {
        if (isActive) {
            frameProcessor.onPreviewUpdate = () => {
                if (frameProcessor.processedPreview) {
                    previewPoints = frameProcessor.processedPreview;
                }
            };
            return () => {
                frameProcessor.onPreviewUpdate = null;
            };
        }
    });

    // --- Animation loop ---

    function startAnimation() {
        stopAnimation();
        running = true;
        simGen.reset();
        rrGen.reset();
        rawGen.reset();

        const animate = () => {
            const gen = getActiveGen();
            const now = performance.now();

            // Update simulated BPM with variation
            if (ecgMode === 'simulated') {
                const simBPM = getSimulatedBPM(now);
                simGen.updateBPM(simBPM);
                bpm = simBPM;
            }

            const segments = ecgMode === 'raw-ecg' ? gen.getFrame() : gen.getFrame(now);
            previewPoints = frameProcessor.processedPreview ?? segments;
            animFrame = requestAnimationFrame(animate);
        };

        sendInterval = setInterval(() => {
            const gen = getActiveGen();
            const now = performance.now();
            const segments = ecgMode === 'raw-ecg' ? gen.getFrame() : gen.getFrame(now);
            frameProcessor.processFrame(segments);
        }, 1000 / 30);

        animate();
    }

    function stopAnimation() {
        if (animFrame) {
            cancelAnimationFrame(animFrame);
            animFrame = null;
        }
        if (sendInterval) {
            clearInterval(sendInterval);
            sendInterval = null;
        }
        running = false;
        ecgMode = null;
        bpm = null;
        previewPoints = null;
    }

    // Stop animation when tab becomes inactive
    $effect(() => {
        if (!isActive && running) {
            stopAnimation();
        }
    });

    onDestroy(() => {
        stopAnimation();
        bt.disconnect();
    });

    // --- Actions ---

    function handleSimulate() {
        ecgMode = 'simulated';
        startAnimation();
    }

    async function handleConnect() {
        try {
            await bt.connect();
            btConnected = true;
            addLog(`Connected to ${bt.deviceName || 'Unknown device'}`);

            // Pick the best mode — HR/RR start immediately,
            // ECG streaming is started on demand to avoid crashing the connection
            const caps = bt.capabilities;
            if (caps.rr) {
                ecgMode = 'rr';
            } else {
                ecgMode = 'simulated';
            }

            startAnimation();

            // Start ECG after animation is running — done separately
            // to avoid crashing the GATT connection during setup
            if (caps.ecg) {
                try {
                    await bt.startECG();
                    ecgMode = 'raw-ecg';
                } catch (err) {
                    addLog('ECG start failed: ' + err.message);
                }
            }
        } catch (err) {
            if (err.name !== 'NotFoundError') {
                console.error('BLE connect error:', err);
                addLog('Error: ' + err.message);
            }
        }
    }

    function handleDisconnect() {
        bt.disconnect();
        btConnected = false;
        stopAnimation();
    }

    function handleStop() {
        if (btConnected) {
            handleDisconnect();
        } else {
            stopAnimation();
        }
    }

</script>

<div class="ecg-container">
    <div class="preview-wrapper">
        <Preview points={previewPoints} width={300} height={150} />
    </div>

    {#if bpm != null}
        <div class="bpm-display">
            <span class="bpm-value">{bpm}</span>
            <span class="bpm-label">BPM</span>
        </div>
    {/if}

    <div class="controls">
        {#if running}
            <div>
                <button class="control-button" onclick={handleStop}>STOP</button>
            </div>
        {:else}
            <div>
                <button class="control-button" onclick={handleConnect}>CONNECT</button>
            </div>
            <div>
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <span class="simulate-link" onclick={handleSimulate}>Simulate</span>
            </div>
        {/if}
    </div>

    {#if btLog.length > 0}
        <div class="bt-log">
            {#each btLog as entry}
                <div class="log-entry">{entry}</div>
            {/each}
        </div>
    {/if}
</div>

<style>
    .ecg-container {
        padding: 30px 40px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;
    }

    .preview-wrapper {
        display: flex;
        justify-content: center;
    }

    .bpm-display {
        display: flex;
        align-items: baseline;
        justify-content: center;
        gap: 8px;
    }

    .bpm-value {
        font-size: 48px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        color: #000;
        line-height: 1;
    }

    .bpm-label {
        font-size: 14px;
        font-weight: 600;
        color: #999;
        text-transform: uppercase;
        letter-spacing: 1px;
    }

    .controls {
        display: flex;
        gap: 24px;
        align-items: center;
    }

    .controls > div {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
    }

    .controls .label {
        font-size: 11px;
        font-weight: 600;
        color: #888;
        margin-top: 4px;
    }

    .control-button {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 48px;
        padding: 0 24px;
        border-radius: 6px;
        background: #f0f0f0;
        border: none;
        cursor: pointer;
        transition: all 0.1s;
        user-select: none;
        -webkit-user-select: none;
        box-shadow: inset 0 -4px 0 0 #bbb;
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.3em;
        text-indent: 0.3em;
        color: #888;
    }

    .control-button:active {
        transform: translateY(3px);
        box-shadow: inset 0 -1px 0 0 #ccc;
    }

    .control-button:focus {
        outline: none;
    }


    .simulate-link {
        font-size: 13px;
        color: #999;
        cursor: pointer;
        text-decoration: underline;
        text-underline-offset: 2px;
    }

    .simulate-link:hover {
        color: #666;
    }

    .bt-log {
        width: 100%;
        font-family: monospace;
        font-size: 10px;
        line-height: 1.6;
        color: #999;
    }

    .log-entry {
        white-space: nowrap;
    }
</style>

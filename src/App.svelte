<script>
    import Generator from './components/Generator/Generator.svelte';
    import Oscilloscope from './components/Oscilloscope/Oscilloscope.svelte';
    import Webcam from './components/Webcam/Webcam.svelte';
    import ViewSelector from './components/Common/ViewSelector.svelte';
    import { LaserRenderer, isWebUSBSupported } from './utils/laser/index.js';
    import LaserControls from './components/Laser/LaserControls.svelte';
    import { AudioEngine } from './utils/AudioEngine.js';

    let audioEngine = new AudioEngine();
    let currentView = $state('oscilloscope');
    // Laser state (managed at app level so it works across views)
    let laserRenderer = $state(null);
    let laserConnected = $state(false);
    let laserMode = $state('scope');  // 'scope' | 'generator' | 'calibration'
    const laserSupported = isWebUSBSupported();

    function start() {
        audioEngine.start();
    }

    function stop() {
        audioEngine.stop();
    }

    // Serializes laser connect/disconnect so they never overlap on the shared
    // USB device. Without this, a quick reconnect races the previous teardown:
    // the new connect reopens the device while the old disconnect is still
    // mid-close, and the late disconnect then nulls the freshly-opened device.
    let laserOp = Promise.resolve();

    function handleLaserClick(event) {
        // Alt/Option-click forces the WebUSB device picker so the user can switch
        // to a different projector instead of silently reconnecting to the last.
        const forcePicker = !!event?.altKey;
        console.log('[App] Laser button clicked, connected:', laserConnected, 'supported:', laserSupported, 'forcePicker:', forcePicker);

        if (!laserSupported) {
            alert('WebUSB is not supported in this browser');
            return;
        }

        if (laserConnected) {
            // Disconnect. Dismiss the dialog immediately so the UI responds to
            // the click right away; the actual teardown is queued so it runs
            // after (and never concurrently with) any pending connect.
            console.log('[App] Disconnecting laser...');
            laserConnected = false;
            const r = laserRenderer;
            if (r) {
                laserOp = laserOp.then(() =>
                    r.disconnect().catch((error) =>
                        console.error('[App] Error disconnecting laser:', error)
                    )
                );
            }
        } else {
            // Connect — queued behind any in-flight disconnect so the previous
            // close() fully completes before we reopen the same device.
            console.log('[App] Connecting laser...');
            if (!laserRenderer) {
                console.log('[App] Creating new LaserRenderer');
                laserRenderer = new LaserRenderer();
            }
            laserOp = laserOp.then(async () => {
                try {
                    const success = await laserRenderer.connect({ forcePicker });
                    console.log('[App] Connect result:', success);
                    if (success) {
                        laserConnected = true;
                        laserRenderer.setEnabled(true);
                        console.log('[App] Laser connected and enabled');
                    }
                } catch (error) {
                    console.error('[App] Failed to connect laser:', error);
                }
            });
        }
    }

    // Handle laser data from oscilloscope
    let laserFrameCount = 0;
    async function handleLaserData(data) {
        if (!laserRenderer || !laserConnected) return;
        
        // Handle clear command (scope powered off)
        if (data.clear) {
            // Disable renderer to stop accepting frames BEFORE clearing
            laserRenderer.setEnabled(false);
            await laserRenderer.clear();
            return;
        }
        
        // Re-enable renderer when we receive frame data (scope is on)
        if (!laserRenderer.enabled) {
            laserRenderer.setEnabled(true);
        }
        
        // Debug: log first point every 60 frames to verify data is changing
        laserFrameCount++;
        if (laserFrameCount % 60 === 0 && data.points?.length > 0) {
            const p = data.points[0];
            console.log(`[App] Laser frame ${laserFrameCount}, first point: (${p.x.toFixed(3)}, ${p.y.toFixed(3)}), total points: ${data.points.length}`);
        }
        
        // Scale scope points up slightly to better fill the laser area
        // Scope virtual coords are smaller than generator coords at default settings
        const scopeScale = 1.1;
        const scaledPoints = data.points.map(p => ({
            x: p.x * scopeScale,
            y: p.y * scopeScale,
            segmentStart: p.segmentStart
        }));
        
        // Pass data in the format expected by renderTrace
        laserRenderer.renderTrace({
            points: scaledPoints,
            speeds: data.speeds,
            basePower: data.basePower,
            velocityDimming: data.velocityDimming
        });
    }
    // Handle direct laser frames from generator (bypasses audio + oscilloscope)
    function handleLaserFrame(segments) {
        if (!laserRenderer || !laserConnected || laserMode !== 'generator') return;
        if (!laserRenderer.enabled) {
            laserRenderer.setEnabled(true);
        }
        // Convert segments [[[x,y],...], ...] to points [{x,y,segmentStart},...]
        // Generator coords are in -1..1 range; scope virtual space is ~-0.67..0.67
        // Also invert Y to match scope convention (scope Y is inverted)
        const scale = 0.667;
        const points = [];
        for (let s = 0; s < segments.length; s++) {
            const seg = segments[s];
            for (let i = 0; i < seg.length; i++) {
                points.push({
                    x: seg[i][0] * scale,
                    y: -seg[i][1] * scale,
                    segmentStart: i === 0 && points.length > 0
                });
            }
        }
        // Always forward — including empty frames. When the SVG has no on-screen
        // elements, renderTrace parks a blank frame so the projector clears
        // instead of looping the last non-empty frame.
        laserRenderer.renderTrace({
            points,
            speeds: null,
            basePower: 1.0,
            velocityDimming: 0
        });
    }

    // Calibration mode: continuously send test pattern
    let calibrationRunning = false;
    $effect(() => {
        if (laserMode === 'calibration' && laserRenderer && laserConnected) {
            calibrationRunning = true;
            laserRenderer.setEnabled(true);
            async function calibrationLoop() {
                while (calibrationRunning) {
                    await laserRenderer.showTestPattern();
                    await new Promise(r => setTimeout(r, 16));
                }
            }
            calibrationLoop();
        } else {
            calibrationRunning = false;
        }
        return () => {
            calibrationRunning = false;
        };
    });
</script>

<ViewSelector 
    bind:currentView 
    {laserConnected}
    onLaserClick={handleLaserClick}
/>

<div id="app-container">
    <!-- Left Side: Generator -->
    <div class="left-side">
        <Generator {audioEngine} {start} {stop} onLaserFrame={laserConnected && laserMode === 'generator' ? handleLaserFrame : null} />
    </div>

    <!-- Right Side: Oscilloscope (always mounted) -->
    <div class="right-side">
        <Oscilloscope
            generatorInput={audioEngine}
            laserOutput={laserConnected && laserMode === 'scope'}
            onLaserData={handleLaserData}
            showWebcam={currentView === 'webcam'}
        />
    </div>
</div>

{#if laserConnected}
    <LaserControls
        {laserRenderer}
        {laserMode}
        onModeChange={(mode) => laserMode = mode}
        onDisconnect={handleLaserClick}
    />
{/if}

<style>
    #app-container {
        display: flex;
        height: 100vh;
    }

    .left-side,
    .right-side {
        flex: 1;
        min-width: 0;
        overflow: hidden;
    }
</style>

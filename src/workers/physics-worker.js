// Physics simulation and rendering worker with OffscreenCanvas
let beamX = 0;
let beamY = 0;
let velocityX = 0;
let velocityY = 0;
let offscreenCanvas = null;
let ctx = null;

// FPS tracking
let lastFrameTime = performance.now();
let fps = 0;
let frameCount = 0;
let fpsUpdateTime = performance.now();

self.onmessage = function(e) {
    const { type, data } = e.data;

    if (type === 'init') {
        // Receive the OffscreenCanvas
        offscreenCanvas = data.canvas;
        ctx = offscreenCanvas.getContext('2d');
        return;
    }

    if (type === 'reset') {
        beamX = 0;
        beamY = 0;
        velocityX = 0;
        velocityY = 0;
        return;
    }

    if (type === 'render') {
        const {
            leftData,
            rightData,
            centerX,
            centerY,
            scale,
            forceMultiplier,
            damping,
            mass,
            signalNoise,
            basePower,
            persistence,
            velocityDimming,
            canvasWidth,
            canvasHeight
        } = data;

        if (!ctx) return;

        // Clear canvas with adjustable fade effect for persistence
        ctx.fillStyle = `rgba(0, 0, 0, ${1 - persistence})`;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Draw grid
        drawGrid(ctx, centerX, centerY, canvasWidth, canvasHeight);

        // Calculate physics and render
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        let prevX = null;
        let prevY = null;

        for (let i = 0; i < leftData.length; i++) {
            // Add noise to audio signal if enabled
            let leftSignal = leftData[i];
            let rightSignal = rightData[i];

            if (signalNoise > 0) {
                leftSignal += (Math.random() - 0.5) * signalNoise;
                rightSignal += (Math.random() - 0.5) * signalNoise;
            }

            // Target position from audio data (with noise)
            const targetX = leftSignal * scale;
            const targetY = -rightSignal * scale;

            // Calculate force (like a spring pulling beam to target)
            const forceX = (targetX - beamX) * forceMultiplier;
            const forceY = (targetY - beamY) * forceMultiplier;

            // Calculate acceleration (F = ma, so a = F/m)
            const accelX = forceX / mass;
            const accelY = forceY / mass;

            // Update velocity
            velocityX += accelX;
            velocityY += accelY;

            // Apply damping (friction/air resistance)
            velocityX *= damping;
            velocityY *= damping;

            // Update position
            beamX += velocityX;
            beamY += velocityY;

            // Convert to screen coordinates
            const screenX = centerX + beamX;
            const screenY = centerY + beamY;

            // Calculate velocity-based opacity (fast beam = dimmer)
            if (prevX !== null && prevY !== null) {
                const dx = screenX - prevX;
                const dy = screenY - prevY;
                const speed = Math.sqrt(dx * dx + dy * dy);

                // Apply gradual exponential falloff based on speed
                let velocityOpacity = 1.0;

                if (velocityDimming > 0 && speed > 0) {
                    // More gradual falloff: starts dimming gradually from speed=0
                    // velocityDimming scales the effect (0=no dimming, 1=max dimming)
                    const falloffRate = 20; // Higher = more gradual transition
                    const dimFactor = Math.exp(-speed / falloffRate);

                    // Blend between no dimming (1.0) and dimmed based on velocityDimming
                    velocityOpacity = 1.0 - velocityDimming * (1.0 - dimFactor);

                    // Set minimum opacity based on dimming amount
                    const minOpacity = 0.02 * velocityDimming;
                    velocityOpacity = Math.max(velocityOpacity, minOpacity);
                }

                const finalOpacity = basePower * velocityOpacity;
                ctx.strokeStyle = `rgba(76, 175, 80, ${finalOpacity})`;

                // Draw line segment
                ctx.beginPath();
                ctx.moveTo(prevX, prevY);
                ctx.lineTo(screenX, screenY);
                ctx.stroke();
            }

            prevX = screenX;
            prevY = screenY;
        }

        // Calculate FPS
        const currentTime = performance.now();
        frameCount++;

        // Update FPS every 500ms
        if (currentTime - fpsUpdateTime >= 500) {
            fps = Math.round((frameCount * 1000) / (currentTime - fpsUpdateTime));
            frameCount = 0;
            fpsUpdateTime = currentTime;
        }

        // Draw FPS indicator
        ctx.fillStyle = '#4CAF50';
        ctx.font = '14px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${fps} FPS`, canvasWidth - 10, 20);

        lastFrameTime = currentTime;

        // Send ready message back to main thread
        self.postMessage({ type: 'ready' });
    }
};

function drawGrid(ctx, centerX, centerY, width, height) {
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;

    // Draw center crosshair
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, height);
    ctx.stroke();

    // Draw circle guide
    const radius = Math.min(width, height) / 2.5;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.stroke();
}

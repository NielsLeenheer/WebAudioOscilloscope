// Physics simulation worker
let beamX = 0;
let beamY = 0;
let velocityX = 0;
let velocityY = 0;

self.onmessage = function(e) {
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
        reset
    } = e.data;

    // Reset physics state if requested
    if (reset) {
        beamX = 0;
        beamY = 0;
        velocityX = 0;
        velocityY = 0;
    }

    const points = [];
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
        let opacity = basePower;

        if (prevX !== null && prevY !== null) {
            const dx = screenX - prevX;
            const dy = screenY - prevY;
            const speed = Math.sqrt(dx * dx + dy * dy);

            // Apply exponential falloff based on speed
            const speedThreshold = 10;
            let velocityOpacity;

            if (speed <= speedThreshold) {
                velocityOpacity = 1.0;
            } else {
                const excessSpeed = speed - speedThreshold;
                const falloffRate = 8;
                velocityOpacity = Math.exp(-excessSpeed / falloffRate);
                velocityOpacity = Math.max(velocityOpacity, 0.02);
            }

            opacity = basePower * velocityOpacity;
        }

        points.push({
            x: screenX,
            y: screenY,
            opacity: opacity
        });

        prevX = screenX;
        prevY = screenY;
    }

    // Send results back to main thread
    self.postMessage({
        points: points,
        beamState: { beamX, beamY, velocityX, velocityY }
    });
};

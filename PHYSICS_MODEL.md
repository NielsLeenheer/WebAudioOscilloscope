# Oscilloscope Physics Model

This document explains the physics simulation models used in the Web Audio Oscilloscope to create realistic CRT (Cathode Ray Tube) oscilloscope behavior.

## Overview

The oscilloscope simulates an electron beam being deflected by electromagnetic coils to trace a waveform on a phosphor screen. Two physics models are implemented:

1. **Electromagnetic Model** (default) - Physically accurate CRT simulation
2. **Spring-Damper Model** (backup) - Simplified mechanical analogy

## Electromagnetic Model

This is the primary model, simulating how a real CRT oscilloscope works with electron beams and electromagnetic deflection.

### Physical Principles

In a real CRT oscilloscope:
- An electron gun emits a focused beam of electrons
- Horizontal and vertical deflection coils create magnetic fields
- These fields deflect the electron beam to trace the waveform
- The beam has inertia and overshoots targets due to its velocity
- Residual gas in the tube causes damping
- Without deflection, the beam naturally aims at the screen center
- Phosphor on the screen glows when struck by electrons

### Step-by-Step Simulation

#### 1. Calculate Deflection Force

For each target point on the waveform:

```javascript
forceX = (targetX - currentBeamX) × coilStrength
forceY = (targetY - currentBeamY) × coilStrength
```

**Parameters:**
- `coilStrength` (default: 0.32) - Strength of the electromagnetic field
- Higher values = stronger deflection force = more responsive beam
- Lower values = weaker deflection = slower, more sluggish response

#### 2. Calculate Acceleration

Using Newton's second law (F = ma, therefore a = F/m):

```javascript
accelerationX = forceX / beamInertia
accelerationY = forceY / beamInertia
```

**Parameters:**
- `beamInertia` (default: 0.06) - Effective mass of the electron beam
- Higher values = more inertia = slower response, more overshoot
- Lower values = less inertia = snappier response, less overshoot

#### 3. Update Velocity

The beam velocity changes according to the acceleration:

```javascript
velocityX += accelerationX
velocityY += accelerationY
```

This accumulation of velocity is what causes **overshoot behavior** - the beam continues moving past the target due to its momentum.

#### 4. Apply Field Damping

Damping represents interaction with residual gas in the CRT:

```javascript
velocityX × fieldDamping
velocityY × fieldDamping
```

**Parameters:**
- `fieldDamping` (default: 0.44) - Energy loss per frame (0-1 scale)
- Higher values (closer to 1.0) = less damping = more oscillation
- Lower values (closer to 0.0) = more damping = faster settling

#### 5. Update Beam Position

```javascript
beamX += velocityX
beamY += velocityY
```

The beam position changes according to its current velocity.

#### 6. Apply Smoothing

To prevent jitter and create realistic beam behavior:

```javascript
smoothedBeamX = 0.6 × beamX + 0.4 × previousSmoothedBeamX
smoothedBeamY = 0.6 × beamY + 0.4 × previousSmoothedBeamY
```

The 0.6 smoothing factor allows more responsiveness compared to the spring-damper model (0.4), showing more realistic overshoot and self-correction.

### Behavior Characteristics

**Why This Model is Accurate:**
- Simulates actual electromagnetic deflection physics
- Beam inertia causes natural overshoot (visible in fast transients)
- Self-correcting behavior as deflection force opposes velocity
- Without deflection input, beam naturally settles to center
- Responds to parameter changes like a real CRT

## Spring-Damper Model (Legacy)

A simplified mechanical analogy model, kept as backup.

### Physical Analogy

Imagine the beam position is connected to the target by a spring:
- Spring pulls beam toward target
- Mass resists rapid changes
- Damping removes energy

### Step-by-Step Simulation

#### 1. Calculate Spring Force

```javascript
forceX = (targetX - currentBeamX) × springForce
forceY = (targetY - currentBeamY) × springForce
```

**Parameters:**
- `springForce` (default: 0.3) - Spring stiffness
- Higher = stronger pull toward target

#### 2. Calculate Acceleration

```javascript
accelerationX = forceX / springMass
accelerationY = forceY / springMass
```

**Parameters:**
- `springMass` (default: 0.11) - Inertial mass
- Higher = more sluggish response

#### 3. Update Velocity with Damping

```javascript
velocityX = (velocityX + accelerationX) × springDamping
velocityY = (velocityY + accelerationY) × springDamping
```

**Parameters:**
- `springDamping` (default: 0.60) - Energy dissipation (0-1)
- Lower = more damping

#### 4. Update and Smooth Position

```javascript
beamX += velocityX
beamY += velocityY

smoothedBeamX = 0.4 × beamX + 0.6 × previousSmoothedBeamX
smoothedBeamY = 0.4 × beamY + 0.6 × previousSmoothedBeamY
```

More smoothing (0.4) than electromagnetic model to compensate for less realistic physics.

## Phosphor Excitation Model

Both physics models share the same phosphor excitation simulation, which determines how bright the trace appears based on beam behavior.

### Physical Principles

Real oscilloscope phosphor (P31 standard):
- Glows when struck by high-energy electrons
- Brightness depends on energy deposited
- Fast-moving beam deposits less energy per pixel (lower dwell time)
- Slow-moving or stationary beam deposits more energy (higher dwell time)
- Phosphor saturates at high energy levels (logarithmic response)

### Step-by-Step Calculation

#### 1. Calculate Frame-Rate Independent Velocity

```javascript
velocity = speed / deltaTime  // pixels per second
```

Where:
- `speed` = distance moved between points (pixels)
- `deltaTime` = time between frames (seconds)

This ensures consistent physics regardless of frame rate (60fps, 120fps, etc.).

#### 2. Calculate Energy Deposition Factor

```javascript
REFERENCE_VELOCITY = 500  // pixels/second
BEAM_SPOT_SIZE = 1.5      // pixels

if (velocity < BEAM_SPOT_SIZE) {
    // Stationary or very slow: maximum excitation
    energyFactor = 1.0
} else {
    // Energy inversely proportional to velocity
    energyFactor = REFERENCE_VELOCITY / velocity

    // Clamp to 2-100% range
    energyFactor = max(0.02, min(1.0, energyFactor))
}
```

**Key Points:**
- Below ~2 px/s: Full brightness (beam dwelling)
- At 500 px/s: Normal brightness (reference)
- Above 500 px/s: Progressive dimming
- Never dimmer than 2% (even at extreme speeds)

**Why This Works:**
- Practical speeds for oscilloscope (100-10,000 px/s)
- Visible dimming effect on fast-moving traces
- Realistic representation of energy transfer physics

#### 3. Apply Velocity Dimming Control

```javascript
if (velocityDimming < 1.0) {
    // Mix between full physics and no dimming
    depositedEnergy = beamCurrent × (velocityDimming × energyFactor + (1 - velocityDimming))
} else {
    depositedEnergy = beamCurrent × energyFactor
}
```

**Parameters:**
- `beamPower` (default: 0.75) - Electron beam current
- `velocityDimming` (default: 1.0) - Physics effect strength
  - 1.0 = Full physics-based dimming
  - 0.0 = No velocity dimming (constant brightness)
  - 0.5 = Half effect (artistic control)

#### 4. Apply Phosphor Saturation Curve

Real phosphor doesn't respond linearly - it saturates at high energy:

```javascript
SATURATION_KNEE = 0.6
SATURATION_STRENGTH = 0.4
k = 10.0

if (depositedEnergy < SATURATION_KNEE) {
    // Linear region
    brightness = depositedEnergy
} else {
    // Logarithmic saturation region
    excess = depositedEnergy - SATURATION_KNEE
    compressed = log(1 + excess × k) / log(1 + k)
    brightness = SATURATION_KNEE + compressed × SATURATION_STRENGTH
}
```

**Saturation Behavior:**
- Below 60% energy: Linear response
- Above 60% energy: Compressed (logarithmic) response
- Maximum brightness: 100% (1.0)
- Prevents unrealistic "super bright" pixels

## Common Parameters

These parameters are shared by both physics models:

### Persistence
**Default:** 0.100

Controls how long the phosphor glow persists after the beam passes:
- Higher = longer afterglow (classic scope look)
- Lower = sharper, more defined trace
- Range: 0.0 (instant decay) to 1.0 (very slow decay)

### Signal Noise
**Default:** 0.005

Adds realistic electronic noise to the beam position:
- Simulates real-world signal noise and beam instability
- Higher = more visible jitter
- Too high = obscures signal

### Focus
**Default:** 0.2

Controls beam spot size and sharpness:
- Lower = tighter focus, sharper trace
- Higher = softer focus, more glow
- Affects visual aesthetics, not physics

### Decay
**Default:** 512

Alpha channel decay rate for fading traces:
- Lower = faster fade to black
- Higher = longer visible trails
- Works with persistence for overall trace behavior

## Frame Rate Independence

All physics calculations use `deltaTime` to ensure consistent behavior across different frame rates:

```javascript
deltaTime = (currentFrameTime - lastFrameTime) / 1000  // seconds
```

**Why This Matters:**
- 60fps device: deltaTime ≈ 0.0167s
- 120fps device: deltaTime ≈ 0.0083s
- Physics behaves identically on both

**Usage:**
- Velocity calculations: `velocity = distance / deltaTime`
- Integration: Position and velocity updates remain frame-rate independent
- Ensures consistent dimming and phosphor effects

## Parameter Tuning Guide

### For More Overshoot (Electromagnetic Model)
- Increase `beamInertia` (more mass = more overshoot)
- Increase `coilStrength` (stronger force = faster acceleration = more overshoot)
- Increase `fieldDamping` closer to 1.0 (less energy loss)

### For Faster Response
- Decrease `beamInertia` (less mass = quicker response)
- Increase `coilStrength` (stronger deflection)
- Decrease `fieldDamping` (more damping = faster settling)

### For More Realistic CRT Look
- Increase `persistence` (longer afterglow)
- Adjust `velocityDimming` to 1.0 (full physics)
- Add `signalNoise` around 0.005-0.01
- Adjust `focus` for desired beam sharpness

### For Arcade/Retro Look
- Decrease `persistence` (sharper, more defined)
- Lower `velocityDimming` (less dimming = brighter)
- Lower `signalNoise` (cleaner signal)

## Implementation Details

### Code Location

- **Physics Worker:** `/src/workers/physics-worker.js`
  - `simulatePhysicsElectromagnetic()` (lines 276-353)
  - `simulatePhysicsSpring()` (lines 212-270)
  - `calculatePhosphorExcitation()` (lines 50-119)
  - `renderTrace()` (lines 371+)

- **Display Component:** `/src/components/Oscilloscope/Display.svelte`
  - Parameter definitions and defaults
  - Mode selection (`simulationMode`)

- **Visualizer:** `/src/components/Oscilloscope/Visualiser.svelte`
  - Frame timing (`deltaTime` calculation)
  - Worker communication

- **Physics Dialog:** `/src/components/Oscilloscope/PhysicsDialog.svelte`
  - UI for parameter adjustment
  - Mode toggle (currently hidden)

### Web Worker Architecture

The physics simulation runs in a Web Worker (`physics-worker.js`) to:
- Keep heavy calculations off the main thread
- Maintain 60fps animation smoothness
- Use OffscreenCanvas for rendering
- Prevent UI blocking during complex simulations

## Comparison: Electromagnetic vs Spring-Damper

| Aspect | Electromagnetic | Spring-Damper |
|--------|----------------|---------------|
| **Accuracy** | Physically accurate CRT | Mechanical analogy |
| **Overshoot** | Natural, velocity-based | Simulated via mass |
| **Self-correction** | True electromagnetic behavior | Spring restoring force |
| **Responsiveness** | More realistic (0.6 smoothing) | More smoothed (0.4) |
| **Default Mode** | Yes (active) | No (backup) |
| **Parameters** | Coil Strength, Beam Inertia, Field Damping | Force, Mass, Damping |
| **Use Case** | Realistic CRT simulation | Simplified alternative |

## Future Improvements

Possible enhancements to consider:
- Temperature-dependent phosphor decay
- Beam current variation with velocity
- Multiple phosphor types (P1, P7, P31, etc.)
- Electromagnetic field non-linearity
- Screen edge effects (beam distortion)
- Astigmatism and focus depth
- Color phosphor mixing for vintage scopes

## References

- P31 Phosphor characteristics (medium persistence, green emission)
- CRT electron beam physics
- Electromagnetic deflection in oscilloscopes
- Phosphor excitation and decay mechanisms

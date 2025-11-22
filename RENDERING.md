# Rendering Pipeline Documentation

This document explains how the oscilloscope rendering system works, focusing on the phosphor emulation and beam rendering.

## Architecture Overview

The rendering system is the final stage in a three-stage pipeline:

1. **Signal Processing** - Add noise to raw audio data
2. **Physics Simulation** - Calculate beam position using spring or electromagnetic models
3. **Rendering** - Draw the beam path to canvas with phosphor effects

## Rendering Models

The system supports two rendering modes (selectable via the Physics dialog):

- **Phosphor** (default) - Realistic CRT phosphor emulation
- **Alternative** (placeholder) - Currently mirrors phosphor, reserved for future experimentation

### Rendering Dispatcher

Located in `src/workers/physics-worker.js:518-525`, the dispatcher routes to the appropriate rendering function based on `renderingMode`:

```javascript
function renderTrace(ctx, points, speeds, velocityDimming, basePower, deltaTime, renderingMode) {
    if (renderingMode === 'alternative') {
        return renderTraceAlternative(ctx, points, speeds, velocityDimming, basePower, deltaTime);
    } else {
        return renderTracePhosphor(ctx, points, speeds, velocityDimming, basePower, deltaTime);
    }
}
```

## Phosphor Rendering Model

### Overview

The phosphor model (`renderTracePhosphor`, lines 429-503) emulates realistic CRT oscilloscope behavior by:

1. Drawing smooth Bézier curves between points
2. Calculating phosphor excitation based on beam velocity
3. Applying gradual opacity transitions
4. Modeling P31 phosphor saturation characteristics

### Key Components

#### 1. Smooth Curve Generation

The renderer uses quadratic Bézier curves to create smooth transitions between points:

- **First segment**: Straight line from first point to first midpoint
- **Middle segments**: Curves from midpoint to midpoint through actual points
- **Last segment**: Straight line from last midpoint to last point

This creates a continuous, smooth trace without sharp corners.

#### 2. Sub-segmentation

Each Bézier curve is split into multiple sub-segments (1-8) for gradual opacity transitions:

```javascript
const MAX_SUBSEGMENTS = 8;
const MIN_SUBSEGMENT_LENGTH = 4; // Minimum pixels per sub-segment
```

The number of sub-segments is calculated based on curve length to ensure smooth gradients without excessive overhead.

#### 3. Phosphor Excitation Calculation

The `calculatePhosphorExcitation` function (lines 55-119) models realistic phosphor behavior:

**Input Parameters:**
- `speed` - Beam velocity in pixels/frame
- `velocityDimming` - User control (0-1) for artistic adjustment
- `basePower` - Beam current/intensity
- `deltaTime` - Frame delta time in seconds

**Physical Model:**

The function implements a physics-based model of phosphor excitation:

```
Energy Deposition = Beam Current × Dwell Time
```

**Dwell Time Model:**
- Reference velocity: 500 pixels/second (where dimming becomes noticeable)
- Below reference: Full phosphor excitation
- Above reference: Reduced excitation (inversely proportional to velocity)
- Minimum threshold: 2% even at extreme speeds

**Velocity Dimming Control:**

Allows artistic adjustment between full physics (`velocityDimming = 1.0`) and no dimming (`velocityDimming = 0.0`):

```javascript
depositedEnergy = beamCurrent * (velocityDimming * energyFactor + (1.0 - velocityDimming))
```

**P31 Phosphor Saturation:**

Real phosphors have a logarithmic response at high excitation levels. The model uses:

- Saturation knee: 0.6 (energy level where saturation starts)
- Saturation strength: 0.4 (compression aggressiveness)
- Logarithmic compression: `log(1 + energy × k) / log(1 + k)` where k=10

This prevents unrealistic brightness at low velocities while maintaining physical accuracy.

#### 4. Opacity Interpolation

Opacity transitions use an ease-in-quartic function (`easeInQuartic`, line 20):

```javascript
function easeInQuartic(t) {
    return t * t * t * t;
}
```

This mimics physics behavior where magnetic force takes time to overcome inertia, creating:
- Slow start with delay
- Rapid acceleration
- Smooth visual transitions

### Canvas Configuration

```javascript
ctx.lineWidth = 1.5;
ctx.lineCap = 'butt';    // Prevents overlapping at connection points
ctx.lineJoin = 'round';
```

The `'butt'` cap style is critical to avoid opacity artifacts at segment connections.

## Rendering Parameters

### User-Controllable Parameters

1. **Persistence** (0.0 - 0.95)
   - Controls phosphor afterglow/fade effect
   - Applied as canvas fade: `rgba(26, 31, 26, ${1 - persistence})`
   - 0 = instant fade, 0.95 = long trail

2. **Dimming** (0.0 - 1.0)
   - Labeled as "Velocity Dimming"
   - 0 = no velocity-based dimming (constant brightness)
   - 1 = full physics-based dimming

3. **Decay** (128 - 16384)
   - Maximum points to render
   - Controls phosphor decay/overdraw
   - Only affects XY mode (prevents buffer overload)

### Internal Parameters

- **Beam Power** (`beamPower`, 0.0 - 1.0)
  - Controlled via oscilloscope front panel
  - Affects opacity: `basePower = 0.2 + (beamPower × 1.4)` (max 3.0)

- **Focus** (`focus`, -1.0 to 1.0)
  - Applied as CSS blur filter: `blur(${Math.abs(focus) × 3}px)`
  - Not part of rendering pipeline, applied to canvas element

## Frame-by-Frame Rendering Process

### 1. Canvas Preparation

Clear canvas with persistence fade:

```javascript
ctx.fillStyle = `rgba(26, 31, 26, ${1 - persistence})`;
ctx.fillRect(0, 0, canvasWidth, canvasHeight);
```

### 2. For Each Mode (A, B, or AB)

a. **Beam Teleportation**
   - Snap beam to first target point
   - Prevents spurious lines from previous frame

b. **Physics Simulation**
   - Calculate smoothed beam positions
   - Generate points array and speeds array

c. **Rendering**
   - Iterate through points
   - Calculate Bézier curves
   - Split into sub-segments
   - Calculate phosphor excitation for each sub-segment
   - Draw with interpolated opacity

### 3. Worker Synchronization

Send ready message back to main thread when frame is complete.

## Color System

Currently hardcoded to green phosphor:

```javascript
ctx.strokeStyle = `rgba(76, 175, 80, ${opacity})`;
```

This represents P31 phosphor (green), commonly used in oscilloscopes.

## Alternative Rendering Model

The alternative model (`renderTraceAlternative`, lines 508-512) is currently a placeholder:

```javascript
function renderTraceAlternative(ctx, points, speeds, velocityDimming, basePower, deltaTime) {
    // Currently identical to phosphor model
    // This will be customized later for different rendering approach
    renderTracePhosphor(ctx, points, speeds, velocityDimming, basePower, deltaTime);
}
```

This is intentionally left empty for future experimentation with different rendering techniques while maintaining the dual-model architecture.

## Performance Considerations

1. **OffscreenCanvas**
   - All rendering happens in a Web Worker
   - Canvas control transferred via `transferControlToOffscreen()`
   - Keeps main thread responsive

2. **Adaptive Sub-segmentation**
   - Longer curves get more sub-segments
   - Prevents excessive drawing overhead
   - Maintains smooth gradients

3. **Frame Skipping**
   - Worker busy flag prevents frame overlap
   - Drops frames if worker is still processing

4. **Curve Estimation**
   - Length estimation uses 10 samples
   - Balance between accuracy and performance

## Future Development

The alternative rendering model could explore:

- Different phosphor types (P7, P11, etc.)
- Bloom/glow effects
- Point-based rendering instead of curves
- Different opacity calculation methods
- HDR rendering techniques
- Scanline effects

The dual-model architecture makes experimentation safe - the phosphor model remains functional while new approaches are developed.

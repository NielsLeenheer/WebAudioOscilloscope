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

**Dwell Time Model (Recalibrated):**
- Reference velocity: **200 pixels/second** (lowered from 500 for earlier dimming)
- Below reference: Full phosphor excitation
- Above reference: Reduced excitation (inversely proportional to velocity)
- **Squared dimming curve**: `energyFactor = (200/velocity)²` for aggressive dimming
- Minimum threshold: **0.1%** (down from 2%) - fast movements almost invisible
- Matches real oscilloscope behavior where fast beam movements are barely visible

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

The alternative model (`renderTraceAlternative`, lines 508-563) implements **time-based segmentation**, a fundamentally different approach from the phosphor model's spatial segmentation.

### Time-Based Segmentation Concept

Instead of segmenting based on spatial distance (curve length), the alternative model segments based on **fixed time intervals**:

- **Fast beam movement** → Points are spread out spatially within a time segment
- **Slow beam movement** → Points are clustered closer together within a time segment

This models the beam as having a constant "temporal quantum" - each drawn segment represents the same amount of time, regardless of how far the beam traveled.

### Implementation Details

**Fixed Time Quantum:**
```javascript
const TIME_SEGMENT = 0.0001; // 0.1ms per segment
```

Each rendered segment represents 0.1 milliseconds of beam movement (2.5x higher temporal resolution than previous version).

**Time Calculation:**
```javascript
const timePerPoint = 1 / sampleRate;
```

Since each point corresponds to one audio sample from the physics simulation, the time between consecutive points is `1 / sampleRate` (e.g., ~20.8µs at 48kHz sample rate).

**Segmentation Algorithm:**

**First Pass - Direction Change Detection:**
1. Scan through all points to detect local velocity minima
2. Mark points where speed < previous AND speed < next AND speed < 5 px/frame
3. For each detected point, calculate the angle of direction change:
   - Incoming velocity vector: from point[i-1] to point[i]
   - Outgoing velocity vector: from point[i] to point[i+1]
   - Angle = arccos(dot product / (magnitude1 × magnitude2))
4. Map angle to brightness using power curve:
   - 0° = no brightness (no direction change)
   - 180° = maximum brightness (complete reversal)
   - Formula: `brightness = (angle/180)^1.5`
5. Filter out dots with brightness < 0.05 (angles < ~30°)

**Second Pass - Segment Rendering:**
1. Start at first point, initialize time accumulator to 0
2. Iterate through points, accumulating time (`timePerPoint` per point)
3. When accumulated time reaches `TIME_SEGMENT` (0.1ms), finalize the segment:
   - Calculate average speed for the segment (total distance / number of points)
   - Calculate opacity using phosphor excitation model (faster = dimmer)
   - Draw straight lines connecting all points in the segment
4. Reset accumulator and continue from current point

**Third Pass - Direction Change Highlighting:**
1. Draw dots (radius 1.5px) at all detected direction change points
2. Opacity = `basePower × brightness` where brightness is based on angle:
   - 180° direction change → full brightness (complete reversal)
   - Small angles (< 30°) → no visible dot
   - Power curve (^1.5) emphasizes larger angles
3. Simulates realistic beam dwell time: sharper turns = longer dwell = brighter dots
4. Matches behavior observed on real scopes where waveform peaks are brightest

**Opacity Calculation:**

The alternative model uses the same physics-based phosphor excitation model as the phosphor renderer:

```javascript
const avgSpeed = totalDistance / Math.max(1, i - segmentStartIdx);
const opacity = calculatePhosphorExcitation(avgSpeed, velocityDimming, basePower, deltaTime);
```

**Key Characteristics:**
- **Faster = dimmer** (less dwell time, less phosphor excitation)
- **Slower = brighter** (more dwell time, more phosphor excitation)
- Uses the same P31 phosphor saturation model as the phosphor renderer
- Each time segment has a single, uniform opacity based on average speed

This creates distinct visual "quanta" where each time segment has uniform brightness based on its average speed, following the same physics as the phosphor model but applied to time-based segments instead of spatial curves.

### Visual Characteristics

The time-based approach produces different visual effects compared to phosphor rendering:

1. **Spatial Variation**
   - Fast movements create longer segments (more pixels per 0.1ms)
   - Slow movements create shorter segments (fewer pixels per 0.1ms)
   - Segment length varies with beam velocity
   - High temporal resolution (0.1ms quanta) captures fine detail

2. **Physics-Based Opacity**
   - Fast segments are **dimmer** (same as phosphor physics)
   - Slow segments are brighter (more dwell time)
   - Uses P31 phosphor excitation model with saturation curve
   - Each time segment has constant opacity (no gradients within segment)
   - Creates a more "quantized" appearance with temporal segmentation

3. **Drawing Style**
   - Uses straight lines (`lineTo`) instead of Bézier curves
   - `lineCap: 'round'` softens segment endpoints
   - Simpler rendering path, potentially faster

4. **Direction Change Highlighting**
   - Dots appear at beam reversal points with angle-based brightness
   - Brightness proportional to direction change angle:
     - 180° (complete reversal) = brightest
     - 30° or less = invisible
     - Power curve (^1.5) for natural falloff
   - Simulates realistic dwell time: sharper turns = longer dwell
   - Matches behavior observed on real oscilloscopes where peaks are brightest
   - Detection: local velocity minima (speed < 5 px/frame) + angle calculation

### Comparison: Phosphor vs Alternative

| Aspect | Phosphor Model | Alternative Model |
|--------|----------------|-------------------|
| Segmentation basis | Spatial (curve length) | Temporal (0.1ms quanta) |
| Segment length | Variable by curve estimation | Variable by beam velocity |
| Opacity variation | Smooth gradients (ease-in) | Uniform per segment |
| Opacity/speed curve | Faster = dimmer (physics) | Faster = dimmer (same physics) |
| Drawing primitive | Quadratic Bézier curves | Straight lines |
| Sub-segmentation | Adaptive (1-8 sub-segments) | None (one segment = one draw call) |
| Direction highlights | None | Bright dots at reversals |
| Visual style | Smooth, organic | Quantized, temporal |

### Use Cases

The alternative model may be more suitable for:
- Visualizing temporal patterns in the signal
- Creating a more "digital" or "sampled" aesthetic
- Performance optimization (fewer draw calls)
- Emphasizing velocity changes over time

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

The dual-model architecture makes experimentation safe - the phosphor model remains functional while new approaches are developed in the alternative model.

### Potential Enhancements for Alternative Model

- **Adjustable time quantum**: Make `TIME_SEGMENT` a user-controllable parameter
- **Gradient within segments**: Interpolate opacity across points within each time segment
- **Temporal patterns**: Add visual effects based on time-domain characteristics
- **Segment styling**: Different visual treatments for different velocity ranges

### Other Rendering Possibilities

Both models could explore:
- Different phosphor types (P7, P11, etc.) with varying persistence characteristics
- Bloom/glow effects for overdriven signals
- HDR rendering techniques
- Color variations based on velocity or signal amplitude
- Scanline effects for enhanced CRT realism
